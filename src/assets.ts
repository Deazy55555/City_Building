import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Models are KayKit packs by Kay Lousberg (CC0). See public/models/LICENSE-*.txt
const STATIC = [
  'building_castle', 'building_home_A', 'building_home_B', 'building_market', 'building_lumbermill', 'building_well',
  'building_stage_A', 'building_stage_B', 'building_stage_C', 'building_scaffolding', 'building_grain', 'building_dirt',
  'tree_single_A', 'tree_single_B', 'tree_single_A_cut', 'tree_single_B_cut', 'trees_A_small', 'trees_A_medium', 'trees_A_large',
  'trees_B_small', 'trees_B_medium', 'trees_B_large', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E',
  'cloud_big', 'cloud_small', 'waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B',
  'mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'hills_A_trees', 'hills_B_trees', 'hills_C_trees',
  'barrel', 'crate_A_big', 'crate_A_small', 'crate_B_small', 'sack', 'wheelbarrow', 'resource_lumber', 'resource_stone', 'flag',
  'fence_wood_straight', 'pallet', 'bucket_water', 'axe_1handed', 'building_destroyed', 'building_barracks', 'building_tower_A',
  'weaponrack', 'target', 'sword_1handed', 'shield_badge_color', 'shield_round_color',
] as const;
const CHAR_PROPS = new Set(['axe_1handed', 'sword_1handed', 'shield_badge_color', 'shield_round_color']);
export type StaticName = (typeof STATIC)[number];
const CHARACTERS = ['rogue', 'rogue_hooded', 'knight', 'barbarian'] as const;
export type CharName = (typeof CHARACTERS)[number];

const models = new Map<string, THREE.Group>();
const clips = new Map<string, THREE.AnimationClip>();
let villagerSkins: THREE.Texture[] = [];
export let atlasMaterial: THREE.MeshStandardMaterial;

export async function loadAssets(onProgress: (f: number) => void) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = import.meta.env.BASE_URL + 'models/';
  const all = [...STATIC, ...CHARACTERS, 'anims'];
  let done = 0;
  await Promise.all(
    all.map(async (name) => {
      const g: GLTF = await loader.loadAsync(base + name + '.glb');
      if (name === 'anims') for (const c of g.animations) clips.set(c.name, c);
      else {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        models.set(name, g.scene);
      }
      onProgress(++done / all.length);
    }),
  );
  // every environment model shares one small color atlas, so they can share one material
  const anyMesh = findMesh(models.get('tree_single_A')!);
  const src = anyMesh.material as THREE.MeshStandardMaterial;
  atlasMaterial = new THREE.MeshStandardMaterial({ map: src.map, roughness: 0.75, metalness: 0 });
  const swap = (root: THREE.Object3D) =>
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) m.material = atlasMaterial;
    });
  for (const n of STATIC) if (!CHAR_PROPS.has(n)) swap(models.get(n)!);
  villagerSkins = makeVillagerSkins();
}

function findMesh(root: THREE.Object3D) {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found!;
}

export function model(name: StaticName): THREE.Group {
  return models.get(name)!.clone(true);
}

/** Size of a model's bounding box (x, y, z) */
export function modelSize(name: StaticName) {
  return new THREE.Box3().setFromObject(models.get(name)!).getSize(new THREE.Vector3());
}

