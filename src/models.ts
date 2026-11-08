import * as THREE from 'three';
import type { BType } from './data';
import { atlasMaterial, model, type StaticName } from './assets';
import { makeHorse, type Quad } from './animals';

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

// ---------- trees & rocks (KayKit models) ----------
export function makeTree(rnd: () => number) {
  const t = model(rnd() < 0.5 ? 'tree_single_A' : 'tree_single_B');
  const s = 1.15 + rnd() * 0.5;
  t.scale.set(s, s * (0.9 + rnd() * 0.25), s);
  t.rotation.y = rnd() * Math.PI * 2;
  return t;
}

export function makeStump(rnd: () => number = Math.random) {
  const t = model(rnd() < 0.5 ? 'tree_single_A_cut' : 'tree_single_B_cut');
  t.scale.setScalar(1.3);
  t.rotation.y = rnd() * 6;
  return t;
}

const goldRockMat = () => {
  const m = atlasMaterial.clone();
  m.color = new THREE.Color(0x8c8378);
  return m;
};
let _goldRock: THREE.MeshStandardMaterial | null = null;

export function makeRock(kind: 'stone' | 'gold', rnd: () => number) {
  const g = new THREE.Group();
  const names: StaticName[] = ['rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'];
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const r = model(names[Math.floor(rnd() * names.length)]);
    const s = (i === 0 ? 2.0 : 1.3) + rnd() * 0.6;
    r.scale.set(s, s * (0.9 + rnd() * 0.5), s);
    r.position.set(i === 0 ? 0 : (rnd() - 0.5) * 0.55, 0, i === 0 ? 0 : (rnd() - 0.5) * 0.55);
    r.rotation.y = rnd() * 6;
    if (kind === 'gold') {
      _goldRock ??= goldRockMat();
      r.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = _goldRock!; });
    }
    g.add(r);
  }
  if (kind === 'gold') {
    const gold = mat(0xf7c935, 0.25, 0.85, 0xffc400);
    gold.emissiveIntensity = 0.6;
    for (let i = 0; i < 7; i++) {
      const me = m(octa(0.06 + rnd() * 0.05), gold, (rnd() - 0.5) * 0.5, 0.12 + rnd() * 0.3, (rnd() - 0.5) * 0.5);
      me.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(me);
    }
  } else {
    const st = model('resource_stone');
    st.scale.setScalar(0.9);
    st.position.set(0.3, 0, 0.25);
    st.rotation.y = rnd() * 6;
    g.add(st);
  }
  return g;
}

// ---------- buildings (KayKit models) ----------
interface BuildingLook { name: StaticName; scale: number; rotY?: number }
const LOOKS: Record<BType, BuildingLook[]> = {
  towncenter: [{ name: 'building_castle', scale: 1.3 }],
  house: [{ name: 'building_home_A', scale: 2.0 }, { name: 'building_home_B', scale: 1.6 }],
  farm: [{ name: 'building_grain', scale: 1.42 }],
  storehouse: [{ name: 'building_market', scale: 1.05 }],
  barracks: [{ name: 'building_barracks', scale: 1.25 }],
  tower: [{ name: 'building_tower_A', scale: 1.5 }],
  archery: [{ name: 'building_archeryrange', scale: 1.3 }],
  stables: [],
};
// the Bronze Age paints the town red
const LOOKS_BRONZE: Partial<Record<BType, BuildingLook[]>> = {
  towncenter: [{ name: 'building_castle_red', scale: 1.3 }],
  house: [{ name: 'building_home_A_red', scale: 2.0 }, { name: 'building_home_B_red', scale: 1.6 }],
  storehouse: [{ name: 'building_market_red', scale: 1.05 }],
  barracks: [{ name: 'building_barracks_red', scale: 1.25 }],
  tower: [{ name: 'building_tower_A_red', scale: 1.5 }],
  archery: [{ name: 'building_archeryrange_red', scale: 1.3 }],
};
const SIZE: Record<BType, number> = { towncenter: 3, house: 2, farm: 3, storehouse: 2, barracks: 2, tower: 2, archery: 2, stables: 3 };
export const AGE_COLOR = { roof: [0x3d6fc4, 0xb5463a, 0x3f9a4a], blanket: [0x2f6fd6, 0xc0392b, 0x3f9a4a] };

