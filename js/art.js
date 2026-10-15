'use strict';

const ART_DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const SCULPTED_WORLD = {characters: new Map(), objects: new Map(), terrain: null, ready: false, errors: []};
const ART_PACK_STORAGE_KEY = 'dead-zone-rts:art-pack';
const ART_PACK_STATE = {active: null, pending: null, error: null, revision: 0, progress: {loaded: 0, total: 0}};
let ART_PACK_CATALOG = {version: 1, default: 'rigged', packs: [
  {id: 'rigged', label: 'Rigged Tactics', manifest: 'assets/rigged-full/manifest.json'},
]};
const ART_PACK_CACHE = new Map();

function zombieAppearance(type, id) {
  return type === 'walker' || type === 'runner' ? (Math.imul(Math.abs(id), 5) + 3) % 8 : 0;
}

function artPackChanged() {
  if (typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('artpackchange'));
}

function artPackAssetURL(value, base = document.baseURI) {
  if (typeof value !== 'string' || !value) throw new Error('Missing artwork path');
  const url = new URL(value, base), assets = new URL('assets/', document.baseURI);
  if (url.origin !== assets.origin || !url.pathname.startsWith(assets.pathname) || url.search || url.hash) {
    throw new Error('Artwork must be inside this game\'s assets directory');
  }
  return url;
}

function validateArtPackCatalog(catalog) {
  if (catalog?.version !== 1 || !Array.isArray(catalog.packs) || !catalog.packs.length) throw new Error('Invalid art pack registry');
  const ids = new Set();
  for (const pack of catalog.packs) {
    if (!/^[a-z0-9-]+$/.test(pack.id) || ids.has(pack.id) || typeof pack.label !== 'string' || !pack.label.trim()) throw new Error('Invalid art pack entry');
    ids.add(pack.id); artPackAssetURL(pack.manifest);
  }
  if (!ids.has(catalog.default)) throw new Error('Missing default art pack');
  return catalog;
}

