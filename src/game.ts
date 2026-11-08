import * as THREE from 'three';
import {
  BUILDINGS, FOOD_UPKEEP_EVERY, GATHER_RATE, GOALS, MAX_POP, RES, RES_ICON, RESEARCH, VILLAGER_COST, VILLAGER_SPEED,
  VILLAGER_TIME, BASE_CARRY, costText, repairCost, AGES, BUILT_AGES, researchFor, type BType, type Cost, type Res, type Subject,
} from './data';
import {
  makeBerryBush, makeBuilding, makeGhost, makeRock, makeStump,
  makeTree, mat, setBroken, setBuildProgress, setGhostValid,
} from './models';
import { ChunkMerger, windMaterial } from './bake';
import { atlasMaterial, makeBundle, makeCharacter, makeTool, playAnim, type Character, type ToolName } from './assets';
import { FX, loadQuality } from './fx';
import { animateQuad, makeDeer, type Quad } from './animals';
import { Combat, isMine, type Unit } from './combat';
import { Fog } from './fog';
import { U } from './uniforms';

type VillagerAnim = 'idle' | 'walk' | 'run' | 'chop' | 'mine' | 'pick' | 'build';
import { Grid, MAP, Terrain, tileToWorld, worldToTile } from './world';
import { RTSCamera } from './camera';
import { mulberry32, randInt } from './util';
import { makeQuestion, newSkills, recordAnswer, type Question, type Skill, type SkillStats } from './questions';

export type NodeKind = 'tree' | 'berry' | 'stone' | 'gold' | 'carcass';
const NODE_RES: Record<NodeKind, Res> = { tree: 'wood', berry: 'food', stone: 'stone', gold: 'gold', carcass: 'food' };
const NODE_AMOUNT: Record<NodeKind, number> = { tree: 80, berry: 120, stone: 200, gold: 200, carcass: 120 };
export const NODE_LABEL: Record<NodeKind, string> = { tree: '🌲 Tree', berry: '🫐 Berry bush', stone: '🪨 Stone', gold: '✨ Gold', carcass: '🍖 Deer meat' };

export interface ResNode {
  id: number; kind: NodeKind; res: Res; i: number; j: number; amount: number; max: number;
  mesh: THREE.Object3D; shake: number;
}
export interface Building {
  id: number; type: BType; i: number; j: number; size: number; built: boolean; progress: number; hp: number;
  mesh: THREE.Group; queue: { job: Res | null; t: number; kind?: 'villager' | 'soldier' | 'scout' | 'archer' | 'rider' }[];
  ageUp?: { t: number } | null; research: { id: string; t: number } | null; farmer: number | null;
  broken: boolean; repairing: boolean;
}
/** Anything that walks along a path */
export interface Walker { pos: THREE.Vector3; path: THREE.Vector3[]; mesh: THREE.Object3D; offset: THREE.Vector2 }
export interface Animal { id: number; pos: THREE.Vector3; target: THREE.Vector3; home: THREE.Vector3; mesh: THREE.Group; q: Quad; wait: number; t: number }
export type Task =
  | { k: 'idle' }
  | { k: 'move' }
  | { k: 'gather'; node: number; stage: 'to' | 'work' | 'drop' }
  | { k: 'farm'; b: number; stage: 'to' | 'work' | 'drop' }
  | { k: 'hunt'; a: number; repath: number }
  | { k: 'build'; b: number }
  | { k: 'dropoff'; b: number }
  | { k: 'hide' }
  | { k: 'repair'; b: number };
export interface Villager {
  id: number; pos: THREE.Vector3; mesh: THREE.Group; ring: THREE.Mesh; path: THREE.Vector3[]; task: Task;
  carry: { res: Res | null; amt: number }; job: Res | null; selected: boolean; anim: VillagerAnim; t: number;
  ch: Character; tool: ToolName | null; toolObj: THREE.Object3D | null; bundle: THREE.Object3D | null; bundleRes: Res | null; cheer: number; fxT: number;
  offset: THREE.Vector2; farmSpot: THREE.Vector3 | null; stuck: number;
  hp: number; maxHp: number; hidden: boolean; dying: number;
}

export interface Stats {
  trained: number; hunted: number; collected: Record<Res, number>; answered: number; correct: number;
  soldiers?: number; scouts?: number; raidsDefended?: number; archers?: number; riders?: number;
}

export interface GameUI {
  ask(q: Question, title: string, cost: Cost): Promise<boolean>;
  toast(msg: string, speak?: boolean): void;
  refreshSelection(): void;
  goalDone(text: string, reward: Cost): void;
  ageChanged(): void;
}