/** A stable: a wooden shelter, a fenced paddock, hay, a trough, and horses */
function stables(rnd: () => number, age: number) {
  const g = new THREE.Group();
  const wood = mat(COLORS.wood), dark = mat(COLORS.darkWood), roof = mat(AGE_COLOR.roof[Math.min(age, 3) - 1], 0.7);
  // shelter along the back
  for (const x of [-1.25, 0, 1.25]) for (const z of [-1.25, -0.35]) g.add(m(box(0.12, z < -1 ? 1.25 : 1.05, 0.12), dark, x, z < -1 ? 0.62 : 0.52, z));
  g.add(m(box(2.7, 0.1, 0.12), dark, 0, 1.2, -1.25));
  const r = m(box(2.9, 0.08, 1.25), roof, 0, 1.2, -0.8);
  r.rotation.x = -0.18;
  g.add(r);
  g.add(m(box(2.6, 0.7, 0.06), wood, 0, 0.35, -1.3));
  for (let k = 0; k < 6; k++) g.add(m(box(0.03, 0.7, 0.02), dark, -1.1 + k * 0.44, 0.35, -1.26, false));
  // fence around the paddock
  const post = mat(COLORS.wood);
  for (let i = 0; i <= 6; i++) {
    const t = -1.4 + i * (2.8 / 6);
    for (const [x, z] of [[t, 1.4], [1.4, t], [-1.4, t]]) g.add(m(box(0.07, 0.36, 0.07), post, x, 0.18, z));
  }
  for (const [x, z, ry] of [[0, 1.4, 0], [1.4, 0, Math.PI / 2], [-1.4, 0, Math.PI / 2]] as const) {
    g.add(m(box(2.8, 0.05, 0.04), post, x, 0.28, z).rotateY(ry));
    g.add(m(box(2.8, 0.05, 0.04), post, x, 0.14, z).rotateY(ry));
  }
  // hay bales and a water trough
  const hay = mat(0xe3c04a, 0.9);
  for (const [x, z] of [[-1.05, -0.85], [-0.7, -0.95], [-0.88, -0.6]]) g.add(m(cyl(0.16, 0.16, 0.3, 10), hay, x, 0.16, z).rotateZ(Math.PI / 2));
  g.add(m(box(0.7, 0.2, 0.25), wood, 0.85, 0.12, -0.8));
  g.add(m(box(0.62, 0.02, 0.18), mat(0x4aa3df, 0.2), 0.85, 0.215, -0.8, false));
  const horses: Quad[] = [];
  for (const [x, z, ry] of [[-0.3, 0.55, 0.4], [0.75, 0.35, 2.6]] as const) {
    const h = makeHorse(rnd, AGE_COLOR.blanket[Math.min(age, 3) - 1]);
    if (h.saddle) h.saddle.visible = false;
    h.root.scale.setScalar(0.85);
    h.root.position.set(x, 0, z);
    h.root.rotation.y = ry;
    g.add(h.root);
    horses.push(h);
  }
  g.userData.horses = horses;
  return g;
}

function props(type: BType, rnd: () => number) {
  const g = new THREE.Group();
  const put = (name: StaticName, x: number, z: number, s = 1.4, ry = rnd() * 6) => {
    const p = model(name);
    p.scale.setScalar(s);
    p.position.set(x, 0, z);
    p.rotation.y = ry;
    g.add(p);
  };
  if (type === 'towncenter') {
    put('barrel', 1.25, 1.2); put('barrel', 1.05, 1.35, 1.2);
    put('crate_A_big', -1.2, 1.2, 1.3); put('crate_A_small', -1.0, 1.35, 1.3);
    put('wheelbarrow', 1.3, -1.1, 1.6); put('sack', -1.25, -1.2, 1.6);
  } else if (type === 'storehouse') {
    put('resource_lumber', -0.6, 0.75, 1.1, 0); put('resource_stone', 0.6, 0.75, 1.1, 0);
    put('barrel', 0.8, -0.65, 1.3);
  } else if (type === 'barracks') {
    put('weaponrack', 0.8, 0.8, 1.3, 0); put('target', -0.8, 0.85, 1.3, 0);
  } else if (type === 'archery') {
    put('target', 0.85, 0.85, 1.4, 0); put('target', -0.85, 0.85, 1.4, 0); put('barrel', 0.85, -0.7, 1.2);
  } else if (type === 'tower') {
    put('barrel', 0.7, 0.7, 1.1); put('crate_A_small', -0.7, 0.75, 1.1);
  } else if (type === 'house') {
    if (rnd() < 0.6) put(rnd() < 0.5 ? 'barrel' : 'crate_A_small', 0.75, 0.75, 1.2);
  }
  return g;
}

