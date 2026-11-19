import * as THREE from '../../node_modules/three/build/three.module.js';
import { RoundedBoxGeometry } from '../../node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CELL, CLIPS, DIRECTIONS, imageName } from './atlas-contract.mjs';

const yaw = {
  S: Math.PI / 4, SE: Math.PI / 2, E: 3 * Math.PI / 4, NE: Math.PI,
  N: -3 * Math.PI / 4, NW: -Math.PI / 2, W: -Math.PI / 4, SW: 0,
};

function mat(color, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.84, metalness });
}

const color = {
  armor: mat('#647d3d'), armorLight: mat('#91a65a'), darkOlive: mat('#314b34'),
  fabric: mat('#4c693a'), fabricLight: mat('#819150'), webbing: mat('#b8a872'),
  skin: mat('#d5aa7b'), skinShade: mat('#a77557'), boot: mat('#30332d'),
  steel: mat('#242d30', 0.3), steelEdge: mat('#718080', 0.35), wood: mat('#745038'),
  zombieSkin: mat('#c2c1b7'), zombieShade: mat('#888f8b'),
  zombieShirt: mat('#3d4548'), zombieShirtLight: mat('#626c6b'),
  zombiePants: mat('#b1b7b2'), zombiePantsDark: mat('#7b8582'),
  socket: mat('#424944'), eye: mat('#f5d96b'), mouth: mat('#423f39'),
};
const muzzleMat = new THREE.MeshBasicMaterial({ color: '#ffdc61' });
const muzzleCore = new THREE.MeshBasicMaterial({ color: '#fff4c4' });