const SAVE_KEY = 'citybuilding.save.v1';
const VILLAGER_NAMES_ACTION: Record<string, string> = {
  idle: 'Waiting for a job', move: 'Walking', gather: 'Gathering', farm: 'Farming', hunt: 'Hunting', build: 'Building', dropoff: 'Dropping off',
  hide: 'Hiding in the Town Center', repair: 'Repairing',
};

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  rts: RTSCamera;
  sun: THREE.DirectionalLight;
  terrain!: Terrain;
  grid = new Grid();
  root = new THREE.Group(); // everything that belongs to the current game
  trees!: ChunkMerger;
  combat: Combat;
  fog = new Fog();
  private revealT = 0;
  fx!: FX;
  hemi!: THREE.HemisphereLight;
  falling: { obj: THREE.Object3D; t: number; axis: THREE.Vector3 }[] = [];
  chimneys: { b: number; pos: THREE.Vector3 }[] = [];
  private smokeT = 0;
  private wearT = 0;

  nodes = new Map<number, ResNode>();
  nodeAt = new Map<number, number>(); // tile index -> node id
  buildings = new Map<number, Building>();
  villagers = new Map<number, Villager>();
  animals = new Map<number, Animal>();
  stumps: [number, number][] = [];

  res: Record<Res, number> = { food: 200, wood: 200, stone: 100, gold: 50 };
  research = new Set<string>();
  goalsDone = new Set<string>();
  stats: Stats = { trained: 0, hunted: 0, collected: { food: 0, wood: 0, stone: 0, gold: 0 }, answered: 0, correct: 0 };
  skills: Record<Skill, SkillStats> = newSkills();
  seed = 1;
  age = 1;
  nextId = 1;
  playTime = 0;
  upkeepT = 0;
  freeVillagerT = 0;
  deerT = 0;
  goalT = 0;
  storageWarnT = 0;
  paused = false;
  clock = 0;

  selectedBuilding: number | null = null;
  placing: { type: BType; ghost: THREE.Group; i: number; j: number; ok: boolean } | null = null;
  hoverText = '';
  floatLayer: HTMLElement;
  floats: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  selBox: HTMLElement;
  ui!: GameUI;

  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15);
  private selOutline: THREE.LineLoop;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.rts = new RTSCamera(container.clientWidth / container.clientHeight);
    this.scene.background = new THREE.Color(0x9fd3f5);
    this.scene.fog = new THREE.Fog(0x9fd3f5, 55, 130);
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5d7b3a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.root);
    this.trees = new ChunkMerger(this.root, windMaterial(atlasMaterial, U.time));
    this.fx = new FX(this.renderer, this.scene, this.rts.cam, this.sun, this.hemi, loadQuality());
    this.combat = new Combat(this);
    this.scene.add(this.fog.mesh);

    const outlineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5),
    ]);
    this.selOutline = new THREE.LineLoop(outlineGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.selOutline.visible = false;
    this.scene.add(this.selOutline);

    this.floatLayer = document.createElement('div');
    this.floatLayer.className = 'float-layer';
    container.appendChild(this.floatLayer);
    this.selBox = document.createElement('div');
    this.selBox.className = 'sel-box';
    container.appendChild(this.selBox);

    window.addEventListener('resize', () => this.resize());
    this.setupInput();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.rts.cam.aspect = w / h;
    this.rts.cam.updateProjectionMatrix();
    this.fx.resize(w, h);
  }

  // ======================= world setup =======================
  private clearWorld() {
    this.combat.reset();
    this.fog.reset();
    this.trees.clear();
    this.root.clear();
    this.nodes.clear(); this.nodeAt.clear(); this.buildings.clear(); this.villagers.clear(); this.animals.clear();
    this.stumps = [];
    this.falling = [];
    this.chimneys = [];
    this.fx.lights = [];
    this.grid = new Grid();
    this.selectedBuilding = null;
    this.cancelPlacement();
  }

  private setupTerrain(seed: number) {
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.root.add(this.terrain.mesh, this.terrain.waterMesh, this.terrain.decor, this.terrain.scenery);
    this.fx.waterTiles = [];
    for (let j = 2; j < MAP - 2; j++)
      for (let i = 2; i < MAP - 2; i++)
        if (this.terrain.isWater(i, j) && this.terrain.isWater(i + 1, j) && this.terrain.isWater(i - 1, j) && this.terrain.isWater(i, j + 1) && this.terrain.isWater(i, j - 1))
          this.fx.waterTiles.push([i, j]);
    for (let j = 0; j < MAP; j++)
      for (let i = 0; i < MAP; i++) if (this.terrain.isWater(i, j) || i === 0 || j === 0 || i === MAP - 1 || j === MAP - 1) this.grid.set(i, j, true);
    this.addBorderForest();
  }

  private addBorderForest() {
    // Decorative trees outside the playable map, drawn with instancing
    const rnd = mulberry32(this.seed + 99);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 0.5, 5), mat(0x6b4428), 700);
    const top = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 1.3, 7), mat(0x2f7d4a), 700);
    const d = new THREE.Object3D();
    let n = 0;
    for (let t = 0; t < 4000 && n < 700; t++) {
      const x = (rnd() - 0.5) * (MAP + 22), z = (rnd() - 0.5) * (MAP + 22);
      if (Math.abs(x) < MAP / 2 + 0.5 && Math.abs(z) < MAP / 2 + 0.5) continue;
      const s = 0.9 + rnd() * 0.8;
      const y = this.terrain.heightAt(x, z);
      d.position.set(x, y + 0.25 * s, z); d.scale.setScalar(s); d.rotation.set(0, rnd() * 6, 0); d.updateMatrix();
      trunk.setMatrixAt(n, d.matrix);
      d.position.set(x, y + 1.0 * s, z); d.updateMatrix();
      top.setMatrixAt(n, d.matrix);
      n++;
    }
    trunk.count = top.count = n;
    top.castShadow = true;
    this.root.add(trunk, top);
  }

  newGame(seed = Math.floor(Math.random() * 1e9)) {
    this.clearWorld();
    this.age = 1;
    this.res = { food: 200, wood: 200, stone: 100, gold: 50 };
    this.research = new Set(); this.goalsDone = new Set();
    this.stats = { trained: 0, hunted: 0, collected: { food: 0, wood: 0, stone: 0, gold: 0 }, answered: 0, correct: 0 };
    this.skills = newSkills();
    this.nextId = 1; this.playTime = 0;
    this.setupTerrain(seed);
    const rnd = mulberry32(seed);
    const c = MAP / 2;
    this.addBuilding('towncenter', c - 1, c - 1, true);
    this.fog.reveal(0.5, 0.5, 12);
    this.generateResources(rnd);
    for (let k = 0; k < 3; k++) this.spawnVillagerAtTC(null);
    this.rts.focus(0.5, 2.5);
  }

  private generateResources(rnd: () => number) {
    const c = MAP / 2;
    const free = (i: number, j: number) => this.grid.walkable(i, j) && !this.nodeAt.has(j * MAP + i) && Math.hypot(i - c, j - c) > 5.5;
    const at = (minD: number, maxD: number) => {
      for (let t = 0; t < 300; t++) {
        const a = rnd() * Math.PI * 2, d = minD + rnd() * (maxD - minD);
        const i = Math.round(c + Math.cos(a) * d), j = Math.round(c + Math.sin(a) * d);
        if (i > 2 && j > 2 && i < MAP - 3 && j < MAP - 3 && free(i, j)) return [i, j] as [number, number];
      }
      return null;
    };
    const patch = (kind: NodeKind, count: number, minD: number, maxD: number) => {
      const s = at(minD, maxD);
      if (!s) return;
      let [i, j] = s;
      let placed = 0;
      for (let t = 0; t < count * 8 && placed < count; t++) {
        if (free(i, j)) { this.addNode(kind, i, j); placed++; }
        i += randInt(-1, 1, rnd); j += randInt(-1, 1, rnd);
      }
    };
    const forest = (minD: number, maxD: number, radius: number) => {
      const s = at(minD, maxD);
      if (!s) return;
      const R = Math.ceil(radius);
      for (let j = s[1] - R; j <= s[1] + R; j++)
        for (let i = s[0] - R; i <= s[0] + R; i++) {
          const d = Math.hypot(i - s[0], j - s[1]) / radius;
          if (d < 1 && rnd() < 0.75 - d * 0.35 && free(i, j) && i > 1 && j > 1 && i < MAP - 2 && j < MAP - 2) this.addNode('tree', i, j);
        }
    };
    forest(9, 11, 3.5);
    for (let k = 0; k < 12; k++) forest(13, 33, 2.5 + rnd() * 3);
    for (let k = 0; k < 50; k++) { const s = at(7, 34); if (s) this.addNode('tree', s[0], s[1]); }
    patch('berry', 6, 6, 8);
    patch('berry', 5, 15, 25);
    patch('berry', 5, 18, 30);
    patch('stone', 5, 10, 13);
    patch('stone', 5, 18, 30);
    patch('gold', 4, 12, 15);
    patch('gold', 4, 20, 32);
    for (let h = 0; h < 4; h++) {
      const s = at(h === 0 ? 8 : 12, h === 0 ? 10 : 24);
      if (!s) continue;
      for (let k = 0; k < 3; k++) this.addAnimal(tileToWorld(s[0]) + (rnd() - 0.5) * 2, tileToWorld(s[1]) + (rnd() - 0.5) * 2);
    }
  }

  // ======================= entities =======================
  addNode(kind: NodeKind, i: number, j: number, amount?: number, id?: number) {
    const rnd = mulberry32(i * 1000 + j + this.seed);
    let model: THREE.Object3D;
    if (kind === 'tree') model = makeTree(rnd);
    else if (kind === 'stone' || kind === 'gold') model = makeRock(kind, rnd);
    else if (kind === 'berry') model = makeBerryBush(rnd);
    else {
      // a deer lying on its side
      const q = makeDeer(rnd);
      q.root.rotation.x = Math.PI / 2;
      q.root.position.set(0, 0.15, -0.5 * q.root.scale.x);
      q.legs.forEach((l, k) => (l.hip.rotation.z = (k % 2 ? 0.3 : -0.3)));
      q.neck.rotation.z = -0.3;
      model = new THREE.Group();
      model.add(q.root);
    }
    const x = tileToWorld(i), z = tileToWorld(j);
    model.position.set(x + (rnd() - 0.5) * 0.2, this.terrain.heightAt(x, z), z + (rnd() - 0.5) * 0.2);
    if (kind === 'carcass') model.rotation.y = rnd() * 6;
    if (kind === 'tree') this.trees.add(model); // merged with nearby trees
    else this.root.add(model);
    const n: ResNode = { id: id ?? this.nextId++, kind, res: NODE_RES[kind], i, j, amount: amount ?? NODE_AMOUNT[kind], max: NODE_AMOUNT[kind], mesh: model, shake: 0 };
    this.nodes.set(n.id, n);
    if (kind !== 'carcass') {
      this.nodeAt.set(j * MAP + i, n.id);
      // people can walk between trees in a forest; rocks and bushes are in the way
      this.grid.set(i, j, kind !== 'tree');
    }
    this.updateNodeLook(n);
    return n;
  }

  private updateNodeLook(n: ResNode) {
    const ratio = n.amount / n.max;
    if (n.kind === 'berry') {
      const berries = (n.mesh.userData.berries as THREE.Group).children;
      berries.forEach((b, k) => (b.visible = k < Math.ceil(ratio * berries.length)));
    } else if (n.kind === 'stone' || n.kind === 'gold' || n.kind === 'carcass') {
      n.mesh.scale.setScalar(0.45 + 0.55 * ratio);
    }
  }

  removeNode(n: ResNode, felledBy?: THREE.Vector3) {
    if (n.kind === 'tree' && this.trees.has(n.mesh)) this.trees.remove(n.mesh);
    this.root.remove(n.mesh);
    if (n.kind === 'tree' && felledBy) {
      // timber! the tree tips over away from the villager
      const away = new THREE.Vector3().subVectors(n.mesh.position, felledBy).setY(0).normalize();
      const axis = new THREE.Vector3(away.z, 0, -away.x);
      const pivot = new THREE.Group();
      pivot.position.copy(n.mesh.position);
      const t = n.mesh;
      t.position.set(0, 0, 0);
      pivot.add(t);
      this.root.add(pivot);
      this.falling.push({ obj: pivot, t: 0, axis });
    }
    this.nodes.delete(n.id);
    if (this.nodeAt.get(n.j * MAP + n.i) === n.id) {
      this.nodeAt.delete(n.j * MAP + n.i);
      if (!this.buildingAtTile(n.i, n.j)) this.grid.set(n.i, n.j, false);
    }
    if (n.kind === 'tree') this.addStump(n.i, n.j);
  }

  addStump(i: number, j: number) {
    const s = makeStump(mulberry32(i * 31 + j));
    const x = tileToWorld(i), z = tileToWorld(j);
    s.position.set(x, this.terrain.heightAt(x, z), z);
    this.root.add(s);
    this.stumps.push([i, j]);
  }

  addBuilding(type: BType, i: number, j: number, built: boolean, id?: number) {
    const def = BUILDINGS[type];
    const mesh = makeBuilding(type, mulberry32(i * 77 + j), this.age);
    const cx = tileToWorld(i) - 0.5 + def.size / 2, cz = tileToWorld(j) - 0.5 + def.size / 2;
    let h = 0;
    for (let jj = j; jj < j + def.size; jj++) for (let ii = i; ii < i + def.size; ii++) h = Math.max(h, this.terrain.heightAt(tileToWorld(ii), tileToWorld(jj)));
    mesh.position.set(cx, h, cz);
    this.root.add(mesh);
    const b: Building = { id: id ?? this.nextId++, type, i, j, size: def.size, built, progress: built ? 1 : 0, hp: def.hp, mesh, queue: [], research: null, farmer: null, broken: false, repairing: false };
    this.fog.reveal(cx, cz, def.size + 4);
    this.buildings.set(b.id, b);
    if (def.blocks) for (let jj = j; jj < j + def.size; jj++) for (let ii = i; ii < i + def.size; ii++) this.grid.set(ii, jj, true);
    // clear stumps under the building
    this.stumps = this.stumps.filter(([si, sj]) => !(si >= i && si < i + def.size && sj >= j && sj < j + def.size));
    setBuildProgress(mesh, b.progress, built);
    // worn ground around buildings
    for (let jj = j - 1; jj <= j + def.size; jj++)
      for (let ii = i - 1; ii <= i + def.size; ii++) {
        const inside = ii >= i && ii < i + def.size && jj >= j && jj < j + def.size;
        if (type !== 'farm') this.terrain.addWear(ii, jj, inside ? 1 : 0.45);
      }
    this.terrain.refreshWear(0);
    if (type === 'house') this.chimneys.push({ b: b.id, pos: this.highestPoint(mesh.userData.main) });
    if (type !== 'farm') this.fx.lights.push(new THREE.Vector3(cx + def.size * 0.3, h + 0.7, cz + def.size / 2 + 0.15));
    return b;
  }

  /** Top of a model (used to find house chimneys) */
  private highestPoint(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    let best = new THREE.Vector3(0, -Infinity, 0);
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const pos = me.geometry.getAttribute('position');
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(me.matrixWorld);
        if (v.y > best.y) best = v.clone();
      }
    });
    return best;
  }

  buildingAtTile(i: number, j: number) {
    for (const b of this.buildings.values()) if (i >= b.i && i < b.i + b.size && j >= b.j && j < b.j + b.size) return b;
    return null;
  }

  townCenter() {
    for (const b of this.buildings.values()) if (b.type === 'towncenter') return b;
    return null;
  }

  addAnimal(x: number, z: number, id?: number) {
    const q = makeDeer();
    const mesh = q.root;
    const pos = new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
    mesh.position.copy(pos);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.root.add(mesh);
    const a: Animal = { id: id ?? this.nextId++, pos, target: pos.clone(), home: pos.clone(), mesh, q, wait: Math.random() * 3, t: Math.random() * 10 };
    this.animals.set(a.id, a);
    return a;
  }

  spawnVillager(x: number, z: number, job: Res | null, id?: number) {
    const ch = makeCharacter(Math.random() < 0.5 ? 'rogue' : 'rogue_hooded', Math.floor(Math.random() * 6));
    const mesh = ch.root;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 20), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.root.add(mesh, ring);
    const v: Villager = {
      id: id ?? this.nextId++, pos: new THREE.Vector3(x, this.terrain.heightAt(x, z), z), mesh, ring, path: [], task: { k: 'idle' },
      carry: { res: null, amt: 0 }, job, selected: false, anim: 'idle', t: Math.random() * 10,
      offset: new THREE.Vector2((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4), farmSpot: null, stuck: 0,
      ch, tool: null, toolObj: null, bundle: null, bundleRes: null, cheer: 0, fxT: Math.random(),
      hp: 25, maxHp: 25, hidden: false, dying: 0,
    };
    this.villagers.set(v.id, v);
    if (job) this.autoJob(v, job);
    return v;
  }

  spawnVillagerAtTC(job: Res | null) {
    const tc = this.townCenter();
    if (!tc) return null;
    const ring = this.grid.ringAround(tc.i, tc.j, tc.size, tc.i + 1, tc.j + 4);
    const spot = ring[Math.floor(Math.random() * Math.min(ring.length, 5))] ?? [tc.i, tc.j + 3];
    const v = this.spawnVillager(tileToWorld(spot[0]), tileToWorld(spot[1]), job);
    if (this.combat.bell) this.hideVillager(v);
    return v;
  }

  // ======================= economy =======================
  storageCap() {
    let cap = 0;
    for (const b of this.buildings.values()) if (b.built && !b.broken) cap += BUILDINGS[b.type].storage ?? 0;
    return cap;
  }
  popCap() {
    let cap = 0;
    for (const b of this.buildings.values()) if (b.built && (!b.broken || b.type === 'towncenter')) cap += BUILDINGS[b.type].pop ?? 0;
    return Math.min(MAX_POP, cap);
  }
  popUsed() {
    let q = 0;
    for (const b of this.buildings.values()) q += b.queue.length;
    let units = 0;
    for (const u of this.combat.units.values()) if (!u.dying && isMine(u.kind)) units++;
    return this.liveVillagers() + units + q;
  }
  canAfford(c: Cost) {
    return RES.every((r) => (c[r] ?? 0) <= this.res[r]);
  }
  missing(c: Cost) {
    return RES.filter((r) => (c[r] ?? 0) > this.res[r]).map((r) => `${(c[r] ?? 0) - Math.floor(this.res[r])} more ${RES_ICON[r]}`).join(' and ');
  }
  spend(c: Cost) {
    for (const r of RES) this.res[r] -= c[r] ?? 0;
  }
  give(c: Cost) {
    const cap = this.storageCap();
    for (const r of RES) this.res[r] = Math.min(cap, this.res[r] + (c[r] ?? 0));
  }

  /**
   * The core rule: resources are used up the moment a question opens, right or wrong.
   * Returns true if he answered correctly.
   */
  async tryWithQuestion(subject: Subject, title: string, cost: Cost, forceLevel?: number): Promise<boolean> {
    if (!this.canAfford(cost)) {
      this.ui.toast(`You need ${this.missing(cost)} first. Go gather some!`, true);
      return false;
    }
    this.spend(cost);
    const q = makeQuestion(subject, this.skills, forceLevel, this.age);
    this.paused = true;
    let ok = false;
    try {
      ok = await this.ui.ask(q, title, cost);
    } finally {
      this.paused = false;
    }
    recordAnswer(this.skills[q.skill], ok);
    this.stats.answered++;
    if (ok) this.stats.correct++;
    this.save();
    return ok;
  }

  async trainVillager(job: Res) {
    const tc = this.townCenter();
    if (!tc) return;
    if (this.popUsed() >= this.popCap()) {
      this.ui.toast('Your town is full! Build a House to make room.', true);
      return;
    }
    if (tc.queue.length >= 5) {
      this.ui.toast('The Town Center is busy. Wait for a villager to finish.', true);
      return;
    }
    const ok = await this.tryWithQuestion('reading', `Train a villager (${RES_ICON[job]} job)`, VILLAGER_COST);
    if (ok) tc.queue.push({ job, t: 0 });
    this.ui.refreshSelection();
  }

  async startResearch(id: string) {
    const tc = this.townCenter();
    const def = RESEARCH.find((r) => r.id === id);
    if (!tc || !def || this.research.has(id) || (def.age ?? 1) > this.age) return;
    if (tc.research) {
      this.ui.toast('Already researching something. Wait for it to finish.', true);
      return;
    }
    const ok = await this.tryWithQuestion('science', `Research: ${def.name}`, def.cost);
    if (ok) tc.research = { id, t: 0 };
    this.ui.refreshSelection();
  }

  // ======================= placement =======================
  startPlacement(type: BType) {
    this.cancelPlacement();
    const def = BUILDINGS[type];
    if ((def.age ?? 1) > this.age) {
      this.ui.toast(`The ${def.name} comes in the ${AGES[(def.age ?? 1) - 1].name}. Advance at the Town Center!`, true);
      return;
    }
    if (!this.canAfford(def.cost)) {
      this.ui.toast(`A ${def.name} needs ${costText(def.cost)}. You need ${this.missing(def.cost)}.`, true);
      return;
    }
    const ghost = makeGhost(type, this.age);
    this.root.add(ghost);
    this.placing = { type, ghost, i: 0, j: 0, ok: false };
  }

  cancelPlacement() {
    if (this.placing) this.root.remove(this.placing.ghost);
    this.placing = null;
    this.hoverText = '';
  }

  canPlace(type: BType, i: number, j: number) {
    const s = BUILDINGS[type].size;
    for (let jj = j; jj < j + s; jj++)
      for (let ii = i; ii < i + s; ii++) {
        if (ii < 1 || jj < 1 || ii >= MAP - 1 || jj >= MAP - 1) return false;
        if (this.terrain.isWater(ii, jj)) return false;
        if (this.nodeAt.has(jj * MAP + ii)) return false;
        if (this.buildingAtTile(ii, jj)) return false;
      }
    return true;
  }

  private async confirmPlacement() {
    const p = this.placing;
    if (!p || !p.ok) return;
    const { type, i, j } = p;
    const def = BUILDINGS[type];
    this.cancelPlacement();
    const ok = await this.tryWithQuestion(def.subject, `Build a ${def.name}`, def.cost);
    if (!ok) return;
    if (!this.canPlace(type, i, j)) {
      this.ui.toast('Something is in the way now. Pick another spot.', true);
      this.give(def.cost);
      return;
    }
    const b = this.addBuilding(type, i, j, false);
    // send selected villagers, or the closest one
    let builders = this.selectedVillagers();
    if (!builders.length) {
      const c = new THREE.Vector3(tileToWorld(i), 0, tileToWorld(j));
      const sorted = [...this.villagers.values()].sort((a, b2) => {
        const ia = a.task.k === 'idle' ? 0 : 50, ib = b2.task.k === 'idle' ? 0 : 50;
        return a.pos.distanceTo(c) + ia - (b2.pos.distanceTo(c) + ib);
      });
      builders = sorted.slice(0, 1);
    }
    for (const v of builders) this.commandBuild(v, b);
    this.ui.toast(`${def.emoji} Your villagers are building a ${def.name}!`);
  }

  // ======================= commands =======================
  selectedVillagers() {
    return [...this.villagers.values()].filter((v) => v.selected && !v.dying && !v.hidden);
  }

  selectedUnits() {
    return [...this.combat.units.values()].filter((u) => u.selected && !u.dying);
  }

  setSelected(vs: Villager[], add = false, units: Unit[] = []) {
    if (!add) {
      for (const v of this.villagers.values()) v.selected = false;
      for (const u of this.combat.units.values()) u.selected = false;
    }
    for (const v of vs) v.selected = true;
    for (const u of units) u.selected = true;
    if (vs.length || units.length) this.selectedBuilding = null;
    this.ui.refreshSelection();
  }

  selectBuilding(b: Building | null) {
    for (const u of this.combat.units.values()) u.selected = false;
    for (const v of this.villagers.values()) v.selected = false;
    this.selectedBuilding = b ? b.id : null;
    this.ui.refreshSelection();
  }

  commandGather(v: Villager, n: ResNode) {
    v.job = n.res;
    this.releaseFarm(v);
    v.task = { k: 'gather', node: n.id, stage: v.carry.amt > 0 && v.carry.res !== n.res ? 'drop' : 'to' };
    v.path = [];
  }
  commandHunt(v: Villager, a: Animal) {
    v.job = 'food';
    this.releaseFarm(v);
    v.task = { k: 'hunt', a: a.id, repath: 0 };
    v.path = [];
  }
  commandBuild(v: Villager, b: Building) {
    this.releaseFarm(v);
    v.task = { k: 'build', b: b.id };
    v.path = [];
  }
  commandFarm(v: Villager, b: Building) {
    if (b.farmer !== null && b.farmer !== v.id && this.villagers.has(b.farmer)) return false;
    this.releaseFarm(v);
    b.farmer = v.id;
    v.job = 'food';
    v.task = { k: 'farm', b: b.id, stage: v.carry.amt > 0 && v.carry.res !== 'food' ? 'drop' : 'to' };
    v.farmSpot = null;
    v.path = [];
    return true;
  }
  commandMove(v: Villager, x: number, z: number) {
    this.releaseFarm(v);
    v.task = { k: 'move' };
    this.pathTo(v, worldToTile(x), worldToTile(z), true);
  }
  private releaseFarm(v: Villager) {
    if (v.task.k === 'farm') {
      const b = this.buildings.get(v.task.b);
      if (b && b.farmer === v.id) b.farmer = null;
    }
  }

  /** Called on whatever the player clicked while villagers are selected */
  commandTarget(target: Target, point: THREE.Vector3) {
    const vs = this.selectedVillagers();
    const us = this.selectedUnits();
    // soldiers attack raiders; soldiers and scouts walk where you click
    us.forEach((u, k) => {
      if (target.kind === 'unit' && target.unit.kind === 'raider' && u.kind !== 'scout') {
        u.order = 'attack';
        u.target = { k: 'unit', id: target.unit.id };
        u.path = [];
      } else {
        const a = k * 2.4, r = k === 0 ? 0 : 0.6 + 0.35 * Math.sqrt(k);
        u.order = 'move';
        u.target = null;
        this.pathTo(u, worldToTile(point.x + Math.cos(a) * r), worldToTile(point.z + Math.sin(a) * r), true);
      }
    });
    if (!vs.length) { if (us.length) this.ui.refreshSelection(); return; }
    if (target.kind === 'unit') {
      // villagers don't fight: they run toward the click point
      vs.forEach((v) => this.commandMove(v, point.x, point.z));
    } else if (target.kind === 'node') {
      for (const v of vs) this.commandGather(v, target.node);
      if (target.node.kind === 'tree') this.markGoal('gather_wood');
    } else if (target.kind === 'animal') {
      for (const v of vs) this.commandHunt(v, target.animal);
    } else if (target.kind === 'building') {
      const b = target.building;
      if (!b.built) for (const v of vs) this.commandBuild(v, b);
      else if (b.repairing) for (const v of vs) this.commandRepair(v, b);
      else if (b.broken) { this.selectBuilding(b); this.ui.toast('🔨 This building is broken. Press Repair to fix it.', true); return; }
      else if (b.type === 'farm') {
        const [first, ...rest] = vs;
        if (!this.commandFarm(first, b)) this.ui.toast('Someone already works this farm. Build another one!');
        if (rest.length) this.ui.toast('Only one villager can work each farm.');
      } else if (BUILDINGS[b.type].dropsite) {
        for (const v of vs) {
          this.releaseFarm(v);
          v.task = { k: 'dropoff', b: b.id };
          v.path = [];
        }
      } else for (const v of vs) this.commandMove(v, point.x, point.z);
    } else {
      // spread out around the clicked spot
      vs.forEach((v, k) => {
        const a = k * 2.4, r = k === 0 ? 0 : 0.6 + 0.35 * Math.sqrt(k);
        this.commandMove(v, point.x + Math.cos(a) * r, point.z + Math.sin(a) * r);
      });
    }
    this.ui.refreshSelection();
  }

  /** Put a villager to work on the closest resource of the given type */
  autoJob(v: Villager, job: Res) {
    v.job = job;
    if (job === 'food') {
      // free farm first, then berries/carcasses, then deer
      for (const b of this.buildings.values()) if (b.type === 'farm' && b.built && (b.farmer === null || !this.villagers.has(b.farmer))) { this.commandFarm(v, b); return; }
    }
    const n = this.nearestNode(v.pos, job, 40);
    if (n) { this.commandGather(v, n); return; }
    if (job === 'food') {
      const a = this.nearestAnimal(v.pos, 40);
      if (a) { this.commandHunt(v, a); return; }
    }
    v.task = { k: 'idle' };
  }

  nearestNode(p: THREE.Vector3, res: Res, maxDist: number) {
    let best: ResNode | null = null, bd = maxDist;
    for (const n of this.nodes.values()) {
      if (n.res !== res) continue;
      const d = Math.hypot(tileToWorld(n.i) - p.x, tileToWorld(n.j) - p.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  nearestAnimal(p: THREE.Vector3, maxDist: number) {
    let best: Animal | null = null, bd = maxDist;
    for (const a of this.animals.values()) {
      const d = a.pos.distanceTo(p);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  nearestDropsite(p: THREE.Vector3) {
    let best: Building | null = null, bd = Infinity;
    for (const b of this.buildings.values()) {
      if (!b.built || b.broken || !BUILDINGS[b.type].dropsite) continue;
      const d = this.rectDist(p, b.i, b.j, b.size);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ======================= movement =======================
  rectDist(p: THREE.Vector3, i: number, j: number, size: number) {
    const x0 = tileToWorld(i) - 0.5, z0 = tileToWorld(j) - 0.5;
    const dx = Math.max(x0 - p.x, 0, p.x - (x0 + size));
    const dz = Math.max(z0 - p.z, 0, p.z - (z0 + size));
    return Math.hypot(dx, dz);
  }

  private startTile(v: Walker): [number, number] | null {
    const i = worldToTile(v.pos.x), j = worldToTile(v.pos.z);
    if (this.grid.walkable(i, j)) return [i, j];
    return this.grid.nearestWalkable(i, j);
  }

  private setPath(v: Walker, tiles: [number, number][], from: [number, number], useOffset = false) {
    // already on the target tile: just step to its center so we end up next to the target
    if (!tiles.length) tiles = [from];
    v.path = tiles.map(([i, j], k) => {
      const last = useOffset && k === tiles.length - 1;
      return new THREE.Vector3(tileToWorld(i) + (last ? v.offset.x : 0), 0, tileToWorld(j) + (last ? v.offset.y : 0));
    });
  }

  pathTo(v: Walker, ti: number, tj: number, useOffset = false) {
    const s = this.startTile(v);
    const t = this.grid.nearestWalkable(ti, tj);
    if (!s || !t) return false;
    const p = this.grid.findPath(s[0], s[1], t[0], t[1]);
    if (!p) return false;
    this.setPath(v, p, s, useOffset);
    return true;
  }

  pathToRect(v: Walker, i: number, j: number, size: number) {
    const s = this.startTile(v);
    if (!s) return false;
    const ring = this.grid.ringAround(i, j, size, s[0], s[1]);
    for (const [ti, tj] of ring.slice(0, 6)) {
      const p = this.grid.findPath(s[0], s[1], ti, tj);
      if (p) {
        this.setPath(v, p, s);
        return true;
      }
    }
    return false;
  }

  stepPath(v: Walker, dt: number, speed: number) {
    if (!v.path.length) return false;
    let remain = speed * dt;
    while (remain > 0 && v.path.length) {
      const wp = v.path[0];
      const dx = wp.x - v.pos.x, dz = wp.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001) { v.path.shift(); continue; }
      v.mesh.rotation.y = Math.atan2(dx, dz);
      if (d <= remain) {
        v.pos.x = wp.x; v.pos.z = wp.z;
        v.path.shift();
        remain -= d;
      } else {
        v.pos.x += (dx / d) * remain; v.pos.z += (dz / d) * remain;
        remain = 0;
      }
    }
    return true;
  }

  private face(v: Villager, x: number, z: number) {
    v.mesh.rotation.y = Math.atan2(x - v.pos.x, z - v.pos.z);
  }

  // ======================= simulation =======================
  private carryCap() {
    return BASE_CARRY + (this.research.has('baskets') ? 5 : 0);
  }
  private rate(kind: keyof typeof GATHER_RATE) {
    let r: number = GATHER_RATE[kind];
    if (kind === 'tree' && this.research.has('axes')) r *= 1.25;
    if ((kind === 'berry' || kind === 'carcass' || kind === 'farm') && this.research.has('spears')) r *= 1.25;
    if ((kind === 'stone' || kind === 'gold') && this.research.has('picks')) r *= 1.25;
    if (this.research.has('bronze_tools')) r *= 1.15;
    if (this.res.food <= 0) r *= 0.5;
    return r;
  }

  private deposit(v: Villager) {
    if (!v.carry.res || v.carry.amt <= 0) return;
    const cap = this.storageCap();
    const r = v.carry.res;
    const amt = Math.floor(v.carry.amt);
    const room = Math.max(0, cap - this.res[r]);
    const added = Math.min(room, amt);
    this.res[r] += added;
    this.stats.collected[r] += added;
    if (added > 0) this.floatText(v.pos, `+${added} ${RES_ICON[r]}`);
    if (added > 0 && r === 'gold') this.fx.sparkle(v.pos.clone().setY(v.pos.y + 0.6), 5);
    if (added < amt && this.storageWarnT <= 0) {
      this.ui.toast(`Your ${r} storage is full! Spend some, or build a Storehouse 📦.`, true);
      this.storageWarnT = 25;
    }
    v.carry = { res: null, amt: 0 };
    this.setBundle(v, null);
  }

  /** Walk to the nearest drop site. Returns true when dropped off. */
  private doDrop(v: Villager, moving: boolean) {
    const d = this.nearestDropsite(v.pos);
    if (!d) return false;
    if (this.rectDist(v.pos, d.i, d.j, d.size) < 0.8) {
      this.deposit(v);
      v.path = [];
      return true;
    }
    if (!moving && !this.pathToRect(v, d.i, d.j, d.size)) v.stuck++;
    return false;
  }

  private updateVillager(v: Villager, dt: number) {
    if (v.dying || v.hidden) return;
    const hungry = this.res.food <= 0;
    const speed = VILLAGER_SPEED * (hungry ? 0.75 : 1) * (this.research.has('wheel') ? 1.15 : 1);
    const moving = this.stepPath(v, dt, speed);
    let anim: VillagerAnim = moving ? 'walk' : 'idle';
    let tool: ToolName | null = null;
    const task = v.task;

    switch (task.k) {
      case 'move':
        if (!moving) v.task = { k: 'idle' };
        break;
      case 'hide': {
        const tc = this.townCenter();
        if (!tc) { v.task = { k: 'idle' }; break; }
        anim = moving ? 'run' : 'idle';
        if (this.rectDist(v.pos, tc.i, tc.j, tc.size) < 0.9) {
          // safe inside; villagers inside slowly heal
          v.hidden = true;
          v.path = [];
          v.selected = false;
          this.releaseFarm(v);
        } else if (!moving && !this.pathToRect(v, tc.i, tc.j, tc.size)) v.stuck++;
        break;
      }
      case 'repair': {
        const b = this.buildings.get(task.b);
        if (!b || !b.repairing) { if (v.job) this.autoJob(v, v.job); else v.task = { k: 'idle' }; break; }
        const def = BUILDINGS[b.type];
        if (this.rectDist(v.pos, b.i, b.j, b.size) < (def.blocks ? 0.8 : 0.3)) {
          v.path = [];
          anim = 'build';
          tool = 'hammer';
          this.face(v, b.mesh.position.x, b.mesh.position.z);
          b.hp = Math.min(def.hp, b.hp + (def.hp / 18) * dt);
          if (b.hp >= def.hp) this.finishRepair(b);
        } else if (!moving) {
          const ok = def.blocks ? this.pathToRect(v, b.i, b.j, b.size) : this.pathTo(v, b.i, b.j);
          if (!ok) v.stuck++;
        }
        break;
      }
      case 'dropoff': {
        const b = this.buildings.get(task.b);
        if (!b) { v.task = { k: 'idle' }; break; }
        if (this.rectDist(v.pos, b.i, b.j, b.size) < 0.8) {
          this.deposit(v);
          v.path = [];
          if (v.job) this.autoJob(v, v.job); else v.task = { k: 'idle' };
        } else if (!moving && !this.pathToRect(v, b.i, b.j, b.size)) v.task = { k: 'idle' };
        break;
      }
      case 'gather': {
        const n = this.nodes.get(task.node);
        if (task.stage === 'drop') {
          if (this.doDrop(v, moving)) {
            task.stage = 'to';
            if (!n) this.retarget(v);
          }
          break;
        }
        if (!n) {
          if (v.carry.amt > 0 && v.carry.amt >= this.carryCap() * 0.5) task.stage = 'drop';
          else this.retarget(v);
          break;
        }
        if (v.carry.amt > 0 && v.carry.res !== n.res) { task.stage = 'drop'; v.path = []; break; }
        const near = this.rectDist(v.pos, n.i, n.j, 1) < 0.8;
        if (task.stage === 'to') {
          if (near) { task.stage = 'work'; v.path = []; }
          else if (!moving) {
            const ok = n.kind === 'carcass' ? this.pathTo(v, n.i, n.j) : this.pathToRect(v, n.i, n.j, 1);
            if (!ok) { v.stuck++; if (v.stuck > 3) { v.stuck = 0; this.retarget(v, n.id); } }
          }
          break;
        }
        // work
        if (!near) { task.stage = 'to'; break; }
        this.face(v, tileToWorld(n.i), tileToWorld(n.j));
        const kind = n.kind;
        anim = kind === 'tree' ? 'chop' : kind === 'stone' || kind === 'gold' ? 'mine' : 'pick';
        tool = kind === 'tree' ? 'axe' : kind === 'stone' || kind === 'gold' ? 'pick' : kind === 'carcass' ? 'spear' : 'basket';
        const take = Math.min(n.amount, this.rate(kind) * dt);
        n.amount -= take;
        n.shake = 0.25;
        if (n.kind === 'tree' && this.trees.has(n.mesh)) { this.trees.remove(n.mesh); this.root.add(n.mesh); }
        v.carry.res = n.res;
        v.carry.amt += take;
        this.setBundle(v, n.res);
        this.updateNodeLook(n);
        if (n.amount <= 0.01) this.removeNode(n, v.pos);
        if (v.carry.amt >= this.carryCap()) { v.carry.amt = this.carryCap(); task.stage = 'drop'; }
        break;
      }
      case 'farm': {
        const b = this.buildings.get(task.b);
        if (!b || !b.built || b.broken) { v.task = { k: 'idle' }; break; }
        if (task.stage === 'drop') {
          if (this.doDrop(v, moving)) { task.stage = 'to'; v.farmSpot = null; }
          break;
        }
        if (!v.farmSpot) {
          const fx = tileToWorld(b.i) - 0.5 + 0.5 + Math.random() * (b.size - 1);
          const fz = tileToWorld(b.j) - 0.5 + 0.5 + Math.random() * (b.size - 1);
          v.farmSpot = new THREE.Vector3(fx, 0, fz);
        }
        const d = Math.hypot(v.farmSpot.x - v.pos.x, v.farmSpot.z - v.pos.z);
        if (task.stage === 'to') {
          if (d < 0.15) { task.stage = 'work'; v.path = []; }
          else if (!moving) {
            if (this.rectDist(v.pos, b.i, b.j, b.size) < 0.1) v.path = [v.farmSpot.clone()];
            else if (this.pathTo(v, b.i + 1, b.j + 1)) v.path.push(v.farmSpot.clone());
            else v.stuck++;
          }
          break;
        }
        anim = 'pick';
        tool = 'basket';
        v.carry.res = 'food';
        v.carry.amt += this.rate('farm') * dt;
        this.setBundle(v, 'food');
        if (v.carry.amt >= this.carryCap()) { v.carry.amt = this.carryCap(); task.stage = 'drop'; }
        break;
      }
      case 'hunt': {
        const a = this.animals.get(task.a);
        if (!a) { this.retarget(v); break; }
        const d = a.pos.distanceTo(v.pos);
        tool = 'spear';
        if (d < 0.9) {
          // the hunt: deer becomes meat to gather
          this.root.remove(a.mesh);
          this.animals.delete(a.id);
          const i = worldToTile(a.pos.x), j = worldToTile(a.pos.z);
          const n = this.addNode('carcass', i, j);
          this.stats.hunted++;
          this.markGoal('hunt');
          for (const o of this.villagers.values()) if (o.task.k === 'hunt' && o.task.a === a.id) this.commandGather(o, n);
          break;
        }
        if (moving) anim = 'run';
        task.repath -= dt;
        if (task.repath <= 0 || !moving) {
          task.repath = 1;
          this.pathTo(v, worldToTile(a.pos.x), worldToTile(a.pos.z));
        }
        break;
      }
      case 'build': {
        const b = this.buildings.get(task.b);
        if (!b || b.built) {
          if (v.job) this.autoJob(v, v.job); else v.task = { k: 'idle' };
          break;
        }
        const def = BUILDINGS[b.type];
        const near = this.rectDist(v.pos, b.i, b.j, b.size) < (BUILDINGS[b.type].blocks ? 0.8 : 0.3);
        if (near) {
          v.path = [];
          anim = 'build';
          tool = 'hammer';
          this.face(v, b.mesh.position.x, b.mesh.position.z);
          b.progress = Math.min(1, b.progress + dt / def.buildTime);
          setBuildProgress(b.mesh, b.progress, false);
          if (b.progress >= 1) this.finishBuilding(b);
        } else if (!moving) {
          const ok = def.blocks ? this.pathToRect(v, b.i, b.j, b.size) : this.pathTo(v, b.i, b.j);
          if (!ok) v.stuck++;
        }
        break;
      }
      case 'idle':
        break;
    }

    if (moving && anim !== 'run') anim = 'walk';
    v.anim = anim;
    if (!tool && v.task.k === 'build') tool = 'hammer';
    this.setTool(v, tool);
    v.t += dt;
    // little bits fly while they work
    if (anim !== 'walk' && anim !== 'idle' && anim !== 'run') {
      v.fxT -= dt;
      if (v.fxT <= 0) {
        v.fxT = 0.75;
        const p = v.pos.clone().add(new THREE.Vector3(Math.sin(v.mesh.rotation.y) * 0.45, 0.45, Math.cos(v.mesh.rotation.y) * 0.45));
        if (anim === 'chop') this.fx.chips(p, 0xa8743f, 3);
        else if (anim === 'mine') {
          const n = v.task.k === 'gather' ? this.nodes.get(v.task.node) : undefined;
          if (n?.kind === 'gold') this.fx.sparkle(p, 3); else this.fx.chips(p, 0x9a9a9a, 3);
        } else if (anim === 'build') this.fx.chips(p, 0xc9a06a, 2);
      }
    }
    if (moving) {
      this.wearT += dt;
      this.terrain.addWear(worldToTile(v.pos.x), worldToTile(v.pos.z), dt * 0.03);
    }
  }

  private retarget(v: Villager, avoid?: number) {
    const job = v.job;
    if (!job) { v.task = { k: 'idle' }; return; }
    let best: ResNode | null = null, bd = 14;
    for (const n of this.nodes.values()) {
      if (n.res !== job || n.id === avoid) continue;
      const d = Math.hypot(tileToWorld(n.i) - v.pos.x, tileToWorld(n.j) - v.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) {
      v.task = { k: 'gather', node: best.id, stage: 'to' };
      v.path = [];
    } else if (job === 'food') {
      const a = this.nearestAnimal(v.pos, 20);
      if (a) this.commandHunt(v, a);
      else v.task = { k: 'idle' };
    } else {
      v.task = { k: 'idle' };
    }
  }

  private finishBuilding(b: Building) {
    b.built = true;
    b.progress = 1;
    setBuildProgress(b.mesh, 1, true);
    const def = BUILDINGS[b.type];
    this.markGoal(b.type);
    this.ui.toast(`${def.emoji} The ${def.name} is finished!`, true);
    this.fx.puff(b.mesh.position.clone().setY(b.mesh.position.y + 0.3), 0xd6c4a3, 26, 0.7);
    this.fx.confetti(b.mesh.position.clone().setY(b.mesh.position.y + 1.5));
    for (const v of this.villagers.values()) if (v.task.k === 'build' && v.task.b === b.id) v.cheer = 1.6;
    if (b.type === 'farm') {
      const builder = [...this.villagers.values()].find((v) => v.task.k === 'build' && v.task.b === b.id);
      if (builder) this.commandFarm(builder, b);
    }
    this.ui.refreshSelection();
  }

  private updateAnimal(a: Animal, dt: number) {
    a.t += dt;
    // stand still if a hunter is close (keeps hunting easy for little hands)
    let hunted = false;
    for (const v of this.villagers.values()) if (v.task.k === 'hunt' && v.task.a === a.id && v.pos.distanceTo(a.pos) < 6) hunted = true;
    const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (!hunted && d > 0.05) {
      const s = Math.min(d, 0.9 * dt);
      a.pos.x += (dx / d) * s; a.pos.z += (dz / d) * s;
      a.mesh.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
      moving = true;
    } else {
      a.wait -= dt;
      if (a.wait <= 0 && !hunted) {
        for (let t = 0; t < 8; t++) {
          const nx = a.home.x + (Math.random() - 0.5) * 8, nz = a.home.z + (Math.random() - 0.5) * 8;
          if (this.grid.walkable(worldToTile(nx), worldToTile(nz))) { a.target.set(nx, 0, nz); break; }
        }
        a.wait = 3 + Math.random() * 6;
      }
    }
    a.pos.y = this.terrain.heightAt(a.pos.x, a.pos.z);
    a.mesh.position.copy(a.pos);
    // deer graze most of the time, but look up when a hunter comes close
    animateQuad(a.q, moving ? 1.2 : 0, !moving && !hunted && Math.sin(a.t * 0.35 + a.id) > -0.3, dt);
  }

  private updateBuildings(dt: number) {
    for (const b of this.buildings.values()) {
      if (!b.built || b.broken) continue;
      if (b.queue.length) {
        const q = b.queue[0];
        q.t += dt;
        if (q.kind === 'soldier' || q.kind === 'scout' || q.kind === 'archer' || q.kind === 'rider') {
          if (q.t >= this.combat.queueTime(q.kind)) {
            b.queue.shift();
            const ring = this.grid.ringAround(b.i, b.j, b.size, b.i + 1, b.j + 4);
            const spot = ring[Math.floor(Math.random() * Math.min(ring.length, 4))] ?? [b.i, b.j + b.size];
            const u = this.combat.spawn(q.kind, tileToWorld(spot[0]), tileToWorld(spot[1]));
            u.cheer = 1.2;
            this.fx.puff(u.pos.clone(), 0xe8dcc4, 10, 0.35);
            if (q.kind === 'soldier') {
              this.stats.soldiers = (this.stats.soldiers ?? 0) + 1;
              this.markGoal('soldier');
              this.ui.toast('🛡️ A new soldier is ready to protect the town!', true);
            } else if (q.kind === 'archer') {
              this.stats.archers = (this.stats.archers ?? 0) + 1;
              this.markGoal('archer');
              this.ui.toast('🏹 A new archer is ready!', true);
            } else if (q.kind === 'rider') {
              this.stats.riders = (this.stats.riders ?? 0) + 1;
              this.markGoal('rider');
              this.ui.toast('🐴 A rider on a fast horse is ready!', true);
            } else {
              this.stats.scouts = (this.stats.scouts ?? 0) + 1;
              this.markGoal('scout');
              this.ui.toast('🧭 A scout is off to explore!', true);
            }
            this.ui.refreshSelection();
          }
        } else if (q.t >= VILLAGER_TIME) {
          b.queue.shift();
          const v = this.spawnVillagerAtTC(q.job);
          this.stats.trained++;
          this.markGoal('train');
          if (v) { this.floatText(v.pos, '👋 New villager!'); this.fx.puff(v.pos.clone(), 0xe8dcc4, 10, 0.35); v.cheer = 1.4; }
          this.ui.toast('👋 A new villager is ready to work!', true);
          this.ui.refreshSelection();
        }
      }
      if (b.ageUp) {
        const next = AGES[this.age];
        b.ageUp.t += dt;
        if (next && b.ageUp.t >= next.time) {
          b.ageUp = null;
          this.completeAgeUp();
        }
      }
      if (b.research) {
        const def = RESEARCH.find((r) => r.id === b.research!.id)!;
        b.research.t += dt;
        if (b.research.t >= def.time) {
          this.research.add(def.id);
          b.research = null;
          this.ui.toast(`${def.emoji} Research done: ${def.name}! ${def.desc}`, true);
          this.ui.refreshSelection();
        }
      }
    }
  }

  private checkGoals() {
    const count = (t: BType) => [...this.buildings.values()].filter((b) => b.type === t && b.built).length;
    const checks: Record<string, () => boolean> = {
      gather_wood: () => [...this.villagers.values()].some((v) => v.task.k === 'gather' && this.nodes.get(v.task.node)?.kind === 'tree'),
      train: () => this.stats.trained > 0,
      house: () => count('house') > 0,
      hunt: () => this.stats.hunted > 0,
      pop8: () => this.liveVillagers() >= 8,
      farm: () => count('farm') > 0,
      stone: () => this.stats.collected.stone >= 100,
      research: () => this.research.size > 0,
      storehouse: () => count('storehouse') > 0,
      gold: () => this.stats.collected.gold >= 100,
      pop15: () => this.liveVillagers() >= 15,
      allresearch: () => researchFor(1).every((r) => this.research.has(r.id)),
      barracks: () => count('barracks') > 0,
      tower: () => count('tower') > 0,
      soldier: () => (this.stats.soldiers ?? 0) > 0,
      scout: () => (this.stats.scouts ?? 0) > 0,
      defend: () => (this.stats.raidsDefended ?? 0) > 0,
      sam: () => this.combat.samLevel > 1,
      explore: () => this.fog.fraction() >= 0.5,
      bronze: () => this.age >= 2,
      archery: () => count('archery') > 0,
      stables: () => count('stables') > 0,
      archer: () => (this.stats.archers ?? 0) > 0,
      rider: () => (this.stats.riders ?? 0) > 0,
      bronze_tools: () => this.research.has('bronze_tools'),
      pop20: () => this.liveVillagers() >= 20,
      defend3: () => (this.stats.raidsDefended ?? 0) >= 3,
      sam3: () => this.combat.samLevel >= 3,
      allbronze: () => researchFor(2).every((r) => this.research.has(r.id)),
    };
    for (const g of GOALS) if ((g.age ?? 1) <= this.age && !this.goalsDone.has(g.id) && checks[g.id]?.()) this.markGoal(g.id);
  }

  markGoal(id: string) {
    const g = GOALS.find((x) => x.id === id);
    if (!g || this.goalsDone.has(id)) return;
    this.goalsDone.add(id);
    this.give(g.reward);
    this.ui.goalDone(g.text, g.reward);
  }

  update(dt: number) {
    this.clock += dt;
    if (!this.paused) {
      this.playTime += dt;
      for (const v of this.villagers.values()) this.updateVillager(v, dt);
      for (const a of this.animals.values()) this.updateAnimal(a, dt);
      this.updateBuildings(dt);
      this.combat.update(dt);
      // villagers hiding inside slowly heal
      for (const v of this.villagers.values()) if (v.hidden) v.hp = Math.min(v.maxHp, v.hp + dt * 2);
      this.revealT -= dt;
      if (this.revealT <= 0) {
        this.revealT = 0.25;
        for (const v of this.villagers.values()) if (!v.hidden && !v.dying) this.fog.reveal(v.pos.x, v.pos.z, 4);
        if (this.fog.fraction() >= 0.5) this.markGoal('explore');
      }
      this.storageWarnT -= dt;
      // villagers eat
      this.upkeepT += dt;
      if (this.upkeepT >= FOOD_UPKEEP_EVERY) {
        this.upkeepT = 0;
        const before = this.res.food;
        this.res.food = Math.max(0, this.res.food - this.liveVillagers());
        if (before > 0 && this.res.food === 0) this.ui.toast('🍓 Your villagers are hungry! They work slower. Gather food!', true);
      }
      // safety net: the town always has a few villagers
      if (this.liveVillagers() < 3) {
        this.freeVillagerT += dt;
        if (this.freeVillagerT > 30) {
          this.freeVillagerT = 0;
          this.spawnVillagerAtTC('food');
          this.ui.toast('👋 A traveler joined your town!', true);
        }
      }
      // deer wander back in over time
      this.deerT += dt;
      if (this.deerT > 75 && this.animals.size < 10) {
        this.deerT = 0;
        for (let t = 0; t < 30; t++) {
          const i = randInt(4, MAP - 5), j = randInt(4, MAP - 5);
          if (Math.hypot(i - MAP / 2, j - MAP / 2) > 14 && this.grid.walkable(i, j)) {
            for (let k = 0; k < 2; k++) this.addAnimal(tileToWorld(i) + Math.random(), tileToWorld(j) + Math.random());
            break;
          }
        }
      }
      this.goalT += dt;
      if (this.goalT > 1) { this.goalT = 0; this.checkGoals(); }
    }
    this.trees.flush();
    this.fog.update();
    this.rts.update(dt);
    this.updateVisuals(dt);
  }

  private updateVisuals(dt: number) {
    for (const v of [...this.villagers.values()]) {
      v.mesh.visible = !v.hidden;
      if (v.hidden) { v.ring.visible = false; continue; }
      if (v.dying) {
        v.dying -= dt;
        if (v.dying < 0.8) v.mesh.position.y -= dt * 0.5;
        v.ch.mixer.update(dt);
        v.ring.visible = false;
        if (v.dying <= 0) { this.root.remove(v.mesh, v.ring); this.villagers.delete(v.id); }
        continue;
      }
      v.pos.y = this.terrain.heightAt(v.pos.x, v.pos.z);
      v.mesh.position.copy(v.pos);
      this.animateVillager(v, dt);
      v.ring.visible = v.selected;
      if (v.selected) v.ring.position.set(v.pos.x, v.pos.y + 0.03, v.pos.z);
    }
    for (const n of this.nodes.values()) {
      if (n.shake > 0) {
        n.shake -= dt;
        n.mesh.rotation.z = Math.sin(this.clock * 40) * 0.025 * (n.shake > 0 ? 1 : 0);
      }
    }
    // falling trees
    this.falling = this.falling.filter((f) => {
      f.t += dt;
      const fallT = Math.min(1, f.t / 1.1);
      f.obj.quaternion.setFromAxisAngle(f.axis, (Math.PI / 2) * fallT * fallT);
      if (f.t >= 1.1 && !f.obj.userData.landed) {
        f.obj.userData.landed = true;
        const p = f.obj.position.clone();
        const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(f.obj.quaternion);
        this.fx.leaves(p.addScaledVector(dir, 0.9));
        this.fx.puff(f.obj.position.clone().addScaledVector(dir, 0.5), 0xbfae8e, 8, 0.4);
      }
      if (f.t > 1.6) f.obj.position.y -= dt * 0.6;
      if (f.t > 2.6) { this.root.remove(f.obj); return false; }
      return true;
    });
    this.combat.updateVisuals(dt, this.paused);
    // chimney smoke (and smoke from damaged buildings)
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      for (const b of this.buildings.values()) {
        const max = BUILDINGS[b.type].hp;
        if (!b.built || b.hp >= max * 0.7) continue;
        const p = b.mesh.position.clone().setY(b.mesh.position.y + (b.broken ? 0.4 : 1.4));
        this.fx.smoke.emit({ pos: p, spread: b.size * 0.5, vel: new THREE.Vector3(0.1, 0.7, 0), color: 0x5a5550, size: 0.35, grow: 0.6, life: 2.4, alpha: 0.6 });
        if (b.hp < max * 0.35 || b.broken) this.fx.glow.emit({ pos: p, spread: b.size * 0.4, vel: new THREE.Vector3(0, 0.9, 0), color: 0xff8a2a, size: 0.25, life: 0.7, alpha: 0.9 });
      }
      this.smokeT = this.fx.quality === 'low' ? 0.9 : 0.45;
      const t = this.rts.target;
      for (const c of this.chimneys) {
        const b = this.buildings.get(c.b);
        if (!b?.built || Math.abs(c.pos.x - t.x) > 28 || Math.abs(c.pos.z - t.z) > 28) continue;
        this.fx.smokeFrom(c.pos);
      }
    }
    // horses in the stables graze and swish their tails
    for (const b of this.buildings.values()) for (const h of (b.mesh.userData.horses ?? []) as Quad[]) animateQuad(h, 0, true, dt);
    // farm crops shrink as they are harvested, then grow back
    for (const b of this.buildings.values()) {
      if (b.type !== 'farm' || !b.built) continue;
      const crops = b.mesh.userData.crops as THREE.Object3D;
      const farmer = b.farmer !== null ? this.villagers.get(b.farmer) : undefined;
      const want = farmer && farmer.task.k === 'farm' ? 1 - 0.6 * Math.min(1, farmer.carry.amt / this.carryCap()) : 1;
      const cur = b.mesh.userData.cropH ?? 1;
      const next = cur + (want - cur) * Math.min(1, dt * 2);
      b.mesh.userData.cropH = next;
      crops.scale.y = next;
    }
    // worn paths update a couple of times a second
    this.wearT += dt;
    if (this.wearT > 0.5) {
      this.wearT = 0;
      this.terrain.refreshWear(this.paused ? 0 : 0.0012);
    }
    // selection outline
    const sb = this.selectedBuilding !== null ? this.buildings.get(this.selectedBuilding) : null;
    this.selOutline.visible = !!sb;
    if (sb) {
      this.selOutline.position.set(sb.mesh.position.x, sb.mesh.position.y + 0.05, sb.mesh.position.z);
      this.selOutline.scale.set(sb.size + 0.1, 1, sb.size + 0.1);
    }
    // the sun (and moon) follow the camera so shadows stay sharp
    this.fx.update(dt, this.paused, this.rts.target, (x, z) => this.terrain.heightAt(x, z));
    ((this.terrain.waterMesh.material as THREE.ShaderMaterial).uniforms.sunDir.value as THREE.Vector3).copy(this.fx.sunDir);
    const ext = Math.max(14, Math.min(42, this.rts.dist * 0.95));
    const sc = this.sun.shadow.camera;
    if (sc.right !== ext) {
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 80;
      sc.updateProjectionMatrix();
    }
    // floating "+10 wood" texts
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.floats = this.floats.filter((f) => {
      f.t += dt;
      if (f.t > 1.6) { f.el.remove(); return false; }
      const p = f.pos.clone();
      p.y += 1.2 + f.t * 0.8;
      p.project(this.rts.cam);
      f.el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.min(1, (1.6 - f.t) * 2));
      return true;
    });
  }

  floatText(pos: THREE.Vector3, text: string) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    this.floatLayer.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0 });
  }

  render() {
    this.fx.render();
  }

  // ======================= advancing to the next age =======================
  ageUpBlockers() {
    const out: string[] = [];
    const missingResearch = researchFor(this.age).filter((r) => !this.research.has(r.id));
    if (missingResearch.length) out.push(`Finish the research: ${missingResearch.map((r) => r.name).join(', ')}`);
    return out;
  }

  async startAgeUp() {
    const tc = this.townCenter();
    const next = AGES[this.age];
    if (!tc || !next || this.age >= BUILT_AGES) return;
    if (tc.ageUp) return;
    const blockers = this.ageUpBlockers();
    if (blockers.length) { this.ui.toast(`To advance: ${blockers.join('. ')}.`, true); return; }
    const ok = await this.tryWithQuestion('science', `${next.emoji} Advance to the ${next.name}! ⭐ Boss question`, next.cost, 3);
    if (ok) {
      tc.ageUp = { t: 0 };
      this.ui.toast(`${next.emoji} Your people are getting ready for the ${next.name}!`, true);
    }
    this.ui.refreshSelection();
  }

  private completeAgeUp() {
    this.age++;
    const def = AGES[this.age - 1];
    // questions step up; the level inside the new age starts a little lower so it is not a big jump
    for (const k of Object.keys(this.skills) as Skill[]) this.skills[k].level = Math.max(1, this.skills[k].level - 1);
    this.applyAgeLook();
    const tc = this.townCenter();
    if (tc) {
      for (let k = 0; k < 4; k++) setTimeout(() => this.fx.confetti(tc.mesh.position.clone().setY(tc.mesh.position.y + 2 + k)), k * 300);
      this.fx.puff(tc.mesh.position.clone().setY(tc.mesh.position.y + 0.5), 0xffe9a8, 30, 0.8);
    }
    for (const v of this.villagers.values()) if (!v.dying && !v.hidden) v.cheer = 2.5;
    this.markGoal('bronze');
    this.ui.toast(`${def.emoji} Welcome to the ${def.name}! New buildings, new research, and harder questions.`, true);
    this.ui.ageChanged();
    this.save();
  }

  /** Rebuild every building with the look of the current age */
  applyAgeLook() {
    for (const b of this.buildings.values()) {
      const old = b.mesh;
      const mesh = makeBuilding(b.type, mulberry32(b.i * 77 + b.j), this.age);
      mesh.position.copy(old.position);
      this.root.remove(old);
      this.root.add(mesh);
      b.mesh = mesh;
      setBuildProgress(mesh, b.progress, b.built);
      if (b.broken) setBroken(mesh, true);
      if (b.built) this.fx.puff(mesh.position.clone().setY(mesh.position.y + 0.6), 0xe8dcc4, 10, 0.5);
    }
    this.chimneys = [];
    for (const b of this.buildings.values()) if (b.type === 'house') this.chimneys.push({ b: b.id, pos: this.highestPoint(b.mesh.userData.main) });
  }

  // ======================= raids: villagers & buildings =======================
  liveVillagers() {
    let n = 0;
    for (const v of this.villagers.values()) if (!v.dying) n++;
    return n;
  }

  villagerDown(v: Villager) {
    v.hp = 0;
    v.dying = 2.6;
    v.selected = false;
    v.path = [];
    this.releaseFarm(v);
    this.setTool(v, null);
    this.setBundle(v, null);
    playAnim(v.ch, 'Death_A', 0.1);
    this.ui.toast('😢 A villager was knocked out by the raiders.');
  }

  hideVillager(v: Villager) {
    if (v.dying || v.hidden) return;
    this.releaseFarm(v);
    v.task = { k: 'hide' };
    v.path = [];
  }

  unhideAll() {
    const tc = this.townCenter();
    for (const v of this.villagers.values()) {
      if (v.dying) continue;
      if (v.hidden && tc) {
        const ring = this.grid.ringAround(tc.i, tc.j, tc.size, tc.i + 1, tc.j + 4);
        const spot = ring[Math.floor(Math.random() * Math.min(ring.length, 8))];
        if (spot) v.pos.set(tileToWorld(spot[0]), 0, tileToWorld(spot[1]));
      }
      v.hidden = false;
      if (v.task.k === 'hide') {
        if (v.job) this.autoJob(v, v.job);
        else v.task = { k: 'idle' };
      }
    }
  }

  breakBuilding(b: Building) {
    const def = BUILDINGS[b.type];
    b.broken = true;
    b.repairing = false;
    b.queue = [];
    if (b.farmer !== null) {
      const f = this.villagers.get(b.farmer);
      if (f && f.task.k === 'farm') f.task = { k: 'idle' };
      b.farmer = null;
    }
    setBroken(b.mesh, true);
    this.fx.puff(b.mesh.position.clone().setY(b.mesh.position.y + 0.5), 0x8f8577, 24, 0.7);
    this.ui.toast(`💥 The raiders broke a ${def.name}. Click it later to repair it.`, true);
    this.ui.refreshSelection();
  }

  /** Repair costs resources and a question, then villagers do the work */
  async startRepair(b: Building) {
    if (b.repairing || b.hp >= BUILDINGS[b.type].hp) return;
    const ok = await this.tryWithQuestion('mixed', `🔨 Repair the ${BUILDINGS[b.type].name}`, repairCost(b.type));
    if (!ok) return;
    b.repairing = true;
    let workers = this.selectedVillagers();
    if (!workers.length) {
      const c = b.mesh.position;
      workers = [...this.villagers.values()].filter((v) => !v.dying && !v.hidden)
        .sort((a, b2) => a.pos.distanceTo(c) + (a.task.k === 'idle' ? 0 : 30) - (b2.pos.distanceTo(c) + (b2.task.k === 'idle' ? 0 : 30))).slice(0, 2);
    }
    for (const v of workers) this.commandRepair(v, b);
    this.ui.toast(`🔨 Your villagers are fixing the ${BUILDINGS[b.type].name}!`);
    this.ui.refreshSelection();
  }

  commandRepair(v: Villager, b: Building) {
    this.releaseFarm(v);
    v.task = { k: 'repair', b: b.id };
    v.path = [];
  }

  private finishRepair(b: Building) {
    b.hp = BUILDINGS[b.type].hp;
    b.repairing = false;
    if (b.broken) {
      b.broken = false;
      setBroken(b.mesh, false);
    }
    this.fx.puff(b.mesh.position.clone().setY(b.mesh.position.y + 0.4), 0xd6c4a3, 16, 0.5);
    this.ui.toast(`🔨 The ${BUILDINGS[b.type].name} is as good as new!`, true);
    for (const v of this.villagers.values()) if (v.task.k === 'repair' && v.task.b === b.id) { v.cheer = 1.4; v.task = { k: 'idle' }; if (v.job) this.autoJob(v, v.job); }
    this.ui.refreshSelection();
  }

  // ======================= villager looks =======================
  private animateVillager(v: Villager, dt: number) {
    const ch = v.ch;
    if (v.cheer > 0) {
      v.cheer -= dt;
      playAnim(ch, 'Cheer', 0.15);
    } else {
      const a = this.paused ? 'idle' : v.anim;
      const clip = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', chop: '1H_Melee_Attack_Chop', mine: '1H_Melee_Attack_Chop', build: '1H_Melee_Attack_Chop', pick: 'Interact' }[a];
      const speed = a === 'walk' ? (this.res.food <= 0 ? 0.8 : 1.05) : a === 'chop' ? 0.85 : a === 'mine' ? 0.75 : a === 'build' ? 1.15 : 1;
      playAnim(ch, clip, 0.2, speed);
    }
    ch.mixer.update(this.paused ? dt * 0.5 : dt);
  }

  private setTool(v: Villager, tool: ToolName | null) {
    if (v.cheer > 0) tool = null;
    if (v.tool === tool) return;
    v.toolObj?.parent?.remove(v.toolObj);
    v.toolObj = null;
    v.tool = tool;
    if (!tool) return;
    const t = makeTool(tool);
    if (tool === 'basket') {
      v.ch.handL.add(t);
    } else {
      v.ch.handR.add(t);
    }
    v.toolObj = t;
  }

  private setBundle(v: Villager, res: Res | null) {
    if (v.bundleRes === res) return;
    if (v.bundle) v.ch.back.remove(v.bundle);
    v.bundle = null;
    v.bundleRes = res;
    if (!res) return;
    const b = makeBundle(res);
    b.position.set(0, 0.25, -0.55);
    v.ch.back.add(b);
    v.bundle = b;
  }

  // ======================= input =======================
  private groundPoint(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.rts.cam);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }

  private screenPos(p: THREE.Vector3, lift = 0.5) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = p.clone();
    v.y += lift;
    v.project(this.rts.cam);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  pick(cx: number, cy: number): Target {
    // villagers and animals: closest on screen
    const seen = (p: THREE.Vector3) => this.fog.isExplored(worldToTile(p.x), worldToTile(p.z));
    let bestV: Villager | null = null, bv = 26;
    for (const v of this.villagers.values()) {
      if (v.hidden || v.dying) continue;
      const s = this.screenPos(v.pos);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bv) { bv = d; bestV = v; }
    }
    let bestU: Unit | null = null, bu = bestV ? bv : 28;
    for (const u of this.combat.units.values()) {
      if (u.dying || !seen(u.pos)) continue;
      const s = this.screenPos(u.pos);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bu) { bu = d; bestU = u; }
    }
    if (bestU) return { kind: 'unit', unit: bestU };
    if (bestV) return { kind: 'villager', villager: bestV };
    let bestA: Animal | null = null, ba = 30;
    for (const a of this.animals.values()) {
      if (!seen(a.pos)) continue;
      const s = this.screenPos(a.pos, 0.4);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < ba) { ba = d; bestA = a; }
    }
    if (bestA) return { kind: 'animal', animal: bestA };
    const g = this.groundPoint(cx, cy);
    if (!g) return { kind: 'none' };
    const i = worldToTile(g.x), j = worldToTile(g.z);
    const b = this.buildingAtTile(i, j);
    if (b) return { kind: 'building', building: b };
    // resource nodes: check the tile and its neighbors (trees are tall, so clicks land a bit off)
    let bestN: ResNode | null = null, bn = 40;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const id = this.nodeAt.get((j + dj) * MAP + (i + di));
        const n = id !== undefined ? this.nodes.get(id) : undefined;
        if (!n || !this.fog.isExplored(n.i, n.j)) continue;
        const s = this.screenPos(n.mesh.position, n.kind === 'tree' ? 0.6 : 0.2);
        const d = Math.hypot(s.x - cx, s.y - cy);
        if (d < bn) { bn = d; bestN = n; }
      }
    for (const n of this.nodes.values()) {
      if (n.kind !== 'carcass') continue;
      const s = this.screenPos(n.mesh.position, 0.1);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bn) { bn = d; bestN = n; }
    }
    if (bestN) return { kind: 'node', node: bestN };
    return { kind: 'ground', point: g };
  }

  private setupInput() {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.rts.zoom(e.deltaY); }, { passive: false });
    let down: { x: number; y: number; button: number; moved: boolean; shift: boolean } | null = null;
    let last = { x: 0, y: 0 };

    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, shift: e.shiftKey };
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (down) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
        if (down.moved && (down.button === 2 || down.button === 1)) {
          this.rts.panPixels(e.clientX - last.x, e.clientY - last.y);
        } else if (down.moved && down.button === 0 && !this.placing) {
          const x0 = Math.min(down.x, e.clientX), y0 = Math.min(down.y, e.clientY);
          const r = this.container.getBoundingClientRect();
          Object.assign(this.selBox.style, {
            display: 'block', left: `${x0 - r.left}px`, top: `${y0 - r.top}px`,
            width: `${Math.abs(e.clientX - down.x)}px`, height: `${Math.abs(e.clientY - down.y)}px`,
          });
        }
      }
      last = { x: e.clientX, y: e.clientY };
      this.onHover(e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const d = down;
      down = null;
      this.selBox.style.display = 'none';
      if (d.button === 0) {
        if (this.placing) { this.confirmPlacement(); return; }
        if (d.moved) { this.boxSelect(d.x, d.y, e.clientX, e.clientY, d.shift); return; }
        this.leftClick(e.clientX, e.clientY, d.shift);
      } else if (d.button === 2 && !d.moved) {
        if (this.placing) { this.cancelPlacement(); return; }
        const t = this.pick(e.clientX, e.clientY);
        const g = this.groundPoint(e.clientX, e.clientY);
        if ((this.selectedVillagers().length || this.selectedUnits().length) && g) this.commandTarget(t, g);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.placing) this.cancelPlacement();
        else { this.setSelected([]); this.selectBuilding(null); }
      }
    });
  }

  private leftClick(cx: number, cy: number, shift: boolean) {
    const t = this.pick(cx, cy);
    const g = this.groundPoint(cx, cy);
    const sel = this.selectedVillagers();
    const selU = this.selectedUnits();
    if (t.kind === 'villager') {
      if (shift && t.villager.selected) { t.villager.selected = false; this.ui.refreshSelection(); }
      else this.setSelected([t.villager], shift);
      return;
    }
    if (t.kind === 'unit' && t.unit.kind !== 'raider') {
      if (t.unit.kind === 'sam') { this.ui.toast('🛡️ General Sam fights on his own. He always protects the town!'); return; }
      if (shift && t.unit.selected) { t.unit.selected = false; this.ui.refreshSelection(); }
      else this.setSelected([], shift, [t.unit]);
      return;
    }
    if ((sel.length || selU.length) && g) {
      // with villagers selected, clicking a thing tells them to work on it
      if (t.kind === 'building' && t.building.built && t.building.type !== 'farm' && !t.building.repairing && !t.building.broken && !sel.some((v) => v.carry.amt > 0) && !selU.length) {
        this.selectBuilding(t.building);
        return;
      }
      this.commandTarget(t, g);
      return;
    }
    if (t.kind === 'building') { this.selectBuilding(t.building); return; }
    this.setSelected([]);
    this.selectBuilding(null);
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const inBox = (p: THREE.Vector3) => {
      const s = this.screenPos(p);
      return s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY;
    };
    const vs = [...this.villagers.values()].filter((v) => !v.hidden && !v.dying && inBox(v.pos));
    const us = [...this.combat.units.values()].filter((u) => !u.dying && isMine(u.kind) && inBox(u.pos));
    this.setSelected(vs, add, us);
  }

  private onHover(cx: number, cy: number) {
    if (this.placing) {
      const g = this.groundPoint(cx, cy);
      if (g) {
        const s = BUILDINGS[this.placing.type].size;
        const i = worldToTile(g.x) - Math.floor((s - 1) / 2), j = worldToTile(g.z) - Math.floor((s - 1) / 2);
        this.placing.i = i; this.placing.j = j;
        this.placing.ok = this.canPlace(this.placing.type, i, j);
        const x = tileToWorld(i) - 0.5 + s / 2, z = tileToWorld(j) - 0.5 + s / 2;
        this.placing.ghost.position.set(x, this.terrain.heightAt(x, z) + 0.02, z);
        setGhostValid(this.placing.ghost, this.placing.ok);
      }
      this.hoverText = this.placing.ok ? 'Click to build here' : "Can't build here";
      this.renderer.domElement.style.cursor = 'crosshair';
      return;
    }
    const t = this.pick(cx, cy);
    let text = '';
    const gp = this.groundPoint(cx, cy);
    if (t.kind === 'unit') text = { soldier: '🛡️ Soldier', scout: '🧭 Scout', archer: '🏹 Archer', rider: '🐴 Rider', raider: '⚔️ Raider! Send soldiers to fight it', sam: '🛡️ General Sam' }[t.unit.kind];
    else if ((t.kind === 'ground' || t.kind === 'none') && gp && !this.fog.isExplored(worldToTile(gp.x), worldToTile(gp.z))) text = '☁️ Unexplored land · send a scout';
    else if (t.kind === 'node') text = `${NODE_LABEL[t.node.kind]} · ${Math.ceil(t.node.amount)} ${RES_ICON[t.node.res]} left`;
    else if (t.kind === 'animal') text = '🦌 Deer · hunt it for food';
    else if (t.kind === 'villager') text = `🧑 Villager · ${this.villagerStatus(t.villager)}`;
    else if (t.kind === 'building') {
      const def = BUILDINGS[t.building.type];
      const b = t.building;
      text = `${def.emoji} ${def.name}${b.built ? '' : ` · being built (${Math.floor(b.progress * 100)}%)`}${b.broken ? ' · broken, needs repair' : b.built && b.hp < def.hp ? ' · damaged' : ''}`;
    }
    this.hoverText = text;
    this.renderer.domElement.style.cursor = t.kind === 'none' || t.kind === 'ground' ? 'default' : 'pointer';
  }

  villagerStatus(v: Villager) {
    const t = v.task;
    if (t.k === 'gather') {
      const n = this.nodes.get(t.node);
      const what = n ? { tree: 'chopping wood', berry: 'picking berries', stone: 'mining stone', gold: 'mining gold', carcass: 'gathering meat' }[n.kind] : 'gathering';
      return t.stage === 'drop' ? 'carrying it home' : what;
    }
    return VILLAGER_NAMES_ACTION[t.k];
  }

  // ======================= save / load =======================
  save() {
    try {
      const data = {
        v: 1, seed: this.seed, res: this.res, research: [...this.research], goals: [...this.goalsDone], stats: this.stats, skills: this.skills,
        playTime: this.playTime, nextId: this.nextId, stumps: this.stumps,
        nodes: [...this.nodes.values()].map((n) => [n.id, n.kind, n.i, n.j, Math.round(n.amount * 10) / 10]),
        buildings: [...this.buildings.values()].map((b) => ({ id: b.id, type: b.type, i: b.i, j: b.j, built: b.built, progress: b.progress, hp: b.hp, queue: b.queue, research: b.research, farmer: b.farmer, broken: b.broken, repairing: b.repairing, ageUp: b.ageUp ?? null })),
        villagers: [...this.villagers.values()].filter((v) => !v.dying).map((v) => ({ id: v.id, x: v.pos.x, z: v.pos.z, job: v.job, carry: v.carry, task: v.task, hp: v.hp })),
        combat: this.combat.serialize(),
        fog: this.fog.serialize(),
        dayT: this.fx.dayT,
        age: this.age,
        animals: [...this.animals.values()].map((a) => [a.id, a.pos.x, a.pos.z]),
        camera: [this.rts.target.x, this.rts.target.z, this.rts.wantDist],
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('save failed', e);
    }
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  deleteSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  load(): boolean {
    let data: any;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch { return false; }
    if (!data || data.v !== 1) return false;
    this.clearWorld();
    this.age = data.age ?? 1;
    this.setupTerrain(data.seed);
    this.res = data.res;
    this.research = new Set(data.research);
    this.goalsDone = new Set(data.goals);
    this.stats = data.stats;
    this.skills = { ...newSkills(), ...data.skills };
    this.playTime = data.playTime ?? 0;
    for (const b of data.buildings) {
      const nb = this.addBuilding(b.type, b.i, b.j, b.built, b.id);
      nb.progress = b.progress; nb.hp = b.hp; nb.queue = b.queue ?? []; nb.research = b.research ?? null; nb.farmer = b.farmer ?? null;
      nb.broken = !!b.broken; nb.repairing = !!b.repairing; nb.ageUp = b.ageUp ?? null;
      setBuildProgress(nb.mesh, nb.progress, nb.built);
      if (nb.broken) setBroken(nb.mesh, true);
    }
    for (const [id, kind, i, j, amount] of data.nodes) this.addNode(kind, i, j, amount, id);
    for (const [i, j] of data.stumps ?? []) this.addStump(i, j);
    for (const [id, x, z] of data.animals) this.addAnimal(x, z, id);
    for (const v of data.villagers) {
      const nv = this.spawnVillager(v.x, v.z, null, v.id);
      nv.job = v.job;
      nv.hp = v.hp ?? nv.maxHp;
      nv.carry = v.carry ?? { res: null, amt: 0 };
      this.setBundle(nv, nv.carry.amt > 0 ? nv.carry.res : null);
      const t = v.task as Task;
      if (t && (t.k === 'gather' || t.k === 'farm' || t.k === 'build' || t.k === 'dropoff' || t.k === 'repair')) nv.task = t;
      else if (t && t.k === 'hunt') nv.task = { k: 'hunt', a: t.a, repath: 0 };
      if (nv.task.k === 'gather' && nv.task.stage === 'work') nv.task.stage = 'to';
      if (nv.task.k === 'farm' && nv.task.stage === 'work') nv.task.stage = 'to';
    }
    this.nextId = Math.max(data.nextId ?? 1, ...[...this.nodes.keys(), ...this.villagers.keys(), ...this.buildings.keys(), ...this.animals.keys()].map((k) => k + 1));
    this.combat.load(data.combat);
    if (data.fog) this.fog.load(data.fog);
    else this.fog.reveal(0.5, 0.5, 14);
    if (typeof data.dayT === 'number') this.fx.dayT = data.dayT;
    this.nextId = Math.max(this.nextId, ...[...this.combat.units.keys()].map((k) => k + 1));
    if (data.camera) { this.rts.focus(data.camera[0], data.camera[1]); this.rts.wantDist = data.camera[2]; }
    return true;
  }
}

export type Target =
  | { kind: 'villager'; villager: Villager }
  | { kind: 'unit'; unit: Unit }
  | { kind: 'animal'; animal: Animal }
  | { kind: 'node'; node: ResNode }
  | { kind: 'building'; building: Building }
  | { kind: 'ground'; point: THREE.Vector3 }
  | { kind: 'none' };
