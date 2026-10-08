'use strict';

const artPilotOption = new URLSearchParams(window.location.search).get('artPilot') ?? 'sculpted';
const DIORAMA_PILOT_ENABLED = ['1', 'diorama', 'pixel', 'horror', 'sculpted'].includes(artPilotOption);
const DIORAMA_PILOT_STYLE = ['pixel', 'horror', 'sculpted'].includes(artPilotOption) ? artPilotOption : 'diorama';
const DIORAMA_PILOT_SCALE = DIORAMA_PILOT_STYLE === 'sculpted' ? .28 : .66;
const DIORAMA_PILOT_CELL = DIORAMA_PILOT_STYLE === 'sculpted'
  ? { width: 128, height: 128, footX: 64, footY: 116 }
  : { width: 80, height: 96, footX: 40, footY: 86 };
const DIORAMA_PILOT_DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const DIORAMA_PILOT_CLIPS = {
  sniper: ['idle', 'walk', 'shoot', 'gather'],
  walker: ['idle', 'walk', 'attack'],
};
const DIORAMA_PILOT_IMAGES = new Map();
const DIORAMA_PILOT_TIMING = DIORAMA_PILOT_STYLE === 'sculpted' ? {
  sniper: { idle: [6, 6], walk: [12, 12, 10 / 3], shoot: [8, 16], gather: [12, 10] },
  walker: { idle: [6, 6], walk: [12, 11, 4], attack: [8, 15] },
} : {
  sniper: { idle: [4, 5], walk: [8, 12, 5], shoot: [6, 14], gather: [6, 8] },
  walker: { idle: [4, 5], walk: [8, 11, 6], attack: [6, 13] },
};

if (DIORAMA_PILOT_ENABLED && typeof Image !== 'undefined') {
  for (const type of Object.keys(DIORAMA_PILOT_CLIPS)) {
    const image = new Image();
    image.src = DIORAMA_PILOT_STYLE === 'sculpted' ? `assets/sculpted-pixel/${type}.png`
      : `assets/diorama-pilot/${DIORAMA_PILOT_STYLE === 'diorama' ? '' : `${DIORAMA_PILOT_STYLE}-`}${type}.png`;
    DIORAMA_PILOT_IMAGES.set(type, image);
  }
}

function dioramaPilotFrame(type, facing, moving, actionElapsed, distance, gathering = false, gatherTime = 0, time = 0) {
  const clips = DIORAMA_PILOT_CLIPS[type];
  if (!clips) return null;
  const direction = Math.max(0, DIORAMA_PILOT_DIRECTIONS.indexOf(facing));
  const timing = DIORAMA_PILOT_TIMING[type];
  const action = type === 'sniper' ? 'shoot' : 'attack';
  let clip = 'idle', frame = Math.floor(time * timing.idle[1]) % timing.idle[0];
  if (actionElapsed >= 0 && actionElapsed < timing[action][0] / timing[action][1]) {
    clip = action;
    frame = Math.min(timing[action][0] - 1, Math.floor(actionElapsed * timing[action][1]));
  } else if (moving) {
    clip = 'walk';
    frame = Math.floor(distance / timing.walk[2]) % timing.walk[0];
  } else if (type === 'sniper' && gathering) {
    clip = 'gather';
    frame = Math.floor(gatherTime * timing.gather[1]) % timing.gather[0];
  }
  const clipIndex = clips.indexOf(clip);
  return {
    x: frame * DIORAMA_PILOT_CELL.width,
    y: (clipIndex * DIORAMA_PILOT_DIRECTIONS.length + direction) * DIORAMA_PILOT_CELL.height,
    width: DIORAMA_PILOT_CELL.width,
    height: DIORAMA_PILOT_CELL.height,
  };
}

function dioramaPilotImage(type) {
  const image = DIORAMA_PILOT_IMAGES.get(type);
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

const SCULPTED_WORLD = { characters: new Map(), objects: new Map(), terrain: null, ready: false, errors: [] };

async function loadSculptedWorld() {
  const base = new URL('assets/sculpted-pixel/world/', document.baseURI);
  const response = await fetch(new URL('manifest.json', base));
  if (!response.ok) throw new Error(`World artwork: HTTP ${response.status}`);
  const manifest = await response.json();
  const load = async (metadata, mask = false) => {
    const image = new Image(); image.src = new URL(metadata.image, base).href;
    await image.decode();
    const record = { image, metadata };
    if (mask) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      record.alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    return record;
  };
  const jobs = [];
  for (const [id, metadata] of Object.entries(manifest.characters)) {
    jobs.push(load(metadata).then(record => SCULPTED_WORLD.characters.set(id, record)));
  }
  for (const [id, metadata] of Object.entries(manifest.objects)) {
    jobs.push(load(metadata, true).then(record => SCULPTED_WORLD.objects.set(id, record)));
  }
  jobs.push(load(manifest.terrain).then(record => { SCULPTED_WORLD.terrain = record; }));
  await Promise.all(jobs); SCULPTED_WORLD.ready = true;
}

if (DIORAMA_PILOT_ENABLED && DIORAMA_PILOT_STYLE === 'sculpted' && typeof fetch === 'function' && typeof Image !== 'undefined') {
  loadSculptedWorld().catch(error => {
    SCULPTED_WORLD.errors.push(error.message);
    console.warn('Sculpted artwork could not finish loading; using available fallback art.', error);
  });
}

function sculptedActor(type) {
  return DIORAMA_PILOT_ENABLED && DIORAMA_PILOT_STYLE === 'sculpted' ? SCULPTED_WORLD.characters.get(type) : null;
}

function sculptedObject(type) {
  return DIORAMA_PILOT_ENABLED && DIORAMA_PILOT_STYLE === 'sculpted' ? SCULPTED_WORLD.objects.get(type) : null;
}

function sculptedActorFrame(record, actor, time, working = null) {
  const meta = record.metadata, clips = meta.clips;
  const direction = meta.directions.includes(actor.facing) ? actor.facing : 'SE';
  let name = 'idle', elapsed = time;
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
  const meta = record.metadata;
  return { x: foot.x - meta.footAnchor.x * zoom, y: foot.y - meta.footAnchor.y * zoom,
    width: meta.width * zoom, height: meta.height * zoom };
}

function sculptedObjectHit(record, rect, x, y) {
  const px = Math.floor((x - rect.x) * record.metadata.width / rect.width);
  const py = Math.floor((y - rect.y) * record.metadata.height / rect.height);
  return px >= 0 && py >= 0 && px < record.metadata.width && py < record.metadata.height &&
    record.alpha[(py * record.metadata.width + px) * 4 + 3] > 96;
}

function sculptedTerrainFrame(tile, tx, ty) {
  const record = SCULPTED_WORLD.terrain;
  if (!record || DIORAMA_PILOT_STYLE !== 'sculpted' || !DIORAMA_PILOT_ENABLED) return null;
  const variant = ((tx % 4 + 4) % 4) + ((ty % 4 + 4) % 4) * 4;
  const type = ['grass', 'dirt', 'water'][tile];
  const frame = record.metadata.frames.find(frame => frame.type === type && frame.variant === variant);
  return frame ? { image: record.image, frame, baseColor: record.metadata.baseColors?.[type] } : null;
}
