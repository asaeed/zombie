export const DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
export const CELL = { width: 80, height: 96, footX: 40, footY: 86 };
export const CLIPS = {
  sniper: [
    { name: 'idle', frames: 4, fps: 5, loop: true },
    { name: 'walk', frames: 8, fps: 12, loop: true },
    { name: 'shoot', frames: 6, fps: 14, loop: false },
    { name: 'gather', frames: 6, fps: 8, loop: true },
  ],
  walker: [
    { name: 'idle', frames: 4, fps: 5, loop: true },
    { name: 'walk', frames: 8, fps: 11, loop: true },
    { name: 'attack', frames: 6, fps: 13, loop: false },
  ],
};

export function imageName(style, type) {
  return `${style === 'diorama' ? '' : `${style}-`}${type}.png`;
}

export function bake2D(type, style, sourceSize, drawFrame) {
  if (!CLIPS[type]) throw new Error(`Unknown sprite: ${type}`);
  const clips = CLIPS[type];
  const sheet = document.createElement('canvas');
  sheet.width = CELL.width * Math.max(...clips.map(clip => clip.frames));
  sheet.height = CELL.height * DIRECTIONS.length * clips.length;
  const ctx = sheet.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const source = document.createElement('canvas');
  source.width = sourceSize.width;
  source.height = sourceSize.height;
  const sourceCtx = source.getContext('2d');
  const clipData = {};
  for (const [clipIndex, clip] of clips.entries()) {
    clipData[clip.name] = { fps: clip.fps, loop: clip.loop, directions: {} };
    for (const [directionIndex, direction] of DIRECTIONS.entries()) {
      const frames = [];
      for (let frame = 0; frame < clip.frames; frame++) {
        sourceCtx.clearRect(0, 0, source.width, source.height);
        drawFrame(sourceCtx, type, direction, clip.name, frame, clip.frames);
        const x = frame * CELL.width;
        const y = (clipIndex * DIRECTIONS.length + directionIndex) * CELL.height;
        ctx.drawImage(source, 0, 0, source.width, source.height, x, y, CELL.width, CELL.height);
        frames.push({ x, y, width: CELL.width, height: CELL.height });
      }
      clipData[clip.name].directions[direction] = frames;
    }
  }
  return { canvas: sheet, metadata: {
    image: imageName(style, type), style,
    cell: { width: CELL.width, height: CELL.height },
    footAnchor: { x: CELL.footX, y: CELL.footY },
    directions: DIRECTIONS, clips: clipData,
  } };
}
