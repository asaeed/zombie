import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('js/art.js', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('assets/rigged-full/manifest.json', root)));
const registry = JSON.parse(readFileSync(new URL('assets/art-packs/registry.json', root)));
const sizes = new Map();
for (const meta of [...Object.values(manifest.characters), ...Object.values(manifest.objects), manifest.terrain]) {
  const file = new URL(meta.image, new URL('assets/rigged-full/', root));
  const data = readFileSync(file);
  sizes.set(new URL(meta.image, 'http://game.test/assets/rigged-full/manifest.json').href,
    [data.readUInt32BE(16), data.readUInt32BE(20)]);
}

function runtime(search = '', stored = 'rigged') {
  const storage = new Map([['dead-zone-rts:auto', 'unchanged game save'], ['dead-zone-rts:art-pack', stored]]);
  const controls = {registryFailure: false, failure: null, gate: null, manifest: structuredClone(manifest)};
  const requests = [], images = [], progress = [];
  class FakeImage {
    set src(value) {this.url = value; images.push(value);}
    async decode() {
      if (controls.gate && this.url.endsWith('/soldier.png')) await controls.gate;
      if (controls.failure && this.url.endsWith(controls.failure)) throw new Error('Decode failed');
      [this.naturalWidth, this.naturalHeight] = sizes.get(this.url);
    }
  }
  const context = vm.createContext({window: {location: {search, href: 'http://game.test/' + search}},
    URL, URLSearchParams, Image: FakeImage, CustomEvent: class {constructor(type) {this.type = type;}},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)}});
  vm.runInContext(source, context);
  const evaluate = code => vm.runInContext(code, context);
  context.window.dispatchEvent = () => progress.push(JSON.parse(evaluate('JSON.stringify(ART_PACK_STATE.progress)')));
  context.window.history = {replaceState: (_state, _title, url) => {
    context.window.location.href = String(url); context.window.location.search = url.search;
  }};
  context.document = {baseURI: 'http://game.test/', createElement: () => ({getContext: () => ({drawImage() {},
    getImageData: () => ({data: new Uint8Array(4)})})})};
  context.fetch = async (url, options) => {
    requests.push({url: url.href, options});
    const isRegistry = url.pathname.endsWith('/registry.json');
    return {ok: !(isRegistry && controls.registryFailure), status: 503,
      json: async () => isRegistry ? registry : controls.manifest};
  };
  return {evaluate, controls, storage, requests, images, progress};
}

test('only the final, self-contained skin is registered and no pilot starts loading', () => {
  assert.equal(registry.default, 'rigged'); assert.equal(registry.packs.length, 1);
  const r = runtime('?artPilot=horror'); assert.deepEqual(r.images, []);
  for (const meta of [...Object.values(manifest.characters), ...Object.values(manifest.objects), manifest.terrain]) {
    const path = new URL(meta.image, 'http://game.test/assets/rigged-full/manifest.json').pathname;
    assert.ok(path.startsWith('/assets/rigged-full/'), path);
  }
});

test('readiness and decoded progress wait for the last image, publishing the skin atomically', async () => {
  const r = runtime(); let finish;
  r.controls.gate = new Promise(resolve => {finish = resolve;});
  const boot = r.evaluate('startArtPacks()');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(r.evaluate('ART_PACK_STATE.progress.total'), 33);
  assert.equal(r.evaluate('ART_PACK_STATE.progress.loaded'), 32);
  assert.equal(r.evaluate('SCULPTED_WORLD.ready'), false);
  assert.equal(r.evaluate('SCULPTED_WORLD.characters.size'), 0);
  finish(); assert.equal(await boot, true);
  assert.equal(r.evaluate('SCULPTED_WORLD.ready'), true);
  assert.equal(r.evaluate('SCULPTED_WORLD.characters.size'), 18);
  assert.equal(r.evaluate('SCULPTED_WORLD.objects.size'), 14);
  assert.equal(r.evaluate('ART_PACK_STATE.progress.loaded'), 33);
  const counts = r.progress.filter(p => p.total === 33).map(p => p.loaded);
  assert.ok(counts.every((n, i) => !i || n >= counts[i - 1]));
});

test('old preferences and pilot URLs migrate to final art without changing the game save', async () => {
  for (const [search, stored] of [['', 'classic'], ['?artPack=brushwork', 'sculpted'], ['?artPilot=horror', 'brushwork-layered']]) {
    const r = runtime(search, stored); await r.evaluate('startArtPacks()');
    assert.equal(r.evaluate('ART_PACK_STATE.active'), 'rigged');
    assert.equal(r.storage.get('dead-zone-rts:art-pack'), 'rigged');
    assert.equal(r.storage.get('dead-zone-rts:auto'), 'unchanged game save');
    assert.ok(!r.evaluate('window.location.search').includes('artPilot'));
    assert.ok(r.images.every(url => url.includes('/assets/rigged-full/')));
  }
});

test('registry failure blocks boot rather than silently loading fallback artwork and can retry', async () => {
  const r = runtime(); r.controls.registryFailure = true;
  await assert.rejects(r.evaluate('startArtPacks()'), /Registry: HTTP 503/);
  assert.equal(r.evaluate('SCULPTED_WORLD.ready'), false); assert.equal(r.images.length, 0);
  assert.match(r.evaluate('ART_PACK_STATE.error'), /HTTP 503/);
  r.controls.registryFailure = false; await r.evaluate('startArtPacks()');
  assert.equal(r.evaluate('ART_PACK_STATE.active'), 'rigged');
  assert.ok(r.requests.every(request => request.options.cache === 'no-cache'));
});

test('image failure keeps readiness false, removes the failed cache, and retries cleanly', async () => {
  const r = runtime(); r.controls.failure = '/walker.png';
  await assert.rejects(r.evaluate('startArtPacks()'), /Decode failed/);
  assert.equal(r.evaluate('SCULPTED_WORLD.ready'), false);
  assert.equal(r.evaluate('ART_PACK_CACHE.size'), 0);
  r.controls.failure = null; await r.evaluate('startArtPacks()');
  assert.equal(r.evaluate('ART_PACK_STATE.progress.loaded'), 33);
  assert.equal(r.evaluate('ART_PACK_STATE.error'), null);
});

test('invalid decoded frame geometry cannot mark assets ready', async () => {
  const r = runtime(); r.controls.manifest.characters.soldier.clips.idle.directions.S[0].x = 100000;
  await assert.rejects(r.evaluate('startArtPacks()'), /frame outside image/);
  assert.equal(r.evaluate('SCULPTED_WORLD.ready'), false);
});