function farmFence() {
  const g = new THREE.Group();
  const post = mat(COLORS.wood);
  for (let i = 0; i <= 6; i++) {
    const t = -1.4 + i * (2.8 / 6);
    for (const [x, z] of [[t, 1.4], [t, -1.4], [1.4, t], [-1.4, t]]) g.add(m(box(0.07, 0.3, 0.07), post, x, 0.15, z));
  }
  for (const [x, z, ry] of [[0, 1.4, 0], [0, -1.4, 0], [1.4, 0, Math.PI / 2], [-1.4, 0, Math.PI / 2]] as const)
    g.add(m(box(2.8, 0.05, 0.04), post, x, 0.24, z).rotateY(ry));
  return g;
}

export function makeBuilding(type: BType, rnd: () => number = Math.random, age = 1) {
  const wrap = new THREE.Group();
  const looks = (age >= 2 ? LOOKS_BRONZE[type] : undefined) ?? LOOKS[type];
  const look = looks[Math.floor(rnd() * Math.max(1, looks.length))];
  const model0 = type === 'stables' ? stables(rnd, age) : model(look.name);
  if (type !== 'stables') model0.scale.setScalar(look.scale);
  wrap.userData.horses = model0.userData.horses ?? [];
  if (type === 'house') model0.rotation.y = rnd() < 0.5 ? 0 : Math.PI / 2;
  const main = new THREE.Group();
  main.add(model0);
  const size = SIZE[type];
  if (type === 'farm') {
    const dirt = model('building_dirt');
    dirt.scale.setScalar(1.42);
    dirt.position.y = 0.01;
    wrap.add(dirt, farmFence());
    wrap.userData.crops = model0;
  } else {
    main.add(props(type, rnd));
  }
  wrap.add(main);
  // construction stages: a little building site that grows, then the real building appears
  const stages = new THREE.Group();
  const stageNames: StaticName[] = ['building_stage_A', 'building_stage_B', 'building_stage_C'];
  for (const n of stageNames) {
    const s = model(n);
    s.scale.setScalar(size * 0.78);
    s.visible = false;
    stages.add(s);
  }
  if (size >= 3 && type !== 'farm') {
    const sc = model('building_scaffolding');
    sc.scale.setScalar(1.3);
    sc.visible = false;
    stages.add(sc);
  }
  wrap.add(stages);
  // rubble, shown when raiders break the building
  const rubble = model('building_destroyed');
  rubble.scale.setScalar(size * 0.62);
  rubble.visible = false;
  wrap.add(rubble);
  wrap.userData.rubble = rubble;
  wrap.userData.main = main;
  wrap.userData.stages = stages;
  wrap.userData.type = type;
  return wrap;
}

export function setBroken(wrap: THREE.Group, broken: boolean) {
  (wrap.userData.main as THREE.Object3D).visible = !broken;
  (wrap.userData.rubble as THREE.Object3D).visible = broken;
}

export function setBuildProgress(wrap: THREE.Group, progress: number, built: boolean) {
  const main = wrap.userData.main as THREE.Group;
  const stages = (wrap.userData.stages as THREE.Group).children;
  const isFarm = wrap.userData.type === 'farm';
  if (built) {
    main.visible = true;
    main.scale.set(1, 1, 1);
    stages.forEach((s) => (s.visible = false));
    return;
  }
  if (isFarm) {
    // fields get planted: crops sprout as it is built
    main.visible = progress > 0.05;
    main.scale.set(1, Math.max(0.05, progress), 1);
    return;
  }
  main.visible = false;
  const k = progress < 0.34 ? 0 : progress < 0.67 ? 1 : 2;
  stages.forEach((s, i) => (s.visible = i === k || (i === 3 && progress > 0.5)));
}

/** Translucent copy used to preview placement */
export function makeGhost(type: BType, age = 1) {
  const g = makeBuilding(type, Math.random, age);
  setBuildProgress(g, 1, true);
  const good = new THREE.MeshStandardMaterial({ color: 0x55ff77, transparent: true, opacity: 0.55, depthWrite: false });
  const bad = new THREE.MeshStandardMaterial({ color: 0xff5555, transparent: true, opacity: 0.55, depthWrite: false });
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
