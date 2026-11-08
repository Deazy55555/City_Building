import * as THREE from 'three';
import type { BType } from './data';

// ---------- shared materials & geometry ----------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.85, metal = 0, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${color}-${rough}-${metal}-${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 0.25;
    }
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const box = (w: number, h: number, d: number) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, s = 6) =>
  cached(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r: number, h: number, s = 6) => cached(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const sphere = (r: number, d = 1) => cached(`s${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const dodeca = (r: number) => cached(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));
const octa = (r: number) => cached(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));

function m(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const me = new THREE.Mesh(geo, material);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  me.receiveShadow = true;
  return me;
}

/** Triangular prism roof, ridge along X */
function prismRoof(w: number, h: number, d: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = cached(`prism${w},${h},${d}`, () => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
  return m(geo, material);
}

export const COLORS = {
  wood: 0x9c6b3f,
  darkWood: 0x6b4428,
  stone: 0xa39f94,
  darkStone: 0x7d7a72,
  thatch: 0xd9b35b,
  roofRed: 0xb4533a,
  plaster: 0xeadfc4,
  soil: 0x7a5434,
  leaf: [0x4f9a3c, 0x5fae45, 0x3f8a3a, 0x6bb84a],
  pine: [0x2f7d4a, 0x3a8c52, 0x2a6e42],
  skin: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac],
  hair: [0x3b2a1a, 0x6b4423, 0x1c1c1c, 0xa0522d, 0xd6b25e],
  tunic: [0x3d7cc9, 0xc94f3d, 0x4fa35a, 0xd9a43d, 0x8a5bc9, 0x3db3b3],
};

// ---------- villager ----------
export interface VillagerParts {
  hipL: THREE.Group; hipR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  body: THREE.Object3D;
  tools: Record<'axe' | 'pick' | 'basket' | 'hammer' | 'spear', THREE.Object3D>;
  bundle: THREE.Mesh;
}

export function makeVillager(rnd: () => number = Math.random) {
  const pickc = (arr: number[]) => arr[Math.floor(rnd() * arr.length)];
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const tunic = pickc(COLORS.tunic);
  const skin = mat(pickc(COLORS.skin), 0.7);
  const pants = mat(0x5b4636);

  const mkLeg = (x: number) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.32, 0);
    hip.add(m(box(0.09, 0.32, 0.1), pants, 0, -0.16, 0));
    hip.add(m(box(0.1, 0.06, 0.14), mat(0x3a2a1e), 0, -0.3, 0.02));
    inner.add(hip);
    return hip;
  };
  const hipL = mkLeg(-0.065);
  const hipR = mkLeg(0.065);

  const body = m(box(0.26, 0.32, 0.17), mat(tunic), 0, 0.48, 0);
  inner.add(body);
  inner.add(m(box(0.27, 0.05, 0.18), mat(0x4a3220), 0, 0.36, 0));
  inner.add(m(sphere(0.115, 1), skin, 0, 0.75, 0));
  const hair = m(sphere(0.12, 1), mat(pickc(COLORS.hair)), 0, 0.79, -0.02);
  hair.scale.set(1, 0.75, 1);
  inner.add(hair);
  // eyes
  const eye = mat(0x222222);
  inner.add(m(box(0.025, 0.03, 0.01), eye, -0.04, 0.76, 0.108, false));
  inner.add(m(box(0.025, 0.03, 0.01), eye, 0.04, 0.76, 0.108, false));

  const mkArm = (x: number) => {
    const sh = new THREE.Group();
    sh.position.set(x, 0.62, 0);
    sh.add(m(box(0.07, 0.26, 0.08), mat(tunic), 0, -0.12, 0));
    sh.add(m(box(0.065, 0.06, 0.065), skin, 0, -0.27, 0));
    inner.add(sh);
    return sh;
  };
  const armL = mkArm(-0.17);
  const armR = mkArm(0.17);

  // tools in right hand
  const handle = mat(COLORS.darkWood);
  const metal = mat(0xb8bcc2, 0.4, 0.6);
  const mkTool = (build: (t: THREE.Group) => void) => {
    const t = new THREE.Group();
    t.position.set(0, -0.28, 0.02);
    build(t);
    t.visible = false;
    armR.add(t);
    return t;
  };
  const axe = mkTool((t) => {
    t.add(m(cyl(0.015, 0.015, 0.32, 5), handle, 0, 0, 0.1).rotateX(Math.PI / 2));
    t.add(m(box(0.02, 0.09, 0.07), metal, 0, 0.03, 0.24));
  });
  const pick = mkTool((t) => {
    t.add(m(cyl(0.015, 0.015, 0.32, 5), handle, 0, 0, 0.1).rotateX(Math.PI / 2));
    t.add(m(box(0.02, 0.03, 0.2), metal, 0, 0.0, 0.25).rotateX(Math.PI / 2));
  });
  const hammer = mkTool((t) => {
    t.add(m(cyl(0.015, 0.015, 0.26, 5), handle, 0, 0, 0.08).rotateX(Math.PI / 2));
    t.add(m(box(0.05, 0.05, 0.1), metal, 0, 0, 0.2).rotateX(Math.PI / 2));
  });
  const spear = mkTool((t) => {
    t.add(m(cyl(0.012, 0.012, 0.6, 5), handle, 0, 0, 0.1).rotateX(Math.PI / 2));
    t.add(m(cone(0.03, 0.08, 4), metal, 0, 0, 0.43).rotateX(Math.PI / 2));
  });
  const basket = new THREE.Group();
  basket.add(m(cyl(0.08, 0.06, 0.09, 7), mat(0xc8a165), 0, 0, 0));
  basket.position.set(-0.17, 0.4, 0.1);
  basket.visible = false;
  inner.add(basket);

  // bundle carried on the back
  const bundle = m(box(0.18, 0.16, 0.1), mat(0xffffff), 0, 0.52, -0.14);
  bundle.visible = false;
  inner.add(bundle);

  g.scale.setScalar(1.2);
  const parts: VillagerParts = { hipL, hipR, armL, armR, body, tools: { axe, pick, basket, hammer, spear }, bundle };
  g.userData.parts = parts;
  g.userData.inner = inner;
  return g;
}

export type VillagerAnim = 'idle' | 'walk' | 'chop' | 'mine' | 'pick' | 'build';

export function animateVillager(g: THREE.Group, anim: VillagerAnim, t: number) {
  const p = g.userData.parts as VillagerParts;
  const inner = g.userData.inner as THREE.Group;
  inner.position.y = 0;
  p.hipL.rotation.x = 0; p.hipR.rotation.x = 0;
  p.armL.rotation.x = 0; p.armR.rotation.x = 0;
  p.armL.rotation.z = 0; p.armR.rotation.z = 0;
  if (anim === 'walk') {
    const s = Math.sin(t * 10);
    p.hipL.rotation.x = s * 0.6;
    p.hipR.rotation.x = -s * 0.6;
    p.armL.rotation.x = -s * 0.5;
    p.armR.rotation.x = s * 0.5;
    inner.position.y = Math.abs(Math.cos(t * 10)) * 0.03;
  } else if (anim === 'chop' || anim === 'mine' || anim === 'build') {
    const speed = anim === 'build' ? 7 : 5;
    const ph = (t * speed) % (Math.PI * 2);
    const swing = ph < Math.PI * 1.4 ? -2.4 * (ph / (Math.PI * 1.4)) : -2.4 + 2.4 * ((ph - Math.PI * 1.4) / (Math.PI * 0.6));
    p.armR.rotation.x = swing;
    p.armL.rotation.x = swing * 0.6;
  } else if (anim === 'pick') {
    p.armR.rotation.x = -1.0 + Math.sin(t * 6) * 0.4;
    p.armL.rotation.x = -0.4;
    inner.position.y = -0.02 + Math.sin(t * 6) * 0.01;
  } else {
    inner.position.y = Math.sin(t * 2) * 0.005;
    p.armL.rotation.z = 0.05;
    p.armR.rotation.z = -0.05;
  }
}

export function setVillagerTool(g: THREE.Group, tool: keyof VillagerParts['tools'] | null) {
  const p = g.userData.parts as VillagerParts;
  for (const k of Object.keys(p.tools) as (keyof VillagerParts['tools'])[]) p.tools[k].visible = k === tool;
}

const BUNDLE_COLOR = { food: 0xd8433b, wood: 0x8b5a2b, stone: 0x9a9a9a, gold: 0xf0c419 };
export function setVillagerBundle(g: THREE.Group, type: keyof typeof BUNDLE_COLOR | null, amount: number) {
  const p = g.userData.parts as VillagerParts;
  if (!type || amount <= 0) {
    p.bundle.visible = false;
    return;
  }
  p.bundle.visible = true;
  p.bundle.material = mat(BUNDLE_COLOR[type]);
  const s = 0.5 + Math.min(1, amount / 10) * 0.6;
  p.bundle.scale.setScalar(s);
}

// ---------- deer ----------
export function makeDeer(rnd: () => number = Math.random) {
  const g = new THREE.Group();
  const fur = mat(rnd() < 0.5 ? 0xa0673a : 0x8f5b33);
  const light = mat(0xe8d2b0);
  const dark = mat(0x3b2a1e);
  g.add(m(box(0.5, 0.22, 0.2), fur, 0, 0.42, 0));
  g.add(m(box(0.12, 0.1, 0.18), light, -0.24, 0.45, 0)); // tail patch
  const neck = new THREE.Group();
  neck.position.set(0.22, 0.48, 0);
  neck.add(m(box(0.1, 0.24, 0.1), fur, 0.03, 0.1, 0).rotateZ(-0.4));
  const head = m(box(0.18, 0.1, 0.1), fur, 0.13, 0.22, 0);
  neck.add(head);
  neck.add(m(box(0.03, 0.03, 0.03), dark, 0.23, 0.22, 0)); // nose
  if (rnd() < 0.5) {
    const ant = mat(0xd9c4a0);
    neck.add(m(box(0.02, 0.14, 0.02), ant, 0.08, 0.32, 0.04).rotateZ(0.3));
    neck.add(m(box(0.02, 0.14, 0.02), ant, 0.08, 0.32, -0.04).rotateZ(0.3));
  }
  g.add(neck);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[0.18, 0.07], [0.18, -0.07], [-0.18, 0.07], [-0.18, -0.07]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.34, z);
    hip.add(m(box(0.05, 0.34, 0.05), fur, 0, -0.17, 0));
    hip.add(m(box(0.055, 0.04, 0.055), dark, 0, -0.33, 0));
    g.add(hip);
    legs.push(hip);
  }
  g.userData.legs = legs;
  g.userData.neck = neck;
  g.scale.setScalar(1.15);
  return g;
}

export function animateDeer(g: THREE.Group, moving: boolean, grazing: boolean, t: number) {
  const legs = g.userData.legs as THREE.Group[];
  const neck = g.userData.neck as THREE.Group;
  const s = moving ? Math.sin(t * 9) * 0.5 : 0;
  legs[0].rotation.z = s; legs[3].rotation.z = s;
  legs[1].rotation.z = -s; legs[2].rotation.z = -s;
  neck.rotation.z = grazing ? -0.9 + Math.sin(t * 3) * 0.08 : 0;
}

// ---------- resource nodes ----------
export function makeTree(rnd: () => number) {
  const g = new THREE.Group();
  const trunk = mat(COLORS.darkWood);
  if (rnd() < 0.55) {
    const c = mat(COLORS.pine[Math.floor(rnd() * COLORS.pine.length)]);
    g.add(m(cyl(0.06, 0.09, 0.4, 5), trunk, 0, 0.2, 0));
    g.add(m(cone(0.48, 0.6, 7), c, 0, 0.6, 0));
    g.add(m(cone(0.38, 0.5, 7), c, 0, 0.92, 0));
    g.add(m(cone(0.25, 0.42, 7), c, 0, 1.2, 0));
  } else {
    const c = mat(COLORS.leaf[Math.floor(rnd() * COLORS.leaf.length)]);
    g.add(m(cyl(0.07, 0.1, 0.55, 5), trunk, 0, 0.27, 0));
    g.add(m(sphere(0.42, 0), c, 0, 0.82, 0));
    g.add(m(sphere(0.28, 0), c, 0.18, 1.05, 0.08));
    g.add(m(sphere(0.25, 0), c, -0.17, 0.98, -0.1));
  }
  const s = 0.85 + rnd() * 0.45;
  g.scale.set(s, s * (0.9 + rnd() * 0.3), s);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

export function makeStump() {
  const g = new THREE.Group();
  g.add(m(cyl(0.09, 0.11, 0.12, 6), mat(COLORS.darkWood), 0, 0.06, 0));
  g.add(m(cyl(0.085, 0.085, 0.01, 6), mat(0xd6b98a), 0, 0.125, 0, false));
  return g;
}

export function makeBerryBush(rnd: () => number) {
  const g = new THREE.Group();
  const leaf = mat(0x3f8f3a);
  const b = m(sphere(0.33, 0), leaf, 0, 0.22, 0);
  b.scale.set(1, 0.75, 1);
  g.add(b);
  g.add(m(sphere(0.2, 0), leaf, 0.2, 0.18, 0.1));
  const berries = new THREE.Group();
  const red = mat(0xd8323b, 0.5);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.12 + rnd() * 0.25;
    berries.add(m(sphere(0.045, 0), red, Math.cos(a) * 0.3, y, Math.sin(a) * 0.3, false));
  }
  g.add(berries);
  g.userData.berries = berries;
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

export function makeRock(kind: 'stone' | 'gold', rnd: () => number) {
  const g = new THREE.Group();
  const rock = mat(kind === 'stone' ? COLORS.stone : COLORS.darkStone);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const r = 0.18 + rnd() * 0.16;
    const me = m(dodeca(r), rock, (rnd() - 0.5) * 0.4, r * 0.7, (rnd() - 0.5) * 0.4);
    me.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(me);
  }
  if (kind === 'gold') {
    const gold = mat(0xf2c230, 0.3, 0.8, 0xf2c230);
    for (let i = 0; i < 6; i++) {
      const me = m(octa(0.06 + rnd() * 0.04), gold, (rnd() - 0.5) * 0.45, 0.12 + rnd() * 0.25, (rnd() - 0.5) * 0.45);
      me.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(me);
    }
  }
  return g;
}

export function makeCarcass() {
  const g = new THREE.Group();
  const fur = mat(0x7d4f2c);
  g.add(m(box(0.45, 0.16, 0.2), fur, 0, 0.09, 0));
  g.add(m(box(0.16, 0.09, 0.1), fur, 0.3, 0.06, 0.05));
  for (const x of [0.15, -0.15]) g.add(m(box(0.3, 0.04, 0.04), fur, x, 0.04, 0.16).rotateY(0.2));
  return g;
}

// ---------- buildings ----------
function scaffold(size: number) {
  const g = new THREE.Group();
  const pole = mat(0xc9a06a);
  const s = size / 2 - 0.15;
  for (const [x, z] of [[s, s], [-s, s], [s, -s], [-s, -s]]) g.add(m(cyl(0.035, 0.035, 1.2, 5), pole, x, 0.6, z));
  g.add(m(box(size - 0.3, 0.04, 0.04), pole, 0, 1.0, s));
  g.add(m(box(size - 0.3, 0.04, 0.04), pole, 0, 1.0, -s));
  g.add(m(box(0.04, 0.04, size - 0.3), pole, s, 0.7, 0));
  g.add(m(box(0.04, 0.04, size - 0.3), pole, -s, 0.7, 0));
  return g;
}

function townCenter() {
  const g = new THREE.Group();
  const stone = mat(COLORS.stone), dark = mat(COLORS.darkWood), plaster = mat(COLORS.plaster), thatch = mat(COLORS.thatch);
  g.add(m(box(2.9, 0.28, 2.9), stone, 0, 0.14, 0));
  g.add(m(box(2.3, 1.15, 2.3), plaster, 0, 0.28 + 0.575, 0));
  for (const [x, z] of [[1.13, 1.13], [-1.13, 1.13], [1.13, -1.13], [-1.13, -1.13]]) g.add(m(box(0.16, 1.2, 0.16), dark, x, 0.88, z));
  g.add(m(box(2.42, 0.12, 2.42), dark, 0, 1.46, 0));
  g.add(m(box(2.42, 0.08, 0.1), dark, 0, 0.9, 1.16));
  const roof = m(cone(2.05, 1.35, 4), thatch, 0, 1.52 + 0.675, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(m(box(0.55, 0.75, 0.06), dark, 0, 0.28 + 0.375, 1.16));
  g.add(m(box(0.08, 0.08, 0.02), mat(0xd4af37, 0.3, 0.7), 0.17, 0.66, 1.2));
  const win = mat(0x3b2f25);
  for (const x of [-0.75, 0.75]) g.add(m(box(0.32, 0.3, 0.05), win, x, 1.0, 1.16));
  for (const z of [-0.6, 0.6]) {
    g.add(m(box(0.05, 0.3, 0.32), win, 1.16, 1.0, z));
    g.add(m(box(0.05, 0.3, 0.32), win, -1.16, 1.0, z));
  }
  g.add(m(box(0.3, 0.9, 0.3), stone, 0.7, 2.2, -0.5));
  // flag
  g.add(m(cyl(0.025, 0.025, 1.0, 5), dark, 0, 3.3, 0));
  const flag = new THREE.Group();
  flag.position.set(0, 3.65, 0);
  flag.add(m(box(0.45, 0.28, 0.02), mat(0x2f6fd6), 0.23, 0, 0));
  flag.add(m(box(0.12, 0.12, 0.03), mat(0xf2c230), 0.23, 0, 0));
  g.add(flag);
  g.userData.flag = flag;
  // banners & barrels
  g.add(m(cyl(0.12, 0.12, 0.3, 8), mat(COLORS.wood), 1.25, 0.43, 1.3));
  g.add(m(cyl(0.12, 0.12, 0.3, 8), mat(COLORS.wood), -1.25, 0.43, 1.3));
  return g;
}

function house(rnd: () => number) {
  const g = new THREE.Group();
  g.add(m(box(1.6, 0.15, 1.6), mat(COLORS.stone), 0, 0.075, 0));
  g.add(m(box(1.3, 0.8, 1.1), mat(COLORS.plaster), 0, 0.55, 0));
  const dark = mat(COLORS.darkWood);
  for (const [x, z] of [[0.64, 0.54], [-0.64, 0.54], [0.64, -0.54], [-0.64, -0.54]]) g.add(m(box(0.08, 0.82, 0.08), dark, x, 0.56, z));
  const roof = prismRoof(1.55, 0.65, 1.4, mat(rnd() < 0.5 ? COLORS.roofRed : COLORS.thatch));
  roof.position.y = 0.95;
  g.add(roof);
  g.add(m(box(0.3, 0.5, 0.05), dark, 0.2, 0.4, 0.56));
  g.add(m(box(0.25, 0.22, 0.05), mat(0x3b2f25), -0.32, 0.6, 0.56));
  g.add(m(box(0.18, 0.4, 0.18), mat(COLORS.stone), -0.45, 1.35, -0.2));
  return g;
}

function farm(rnd: () => number) {
  const g = new THREE.Group();
  g.add(m(box(2.85, 0.08, 2.85), mat(COLORS.soil), 0, 0.04, 0));
  const crops = new THREE.Group();
  const green = mat(0x7cbf3f), gold = mat(0xe3c04a);
  for (let r = 0; r < 5; r++) {
    g.add(m(box(2.6, 0.03, 0.18), mat(0x5e3f26), 0, 0.09, -1.1 + r * 0.55, false));
    for (let c = 0; c < 8; c++) {
      const p = m(cone(0.08, 0.32, 4), rnd() < 0.5 ? green : gold, -1.15 + c * 0.33, 0.24, -1.1 + r * 0.55);
      crops.add(p);
    }
  }
  g.add(crops);
  g.userData.crops = crops;
  const post = mat(COLORS.wood);
  for (let i = 0; i <= 6; i++) {
    const t = -1.4 + i * (2.8 / 6);
    for (const [x, z] of [[t, 1.4], [t, -1.4], [1.4, t], [-1.4, t]]) g.add(m(box(0.06, 0.25, 0.06), post, x, 0.12, z));
  }
  for (const [x, z, ry] of [[0, 1.4, 0], [0, -1.4, 0], [1.4, 0, Math.PI / 2], [-1.4, 0, Math.PI / 2]] as const)
    g.add(m(box(2.8, 0.04, 0.03), post, x, 0.2, z).rotateY(ry));
  return g;
}

function storehouse() {
  const g = new THREE.Group();
  const wood = mat(COLORS.wood), dark = mat(COLORS.darkWood);
  g.add(m(box(1.7, 0.12, 1.7), mat(COLORS.stone), 0, 0.06, 0));
  g.add(m(box(1.5, 0.85, 1.1), wood, 0, 0.55, -0.15));
  for (let i = 0; i < 5; i++) g.add(m(box(0.03, 0.85, 0.02), dark, -0.6 + i * 0.3, 0.55, 0.41, false));
  const roof = prismRoof(1.7, 0.5, 1.4, dark);
  roof.position.set(0, 0.97, -0.15);
  g.add(roof);
  g.add(m(box(0.45, 0.6, 0.05), mat(0x3b2f25), 0, 0.42, 0.41));
  const crate = mat(0xc49a5c);
  g.add(m(box(0.28, 0.28, 0.28), crate, -0.55, 0.26, 0.6));
  g.add(m(box(0.22, 0.22, 0.22), crate, -0.52, 0.51, 0.6).rotateY(0.3));
  g.add(m(cyl(0.12, 0.12, 0.3, 8), wood, 0.55, 0.27, 0.62));
  g.add(m(cyl(0.12, 0.12, 0.3, 8), wood, 0.3, 0.27, 0.68));
  return g;
}

export function makeBuilding(type: BType, rnd: () => number = Math.random) {
  const wrap = new THREE.Group();
  const model = type === 'towncenter' ? townCenter() : type === 'house' ? house(rnd) : type === 'farm' ? farm(rnd) : storehouse();
  wrap.add(model);
  const size = type === 'towncenter' ? 3 : type === 'farm' ? 3 : 2;
  const sc = scaffold(size);
  sc.visible = false;
  wrap.add(sc);
  wrap.userData.model = model;
  wrap.userData.scaffold = sc;
  return wrap;
}

export function setBuildProgress(wrap: THREE.Group, progress: number, built: boolean) {
  const model = wrap.userData.model as THREE.Group;
  const sc = wrap.userData.scaffold as THREE.Group;
  if (built) {
    model.scale.set(1, 1, 1);
    sc.visible = false;
  } else {
    model.scale.set(1, 0.08 + 0.92 * progress, 1);
    sc.visible = true;
  }
}

/** Translucent copy used to preview placement */
export function makeGhost(type: BType) {
  const g = makeBuilding(type);
  const good = new THREE.MeshStandardMaterial({ color: 0x55ff77, transparent: true, opacity: 0.5, depthWrite: false });
  const bad = new THREE.MeshStandardMaterial({ color: 0xff5555, transparent: true, opacity: 0.5, depthWrite: false });
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).material = good;
      o.castShadow = false;
    }
  });
  g.userData.good = good;
  g.userData.bad = bad;
  return g;
}

export function setGhostValid(g: THREE.Group, ok: boolean) {
  const matl = ok ? g.userData.good : g.userData.bad;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = matl;
  });
}