function toFloat(g: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  const src = g.index ? g.toNonIndexed() : g;
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const n = a.count, size = a.itemSize;
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      arr[i * size] = a.getX(i);
      if (size > 1) arr[i * size + 1] = a.getY(i);
      if (size > 2) arr[i * size + 2] = a.getZ(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** One geometry (in the object's local space) for a static atlas model, ready to merge with others. */
export function flatGeometry(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const g = toFloat(m.geometry);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    parts.push(g);
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

// ---------------- characters ----------------
/** Recolor the green rogue outfit so villagers don't all look the same */
function makeVillagerSkins(): THREE.Texture[] {
  const mesh = findMesh(models.get('rogue')!) as THREE.SkinnedMesh;
  const tex = (mesh.material as THREE.MeshStandardMaterial).map!;
  const img = tex.image as ImageBitmap | HTMLImageElement;
  const w = img.width, h = img.height;
  const hues = [null, 0.6, 0.0, 0.78, 0.08, 0.53];
  const out: THREE.Texture[] = [];
  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  const bctx = base.getContext('2d', { willReadFrequently: true })!;
  bctx.drawImage(img as CanvasImageSource, 0, 0);
  const src = bctx.getImageData(0, 0, w, h);
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (const hue of hues) {
    if (hue === null) { out.push(tex); continue; }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    const data = new ImageData(new Uint8ClampedArray(src.data), w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > r + 25 && g >= b - 10) {
        c.setRGB(r / 255, g / 255, b / 255);
        c.getHSL(hsl);
        c.setHSL(hue, Math.min(1, hsl.s * 0.95), Math.min(0.62, hsl.l * 1.05));
        d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.flipY = tex.flipY;
    t.colorSpace = tex.colorSpace;
    t.magFilter = THREE.NearestFilter;
    out.push(t);
  }
  return out;
}

export interface Character {
  root: THREE.Group; // add to scene; position/rotate this
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  handR: THREE.Object3D;
  handL: THREE.Object3D;
  back: THREE.Object3D;
}

export const CHAR_SCALE = 0.42;

export function makeCharacter(kind: CharName, skin = 0): Character {
  const src = models.get(kind)!;
  const inner = SkeletonUtils.clone(src) as THREE.Group;
  if (kind === 'rogue' || kind === 'rogue_hooded') {
    const tex = villagerSkins[skin % villagerSkins.length];
    const matl = (findMesh(inner).material as THREE.MeshStandardMaterial).clone();
    matl.map = tex;
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = matl;
    });
  }
  inner.scale.setScalar(CHAR_SCALE);
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const [name, clip] of clips) actions.set(name, mixer.clipAction(clip));
  const handR = inner.getObjectByName('handslotr')!;
  const handL = inner.getObjectByName('handslotl')!;
  const back = inner.getObjectByName('chest')!;
  const ch: Character = { root, mixer, actions, current: '', handR, handL, back };
  playAnim(ch, 'Idle', 0);
  mixer.setTime(Math.random() * 3);
  return ch;
}

const ONE_SHOT = new Set(['Cheer', 'Death_A', 'Hit_A', 'PickUp']);

export function playAnim(ch: Character, name: string, fade = 0.2, speed = 1) {
  if (ch.current === name) {
    const a = ch.actions.get(name);
    if (a) a.timeScale = speed;
    return;
  }
  const next = ch.actions.get(name);
  if (!next) return;
  const prev = ch.actions.get(ch.current);
  next.reset();
  next.timeScale = speed;
  if (ONE_SHOT.has(name)) {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  }
  next.play();
  if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
  else if (prev) prev.stop();
  ch.current = name;
}

// ---------------- hand tools ----------------
function toolMat(c: number) {
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true });
}
const WOOD = toolMat(0x8a5a33), METAL = new THREE.MeshStandardMaterial({ color: 0xc0c6cc, roughness: 0.35, metalness: 0.6 });

export type ToolName = 'axe' | 'pick' | 'hammer' | 'spear' | 'basket';
export function makeTool(name: ToolName): THREE.Object3D {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.rotation.set(rx, 0, rz);
    me.castShadow = true;
    g.add(me);
  };
  if (name === 'axe') {
    const a = model('axe_1handed');
    a.scale.setScalar(0.85);
    g.add(a);
  } else if (name === 'pick') {
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), WOOD, 0, 0.35, 0);
    add(new THREE.BoxGeometry(0.75, 0.1, 0.1), METAL, 0, 0.85, 0, 0, 0.15);
  } else if (name === 'hammer') {
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), WOOD, 0, 0.3, 0);
    add(new THREE.BoxGeometry(0.4, 0.22, 0.22), METAL, 0, 0.75, 0);
  } else if (name === 'spear') {
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), WOOD, 0, 0.6, 0);
    add(new THREE.ConeGeometry(0.1, 0.3, 5), METAL, 0, 1.75, 0);
  } else {
    add(new THREE.CylinderGeometry(0.3, 0.22, 0.32, 9), toolMat(0xc8a165), 0, 0, 0.15);
    add(new THREE.TorusGeometry(0.22, 0.03, 4, 10, Math.PI), toolMat(0xa07d48), 0, 0.15, 0.15);
  }
  return g;
}

export function makeBundle(res: 'food' | 'wood' | 'stone' | 'gold'): THREE.Object3D {
  if (res === 'wood') {
    const m = model('resource_lumber');
    m.scale.setScalar(1.1);
    m.rotation.y = Math.PI / 2;
    return m;
  }
  if (res === 'stone') {
    const m = model('resource_stone');
    m.scale.setScalar(1.2);
    return m;
  }
  const m = model('sack');
  m.scale.setScalar(1.6);
  if (res === 'gold') {
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.3, metalness: 0.8, emissive: 0x6b4f00 });
    for (let k = 0; k < 4; k++) {
      const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), gold);
      n.position.set((k - 1.5) * 0.08, 0.32, 0);
      m.add(n);
    }
  } else {
    const berry = new THREE.MeshStandardMaterial({ color: 0xd8323b, roughness: 0.5 });
    for (let k = 0; k < 4; k++) {
      const n = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), berry);
      n.position.set((k - 1.5) * 0.07, 0.32, (k % 2) * 0.05);
      m.add(n);
    }
  }
  return m;
}