function validateArtManifest(manifest) {
  if (manifest?.version !== 1) throw new Error('Unsupported art manifest version');
  if (manifest.imageSmoothingQuality !== undefined && !['low', 'medium', 'high'].includes(manifest.imageSmoothingQuality)) throw new Error('Invalid artwork sampling quality');
  const characters = ['soldier', 'scout', 'builder', 'medic', 'sniper', 'heavy', 'torchbearer', 'walker',
    'runner', 'brute', 'spitter', 'exploder', 'screamer', 'boss', 'walker-cap', 'walker-dress', 'walker-onearm', 'suv'];
  const objects = ['hq', 'wall', 'tower', 'barracks', 'depot', 'light', 'clinic', 'mechanics', 'car', 'cabin', 'bin', 'pine', 'bush', 'rock'];
  const positive = n => Number.isFinite(n) && n > 0;
  const anchor = m => Number.isFinite(m?.footAnchor?.x) && Number.isFinite(m?.footAnchor?.y);
  for (const id of characters) {
    const meta = manifest.characters?.[id];
    if (!meta?.image || !anchor(meta) || !positive(meta.renderScale) || !positive(meta.bodyHeight) ||
        !positive(meta.cell?.width) || !positive(meta.cell?.height) ||
        !ART_DIRECTIONS.every(d => meta.directions?.includes(d))) throw new Error(`Incomplete character: ${id}`);
    const actions = id === 'suv' ? ['idle'] : ['idle', 'walk'];
    if (['soldier', 'scout', 'sniper'].includes(id)) actions.push('shoot', 'gather');
    else if (['builder', 'heavy', 'torchbearer'].includes(id)) actions.push('attack', 'gather');
    else if (id === 'medic') actions.push('heal', 'gather');
    else if (id !== 'suv') actions.push('attack');
    if (id === 'builder') actions.push('repair');
    if (id !== 'suv' && !positive(meta.walkStride)) throw new Error(`Missing walk stride: ${id}`);
    if (actions.includes('shoot') && meta.strike !== 'shoot' || actions.includes('attack') && meta.strike !== 'attack') throw new Error(`Missing strike action: ${id}`);
    for (const action of actions) if (!meta.clips?.[action]) throw new Error(`Missing ${id}/${action}`);
    for (const [action, clip] of Object.entries(meta.clips)) {
      if (!positive(clip.fps) || typeof clip.loop !== 'boolean' ||
          !ART_DIRECTIONS.every(d => Array.isArray(clip.directions?.[d]) && clip.directions[d].length)) throw new Error(`Incomplete clip: ${id}/${action}`);
    }
  }
  for (const id of objects) {
    const meta = manifest.objects?.[id];
    if (!meta?.image || !anchor(meta) || !positive(meta.width) || !positive(meta.height) ||
        meta.displaySize && (!positive(meta.displaySize.width) || !positive(meta.displaySize.height))) throw new Error(`Incomplete object: ${id}`);
    if (manifest.nightVariants && !meta.nightImage) throw new Error(`Missing night artwork: ${id}`);
  }
  const terrainScale = manifest.terrain?.resolutionScale ?? 1;
  if (!Number.isInteger(terrainScale) || terrainScale < 1 || terrainScale > 8) throw new Error('Invalid terrain resolution');
  for (const type of ['grass', 'dirt', 'water']) {
    if (!/^#[0-9a-f]{6}$/i.test(manifest.terrain?.baseColors?.[type])) throw new Error(`Missing terrain color: ${type}`);
    for (let variant = 0; variant < 16; variant++) {
      const frame = manifest.terrain.frames?.find(f => f.type === type && f.variant === variant);
      if (!frame || frame.width !== 64 * terrainScale || frame.height !== 32 * terrainScale) throw new Error(`Incomplete terrain: ${type}/${variant}`);
    }
  }
  if (!manifest.terrain.image) throw new Error('Missing terrain image');
  if (manifest.nightVariants) {
    if (!manifest.terrain.nightImage) throw new Error('Missing night terrain');
    for (const type of ['grass', 'dirt', 'water']) {
      if (!/^#[0-9a-f]{6}$/i.test(manifest.terrain.nightBaseColors?.[type])) throw new Error(`Missing night terrain color: ${type}`);
    }
  }
}

async function loadArtPack(pack, progress = () => {}) {
  const url = artPackAssetURL(pack.manifest);
  const response = await fetch(url, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`Artwork: HTTP ${response.status}`);
  const manifest = await response.json(); validateArtManifest(manifest);
  const world = {characters: new Map(), objects: new Map(), terrain: null, ready: true};
  const records = [...Object.values(manifest.characters), ...Object.values(manifest.objects), manifest.terrain];
  const total = records.reduce((count, meta) => count + 1 + (meta.nightImage ? 1 : 0), 0);
  let loaded = 0; progress({loaded, total});
  const load = async (metadata, mask = false) => {
    const frames = metadata.clips ? Object.values(metadata.clips).flatMap(clip => Object.values(clip.directions).flat()) : metadata.frames;
    const paths = [metadata.image, metadata.nightImage].filter(Boolean);
    const [image, nightImage] = await Promise.all(paths.map(async path => {
      const picture = new Image(); picture.src = artPackAssetURL(path, url).href; await picture.decode();
      for (const frame of frames ?? [{x: 0, y: 0, width: metadata.width, height: metadata.height}]) {
        if (![frame.x, frame.y, frame.width, frame.height].every(Number.isInteger) || frame.x < 0 || frame.y < 0 ||
            frame.width <= 0 || frame.height <= 0 || frame.x + frame.width > picture.naturalWidth ||
            frame.y + frame.height > picture.naturalHeight) throw new Error(`Artwork frame outside image: ${path}`);
      }
      return picture;
    }));
    if (nightImage && (nightImage.naturalWidth !== image.naturalWidth || nightImage.naturalHeight !== image.naturalHeight)) throw new Error(`Misaligned night artwork: ${metadata.image}`);
    const record = {image, nightImage, metadata, imageSmoothing: manifest.imageSmoothing === true, imageSmoothingQuality: manifest.imageSmoothingQuality ?? 'low'};
    if (mask) {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', {willReadFrequently: true}); ctx.drawImage(image, 0, 0);
      record.alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    loaded += paths.length; progress({loaded, total}); return record;
  };
  const jobs = [];
  for (const [id, metadata] of Object.entries(manifest.characters)) jobs.push(load(metadata).then(record => world.characters.set(id, record)));
  for (const [id, metadata] of Object.entries(manifest.objects)) jobs.push(load(metadata, true).then(record => world.objects.set(id, record)));
  jobs.push(load(manifest.terrain).then(record => {world.terrain = record;}));
  await Promise.all(jobs); return world;
}

async function selectArtPack(id, {persist = true, updateURL = true} = {}) {
  const pack = ART_PACK_CATALOG.packs.find(pack => pack.id === id);
  if (!pack) throw new Error(`Unknown graphics pack: ${id}`);
  const revision = ++ART_PACK_STATE.revision;
  ART_PACK_STATE.pending = id; ART_PACK_STATE.error = null; ART_PACK_STATE.progress = {loaded: 0, total: 0}; artPackChanged();
  try {
    if (!ART_PACK_CACHE.has(id)) ART_PACK_CACHE.set(id, loadArtPack(pack, progress => {
      if (revision === ART_PACK_STATE.revision) {ART_PACK_STATE.progress = progress; artPackChanged();}
    }));
    let world;
    try {world = await ART_PACK_CACHE.get(id);} catch (error) {ART_PACK_CACHE.delete(id); throw error;}
    if (revision !== ART_PACK_STATE.revision) return false;
    Object.assign(SCULPTED_WORLD, world, {errors: []});
    const records = [...world.characters.values(), ...world.objects.values(), world.terrain];
    const total = records.reduce((count, record) => count + 1 + (record.nightImage ? 1 : 0), 0);
    ART_PACK_STATE.progress = {loaded: total, total};
    ART_PACK_STATE.active = id; ART_PACK_STATE.pending = null;
    if (persist) {try {localStorage.setItem(ART_PACK_STORAGE_KEY, id);} catch {}}
    if (updateURL && window.history?.replaceState && window.location.href) {
      const url = new URL(window.location.href); url.searchParams.set('artPack', id); url.searchParams.delete('artPilot');
      window.history.replaceState(null, '', url);
    }
    artPackChanged(); return true;
  } catch (error) {
    if (revision !== ART_PACK_STATE.revision) return false;
    ART_PACK_STATE.pending = null; ART_PACK_STATE.error = error.message;
    SCULPTED_WORLD.errors.push(error.message); artPackChanged(); throw error;
  }
}

async function startArtPacks() {
  ART_PACK_STATE.error = null; ART_PACK_STATE.progress = {loaded: 0, total: 0}; artPackChanged();
  try {
    const response = await fetch(artPackAssetURL('assets/art-packs/registry.json'), {cache: 'no-cache'});
    if (!response.ok) throw new Error(`Registry: HTTP ${response.status}`);
    ART_PACK_CATALOG = validateArtPackCatalog(await response.json());
    const params = new URLSearchParams(window.location.search);
    let stored; try {stored = localStorage.getItem(ART_PACK_STORAGE_KEY);} catch {}
    let id = params.get('artPack') || stored || ART_PACK_CATALOG.default;
    if (!ART_PACK_CATALOG.packs.some(pack => pack.id === id)) id = ART_PACK_CATALOG.default;
    await selectArtPack(id, {updateURL: params.has('artPilot') || params.has('artPack')});
    return true;
  } catch (error) {
    ART_PACK_STATE.error = error.message; artPackChanged(); throw error;
  }
}

// Loading starts during page boot; callers must explicitly enter the game after readiness.
const ART_PACK_READY = typeof document !== 'undefined' && typeof fetch === 'function' && typeof Image !== 'undefined'
  ? startArtPacks().then(() => true, () => false) : Promise.resolve(false);

function sculptedActor(type) {return SCULPTED_WORLD.ready ? SCULPTED_WORLD.characters.get(type) : null;}
function sculptedObject(type) {return SCULPTED_WORLD.ready ? SCULPTED_WORLD.objects.get(type) : null;}

function worldArtworkImage(record, darkness = 0) {
  if (!record.nightImage || darkness <= 0) return record.image;
  if (darkness >= 1) return record.nightImage;
  const mix = Math.round(darkness * 255), revision = record.revision ?? 0;
  if (record.blendMix === mix && record.blendRevision === revision) return record.blendCanvas;
  const canvas = record.blendCanvas ??= document.createElement('canvas');
  const width = record.image.naturalWidth || record.image.width, height = record.image.naturalHeight || record.image.height;
  if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height;}
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height);
  // Add premultiplied contributions in isolation, preserving translucent silhouette edges.
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - mix / 255;
  ctx.drawImage(record.image, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = mix / 255;
  ctx.drawImage(record.nightImage, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  record.blendMix = mix; record.blendRevision = revision;
  return canvas;
}

function sculptedActorFrame(record, actor, time, working = null) {
  const meta = record.metadata, clips = meta.clips;
  const direction = meta.directions.includes(actor.facing) ? actor.facing : 'SE';
  let name = 'idle', elapsed = 0;
  const strike = clips[meta.strike], attackElapsed = time - actor.attackAnimStart;
  if (strike && attackElapsed >= 0 && attackElapsed < strike.directions[direction].length / strike.fps) {
    name = meta.strike; elapsed = attackElapsed;
  } else if (time - actor.lastMotionAt < .16 && clips.walk) {
    name = 'walk'; elapsed = (actor.animDistance ?? 0) / (meta.walkStride * clips.walk.fps);
  } else if (working && clips[working]) {
    name = working; elapsed = working === 'gather' ? (actor.gatherAnimTime ?? time) : time;
  }
  const clip = clips[name], cells = clip.directions[direction];
  const index = Math.max(0, Math.floor(elapsed * clip.fps));
  return cells[clip.loop ? index % cells.length : Math.min(index, cells.length - 1)];
}

function sculptedObjectRect(record, foot, zoom) {
  const meta = record.metadata, size = meta.displaySize ?? meta;
  const sx = size.width / meta.width, sy = size.height / meta.height;
  return {x: foot.x - meta.footAnchor.x * sx * zoom, y: foot.y - meta.footAnchor.y * sy * zoom,
    width: size.width * zoom, height: size.height * zoom};
}

function sculptedObjectHit(record, rect, x, y) {
  const px = Math.floor((x - rect.x) * record.metadata.width / rect.width);
  const py = Math.floor((y - rect.y) * record.metadata.height / rect.height);
  return px >= 0 && py >= 0 && px < record.metadata.width && py < record.metadata.height &&
    record.alpha[(py * record.metadata.width + px) * 4 + 3] > 96;
}

function sculptedTerrainFrame(tile, tx, ty, night = false) {
  const record = SCULPTED_WORLD.terrain; if (!record || !SCULPTED_WORLD.ready) return null;
  const variant = ((tx % 4 + 4) % 4) + ((ty % 4 + 4) % 4) * 4;
  const type = ['grass', 'dirt', 'water'][tile];
  const frame = record.metadata.frames.find(frame => frame.type === type && frame.variant === variant);
  return frame ? {image: night && record.nightImage ? record.nightImage : record.image, frame,
    baseColor: (night ? record.metadata.nightBaseColors : record.metadata.baseColors)?.[type] ?? record.metadata.baseColors?.[type],
    imageSmoothing: record.imageSmoothing, imageSmoothingQuality: record.imageSmoothingQuality} : null;
}
