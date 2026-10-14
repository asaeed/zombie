export const NIGHT_LIGHTS = {
  hq: [
    {box: [.278,.708,.334,.818], mode: 'glass'}, {box: [.543,.727,.609,.815], mode: 'glass'},
    {box: [.422,.698,.45,.742], mode: 'lamp'}, {box: [.784,.61,.811,.655], mode: 'lamp'},
  ],
  wall: [{box: [.103,.263,.131,.319], mode: 'glass'}, {box: [.698,.548,.727,.604], mode: 'glass'}],
  tower: [{box: [.22,.28,.77,.415], mode: 'interior', amount: .28}],
  barracks: [
    {polygon: [[.672,.642],[.733,.611],[.733,.711],[.672,.742]], mode: 'glass'},
    {polygon: [[.835,.531],[.896,.504],[.896,.603],[.835,.634]], mode: 'glass'},
    {box: [.487,.596,.51,.64], mode: 'lamp'}, {box: [.887,.457,.912,.501], mode: 'lamp'},
  ],
  depot: [{box: [.126,.39,.851,.68], mode: 'interior', amount: .16},
    {box: [.515,.518,.541,.568], mode: 'lamp'}, {box: [.899,.343,.925,.39], mode: 'lamp'}],
  light: [
    {box: [.299,.103,.43,.157], mode: 'lamp'}, {box: [.562,.145,.689,.198], mode: 'lamp'},
    {box: [.299,.193,.43,.246], mode: 'lamp'}, {box: [.562,.235,.689,.29], mode: 'lamp'},
  ],
  clinic: [
    {polygon: [[.296,.516],[.378,.552],[.378,.665],[.296,.626]], mode: 'glass', color: [193,245,218]},
    {box: [.18,.469,.207,.516], mode: 'lamp'}, {box: [.552,.612,.581,.661], mode: 'lamp'},
    {box: [.849,.55,.876,.6], mode: 'lamp'},
  ],
  mechanics: [
    {box: [.168,.432,.607,.805], mode: 'interior', amount: .25},
    {box: [.077,.306,.103,.357], mode: 'lamp'}, {box: [.616,.479,.641,.53], mode: 'lamp'},
    {box: [.877,.419,.905,.47], mode: 'lamp'}, {box: [.285,.501,.362,.55], mode: 'lamp'},
  ],
  cabin: [{polygon: [[.252,.536],[.343,.578],[.343,.665],[.252,.623]], mode: 'glass'}],
  car: [{box: [.624,.735,.717,.801], mode: 'lamp', amount: .48},
    {box: [.875,.626,.927,.692], mode: 'lamp', amount: .48}],
};

export function nightColor(r, g, b) {
  const luminance = r * .2126 + g * .7152 + b * .0722;
  return [Math.round(r * .40 + luminance * .08 + 6), Math.round(g * .50 + luminance * .06 + 9),
    Math.round(b * .61 + luminance * .08 + 16)];
}

function canvas(width, height) {
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = width; c.height = height; return c;
}

export async function bakeNightWorld(base) {
  const manifest = await (await fetch(new URL('manifest.json', base), {cache: 'no-cache'})).json();
  const output = {}, stats = {};
  const palette = {};
  for (const [kind, hex] of Object.entries(manifest.terrain.baseColors)) {
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
    palette[kind] = '#' + nightColor(...rgb).map(n => n.toString(16).padStart(2,'0')).join('');
  }
  for (const [id, meta] of [...Object.entries(manifest.objects), ['terrain', manifest.terrain]]) {
    const image = new Image(); image.src = new URL(meta.image, base); await image.decode();
    const c = canvas(image.naturalWidth, image.naturalHeight), g = c.getContext('2d', {willReadFrequently: true});
    g.drawImage(image, 0, 0); const pixels = g.getImageData(0, 0, c.width, c.height), original = new Uint8ClampedArray(pixels.data);
    const lamps = (NIGHT_LIGHTS[id] || []).map(light => {
      const mask = canvas(c.width, c.height), m = mask.getContext('2d', {willReadFrequently: true});
      const polygon = light.polygon || [[light.box[0],light.box[1]],[light.box[2],light.box[1]],
        [light.box[2],light.box[3]],[light.box[0],light.box[3]]];
      m.fillStyle = '#fff'; m.beginPath();
      polygon.forEach(([x,y],i) => i ? m.lineTo(x*c.width,y*c.height) : m.moveTo(x*c.width,y*c.height)); m.closePath(); m.fill();
      return {...light, pixels: m.getImageData(0,0,c.width,c.height).data,
        x: polygon.reduce((sum,p) => sum+p[0],0)/polygon.length,
        y: polygon.reduce((sum,p) => sum+p[1],0)/polygon.length,
        rx: (Math.max(...polygon.map(p=>p[0]))-Math.min(...polygon.map(p=>p[0])))/2,
        ry: (Math.max(...polygon.map(p=>p[1]))-Math.min(...polygon.map(p=>p[1])))/2};
    });
    let litPixels = 0, alphaDifferences = 0;
    for (let y=0;y<c.height;y++) for (let x=0;x<c.width;x++) {
      const i = (y*c.width+x)*4; if (!original[i+3]) continue;
      const r=original[i],green=original[i+1],b=original[i+2],lum=r*.2126+green*.7152+b*.0722;
      let rgb = nightColor(r,green,b), lit = false;
      for (const lamp of lamps) {
        const color = lamp.color || [255,209,128], coverage = lamp.pixels[i+3]/255;
        const allowed = lamp.mode === 'interior' || (lamp.mode === 'glass' ? lum < 133 : lum > 112);
        const d = Math.hypot((x/c.width-lamp.x)*c.width,(y/c.height-lamp.y)*c.height);
        const spill = lamp.mode === 'interior' ? 0 : .08*Math.exp(-d*d/(2*(c.width*.045)**2));
        const falloff = lamp.mode === 'interior' ? Math.exp(-2*((x/c.width-lamp.x)/lamp.rx)**2-2*((y/c.height-lamp.y)/lamp.ry)**2) : 1;
        const texture = lamp.mode === 'glass' ? .32+.68*Math.min(1,lum/95) : 1;
        const strength = allowed ? coverage*(lamp.amount ?? .88)*falloff*texture : 0;
        if (strength > .05) lit = true;
        rgb = rgb.map((value, channel) => Math.round(value*(1-Math.min(.94,strength+spill)) +
          (color[channel]*(.78+lum/1150))*Math.min(.94,strength+spill)));
      }
      for (let channel=0;channel<3;channel++) pixels.data[i+channel] = rgb[channel];
      if (lit) litPixels++;
      if (pixels.data[i+3] !== original[i+3]) alphaDifferences++;
    }
    if (alphaDifferences) throw new Error('Night pass changed an alpha silhouette: '+id);
    g.putImageData(pixels,0,0);
    output[id] = c.toDataURL('image/png').split(',')[1];
    stats[id] = {width:c.width,height:c.height,alphaDifferences,litPixels};
  }
  return {images:output,stats,palette,method:'Pixel-preserving RGB night grade, source-surface light masks, unchanged alpha and anchors'};
}