function attach(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function block(parent, size, position, material, bevel = 0.035) {
  return attach(parent, new RoundedBoxGeometry(...size, 2, bevel), material, position);
}

function limb(parent, length, top, bottom, material) {
  return attach(parent, new THREE.CylinderGeometry(top, bottom, length, 6, 1), material,
    [0, -length / 2, 0]);
}

function joint(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}

function makeLegs(root, upper, lower, shoe) {
  return [-1, 1].map(side => {
    const hip = joint(root, [side * 0.21, 0.98, 0]);
    limb(hip, 0.43, 0.145, 0.105, upper);
    const knee = joint(hip, [0, -0.43, 0]);
    attach(knee, new THREE.IcosahedronGeometry(0.115, 0), lower, [0, 0, 0]);
    limb(knee, 0.42, 0.105, 0.09, lower);
    const ankle = joint(knee, [0, -0.41, 0]);
    block(ankle, [0.27, 0.16, 0.41], [0, -0.06, 0.115], shoe, 0.025);
    return { hip, knee, ankle };
  });
}

function makeArms(torso, upper, lower, hand) {
  return [-1, 1].map(side => {
    const shoulder = joint(torso, [side * 0.43, 0.51, 0]);
    limb(shoulder, 0.34, 0.14, 0.115, upper);
    const elbow = joint(shoulder, [0, -0.34, 0]);
    attach(elbow, new THREE.IcosahedronGeometry(0.105, 0), lower, [0, 0, 0]);
    limb(elbow, 0.31, 0.105, 0.083, lower);
    block(elbow, [0.19, 0.17, 0.18], [0, -0.34, 0], hand, 0.03);
    return { shoulder, elbow };
  });
}

function makeSniper() {
  const root = new THREE.Group();
  const legs = makeLegs(root, color.fabric, color.darkOlive, color.boot);
  const torso = joint(root, [0, 1.0, 0]);
  block(torso, [0.72, 0.73, 0.42], [0, 0.37, 0], color.fabric, 0.09);
  block(torso, [0.62, 0.55, 0.44], [0, 0.41, 0.02], color.armor, 0.085);
  block(torso, [0.54, 0.31, 0.09], [0, 0.42, 0.26], color.armorLight, 0.035);
  block(torso, [0.22, 0.33, 0.12], [-0.20, 0.38, 0.30], color.webbing);
  block(torso, [0.18, 0.17, 0.15], [0.19, 0.16, 0.28], color.wood);
  block(torso, [0.52, 0.56, 0.25], [0, 0.37, -0.32], color.darkOlive, 0.07);
  block(torso, [0.42, 0.25, 0.07], [0, 0.36, -0.48], color.webbing);
  const arms = makeArms(torso, color.fabric, color.armor, color.skin);
  for (const side of [-1, 1]) {
    block(torso, [0.28, 0.16, 0.30], [side * 0.42, 0.51, 0], color.armor, 0.05);
  }
  const head = joint(torso, [0, 0.82, 0.015]);
  block(head, [0.38, 0.42, 0.36], [0, 0.05, 0], color.skin, 0.085);
  block(head, [0.47, 0.20, 0.44], [0, 0.27, -0.01], color.armor, 0.08);
  block(head, [0.50, 0.06, 0.51], [0, 0.20, 0.09], color.darkOlive, 0.025);
  block(head, [0.35, 0.065, 0.08], [0, 0.06, 0.19], color.skinShade, 0.015);
  const rifle = joint(torso, [0.11, 0.42, 0.34]);
  block(rifle, [0.18, 0.19, 0.70], [0, 0, 0.40], color.wood, 0.03);
  block(rifle, [0.13, 0.13, 0.78], [0, 0.08, 0.70], color.steel, 0.025);
  block(rifle, [0.08, 0.08, 0.52], [0, 0.085, 1.26], color.steelEdge, 0.015);
  block(rifle, [0.11, 0.12, 0.35], [0, 0.19, 0.44], color.steel, 0.025);
  block(rifle, [0.12, 0.05, 0.08], [0, 0.26, 0.54], color.steelEdge, 0.01);
  const flash = joint(rifle, [0, 0.085, 1.62]);
  attach(flash, new THREE.OctahedronGeometry(0.18, 0), muzzleMat, [0, 0, 0.08]);
  attach(flash, new THREE.OctahedronGeometry(0.105, 0), muzzleCore, [0, 0, 0.12]);
  flash.visible = false;
  return { root, legs, arms, torso, head, rifle, flash };
}

function makeWalker() {
  const root = new THREE.Group();
  const legs = makeLegs(root, color.zombiePants, color.zombiePantsDark, color.boot);
  const torso = joint(root, [0, 0.98, 0]);
  block(torso, [0.72, 0.73, 0.41], [0, 0.37, 0], color.zombieShirt, 0.10);
  block(torso, [0.24, 0.13, 0.05], [-0.18, 0.55, 0.23], color.zombieShirtLight, 0.016);
  block(torso, [0.31, 0.10, 0.05], [0.14, 0.25, 0.23], color.zombieShirtLight, 0.015);
  const arms = makeArms(torso, color.zombieShirt, color.zombieSkin, color.zombieShade);
  const head = joint(torso, [0, 0.84, 0.06]);
  const skull = attach(head, new THREE.DodecahedronGeometry(0.27, 0), color.zombieSkin, [0, 0.07, 0]);
  skull.scale.set(0.89, 1.04, 0.88);
  block(head, [0.29, 0.14, 0.20], [0, -0.11, 0.115], color.zombieShade, 0.05);
  block(head, [0.24, 0.055, 0.04], [0, -0.10, 0.23], color.mouth, 0.01);
  for (const side of [-1, 1]) {
    block(head, [0.12, 0.075, 0.035], [side * 0.105, 0.12, 0.22], color.socket, 0.013);
    block(head, [0.052, 0.043, 0.025], [side * 0.105, 0.12, 0.245], color.eye, 0.009);
  }
  return { root, legs, arms, torso, head };
}

function pose(type, rig, clip, frame, frames) {
  const phase = frame / frames * Math.PI * 2;
  const wave = Math.sin(phase), counter = Math.cos(phase);
  const walking = clip === 'walk';
  const sn = type === 'sniper';
  rig.torso.position.set(0, sn ? 1.0 : 0.98, 0);
  rig.torso.rotation.set(sn ? -0.05 : 0.17, 0, 0);
  rig.torso.scale.set(1, 1, 1);
  rig.head.rotation.set(0, 0, 0);
  for (const leg of rig.legs) {
    leg.hip.rotation.set(0, 0, 0);
    leg.knee.rotation.set(0, 0, 0);
    leg.ankle.rotation.set(0, 0, 0);
  }
  for (const arm of rig.arms) {
    arm.shoulder.rotation.set(0, 0, 0);
    arm.elbow.rotation.set(0, 0, 0);
  }
  if (sn) {
    rig.rifle.position.set(0.11, 0.42, 0.34);
    rig.rifle.rotation.set(0, 0, 0);
    rig.flash.visible = false;
    rig.arms[0].shoulder.rotation.x = -0.90;
    rig.arms[1].shoulder.rotation.x = -1.08;
    rig.arms[0].elbow.rotation.x = -0.34;
    rig.arms[1].elbow.rotation.x = -0.18;
  } else {
    rig.arms[0].shoulder.rotation.x = -0.34;
    rig.arms[1].shoulder.rotation.x = -0.52;
    rig.arms[0].elbow.rotation.x = -0.18;
    rig.arms[1].elbow.rotation.x = -0.24;
    rig.arms[0].shoulder.rotation.z = -0.14;
    rig.arms[1].shoulder.rotation.z = 0.14;
  }

  if (walking) {
    const amplitude = sn ? 0.59 : 0.48;
    for (let i = 0; i < 2; i++) {
      const stride = (i === 0 ? 1 : -1) * wave;
      rig.legs[i].hip.rotation.x = stride * amplitude;
      rig.legs[i].knee.rotation.x = 0.11 + Math.max(0, -stride) * (sn ? 0.72 : 0.57);
      rig.legs[i].ankle.rotation.x = -rig.legs[i].hip.rotation.x * 0.38 - rig.legs[i].knee.rotation.x * 0.26;
    }
    rig.torso.position.y += Math.abs(counter) * 0.064;
    rig.torso.rotation.z = wave * (sn ? 0.045 : 0.07);
    rig.torso.rotation.y = counter * 0.075;
    rig.torso.rotation.x += sn ? -0.075 : 0.075;
    rig.head.rotation.z = -rig.torso.rotation.z * 0.45;
    rig.head.rotation.x = -counter * 0.06;
    if (sn) {
      rig.rifle.rotation.x = counter * 0.035;
      rig.arms[0].shoulder.rotation.x += wave * 0.10;
      rig.arms[1].shoulder.rotation.x -= wave * 0.08;
    } else {
      rig.arms[0].shoulder.rotation.x += wave * 0.40;
      rig.arms[1].shoulder.rotation.x -= wave * 0.29;
      rig.arms[0].elbow.rotation.x -= Math.max(0, wave) * 0.28;
      rig.arms[1].elbow.rotation.x -= Math.max(0, -wave) * 0.25;
    }
  } else if (clip === 'idle') {
    rig.torso.scale.y = 1 + wave * 0.012;
    rig.head.rotation.z = counter * (sn ? 0.012 : 0.025);
    if (!sn) rig.arms[0].shoulder.rotation.x += wave * 0.035;
  } else if (sn && clip === 'shoot') {
    const recoil = [0, 0.04, 0.18, 0.22, 0.09, 0][frame];
    rig.rifle.position.z -= recoil;
    rig.rifle.rotation.x = -recoil * 0.34;
    rig.torso.rotation.x -= recoil * 0.45;
    rig.head.rotation.x = recoil * 0.35;
    rig.flash.visible = frame === 1 || frame === 2;
    rig.flash.scale.setScalar(frame === 1 ? 1.0 : 0.62);
  } else if (sn && clip === 'gather') {
    const reach = [0.12, 0.24, 0.38, 0.44, 0.28, 0.12][frame];
    rig.torso.rotation.x += reach;
    rig.head.rotation.x = -reach * 0.35;
    rig.arms[0].shoulder.rotation.x = -0.36 - reach * 1.4;
    rig.arms[1].shoulder.rotation.x = -0.39 - reach * 1.2;
    rig.arms[0].elbow.rotation.x = -0.45;
    rig.arms[1].elbow.rotation.x = -0.47;
    rig.rifle.rotation.x = 0.8;
    rig.rifle.position.z = 0.12;
    rig.legs[0].knee.rotation.x = 0.25;
  } else if (!sn && clip === 'attack') {
    const lunge = [0, 0.14, 0.34, 0.41, 0.20, 0][frame];
    rig.torso.rotation.x += lunge * 0.45;
    rig.torso.position.z += lunge;
    rig.head.rotation.x = -lunge * 0.18;
    rig.arms[0].shoulder.rotation.x = -0.4 - lunge * 1.8;
    rig.arms[1].shoulder.rotation.x = -0.52 - lunge * 1.5;
    rig.arms[0].elbow.rotation.x = -0.23 - lunge * 0.7;
    rig.arms[1].elbow.rotation.x = -0.26 - lunge * 0.6;
    rig.legs[0].hip.rotation.x = -lunge * 0.45;
    rig.legs[1].knee.rotation.x = lunge * 0.35;
  }
}

export function buildAtlas(type) {
  if (!CLIPS[type]) throw new Error(`Unknown atlas: diorama/${type}`);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(CELL.width, CELL.height, false);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe5f1fc, 0x514939, 1.05));
  const key = new THREE.DirectionalLight(0xffd69b, 2.8);
  key.position.set(-3, 7, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ec8d0, 1.0);
  rim.position.set(5, 4, -4);
  scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.62, -1.62, 0.1, 30);
  camera.position.set(6, 6.2, 8);
  camera.lookAt(0, 1.12, 0);

  const rig = type === 'sniper' ? makeSniper() : makeWalker();
  scene.add(rig.root);
  const clips = CLIPS[type];
  const canvas = document.createElement('canvas');
  canvas.width = CELL.width * Math.max(...clips.map(clip => clip.frames));
  canvas.height = CELL.height * DIRECTIONS.length * clips.length;
  const ctx = canvas.getContext('2d');
  const frameData = {};
  for (const [clipIndex, clip] of clips.entries()) {
    frameData[clip.name] = { fps: clip.fps, loop: clip.loop, directions: {} };
    for (const [directionIndex, direction] of DIRECTIONS.entries()) {
      rig.root.rotation.y = yaw[direction];
      const frames = [];
      for (let frame = 0; frame < clip.frames; frame++) {
        pose(type, rig, clip.name, frame, clip.frames);
        renderer.render(scene, camera);
        const x = frame * CELL.width;
        const y = (clipIndex * DIRECTIONS.length + directionIndex) * CELL.height;
        ctx.drawImage(renderer.domElement, x, y);
        frames.push({ x, y, width: CELL.width, height: CELL.height });
      }
      frameData[clip.name].directions[direction] = frames;
    }
  }
  renderer.dispose();
  return { canvas, metadata: {
    image: imageName('diorama', type), style: 'diorama',
    cell: { width: CELL.width, height: CELL.height },
    footAnchor: { x: CELL.footX, y: CELL.footY },
    directions: DIRECTIONS, clips: frameData,
  } };
}
