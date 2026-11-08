import * as THREE from 'three';
import { makeNoise, mulberry32 } from './util';
import { mat } from './models';

export const MAP = 72;

export function tileToWorld(i: number) {
  return i - MAP / 2 + 0.5;
}
export function worldToTile(x: number) {
  return Math.floor(x + MAP / 2);
}

interface Lake { x: number; z: number; r: number }

export class Terrain {
  noise: (x: number, y: number) => number;
  lakes: Lake[] = [];
  water: Uint8Array;
  mesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  decor: THREE.Group;

  constructor(public seed: number) {
    this.noise = makeNoise(seed);
    const rnd = mulberry32(seed * 7 + 3);
    // lakes away from the center (where the town starts)
    let tries = 0;
    while (this.lakes.length < 3 && tries++ < 200) {
      const x = (rnd() - 0.5) * (MAP - 16);
      const z = (rnd() - 0.5) * (MAP - 16);
      const r = 3 + rnd() * 3.5;
      if (Math.hypot(x, z) < 15 + r) continue;
      if (this.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + r + 6)) continue;
      this.lakes.push({ x, z, r });
    }
    this.water = new Uint8Array(MAP * MAP);
    for (let j = 0; j < MAP; j++)
      for (let i = 0; i < MAP; i++) if (this.lakeFactor(tileToWorld(i), tileToWorld(j)) > 0.45) this.water[j * MAP + i] = 1;

    this.mesh = this.buildMesh();
    this.waterMesh = this.buildWater();
    this.decor = this.buildDecor(rnd);
  }

  lakeFactor(x: number, z: number) {
    let f = 0;
    for (const l of this.lakes) {
      const wobble = (this.noise(x * 0.25 + 50, z * 0.25 + 50) - 0.5) * 2.2;
      const d = Math.hypot(x - l.x, z - l.z) + wobble;
      const t = THREE.MathUtils.smoothstep(l.r + 1.2 - d, 0, 2.4);
      f = Math.max(f, t);
    }
    return f;
  }

  heightAt(x: number, z: number) {
    const land = this.noise(x * 0.05 + 10, z * 0.05 + 10) * 0.7 - 0.2;
    const lf = this.lakeFactor(x, z);
    return Math.max(0, land) * (1 - lf) - 0.55 * lf;
  }

  isWater(i: number, j: number) {
    return this.water[j * MAP + i] === 1;
  }

  private buildMesh() {
    const seg = MAP * 2;
    const ext = MAP + 24; // extra border so edges don't show the void
    const geo = new THREE.PlaneGeometry(ext, ext, seg + 48, seg + 48);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color(0x6fb24a), grassB = new THREE.Color(0x8cc457), grassC = new THREE.Color(0x5a9c3f);
    const sand = new THREE.Color(0xd9c58f), mud = new THREE.Color(0x8a7a52), outside = new THREE.Color(0x4f8a3a);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const inside = Math.abs(x) < MAP / 2 && Math.abs(z) < MAP / 2;
      const h = this.heightAt(x, z);
      pos.setY(k, h);
      const n = this.noise(x * 0.15, z * 0.15);
      c.copy(grassA).lerp(grassB, n);
      c.lerp(grassC, Math.max(0, this.noise(x * 0.4 + 99, z * 0.4) - 0.55) * 1.5);
      const lf = this.lakeFactor(x, z);
      if (lf > 0.05) c.lerp(sand, Math.min(1, lf * 2.5));
      if (lf > 0.6) c.lerp(mud, (lf - 0.6) * 2);
      if (!inside) c.lerp(outside, 0.6);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWater() {
    const geo = new THREE.PlaneGeometry(MAP + 24, MAP + 24, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x3f9fd8, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 });
    const w = new THREE.Mesh(geo, material);
    w.position.y = -0.12;
    return w;
  }

  private buildDecor(rnd: () => number) {
    const g = new THREE.Group();
    // grass tufts and flowers using instancing (cheap to draw)
    const tuftGeo = new THREE.ConeGeometry(0.05, 0.22, 3);
    const tufts = new THREE.InstancedMesh(tuftGeo, mat(0x4f9a35), 2600);
    const flowerGeo = new THREE.IcosahedronGeometry(0.045, 0);
    const flowerColors = [0xffffff, 0xffd84a, 0xe86fa8, 0x9b7fe8];
    const flowers = flowerColors.map((col) => new THREE.InstancedMesh(flowerGeo, mat(col, 0.6), 220));
    const pebbleGeo = new THREE.DodecahedronGeometry(0.08, 0);
    const pebbles = new THREE.InstancedMesh(pebbleGeo, mat(0x9b978d), 300);
    const dummy = new THREE.Object3D();
    const place = (inst: THREE.InstancedMesh, count: number, minS: number, maxS: number, yOff: number) => {
      let n = 0;
      for (let t = 0; t < count * 3 && n < count; t++) {
        const x = (rnd() - 0.5) * (MAP + 20);
        const z = (rnd() - 0.5) * (MAP + 20);
        if (this.lakeFactor(x, z) > 0.1) continue;
        if (Math.hypot(x, z) < 3) continue;
        dummy.position.set(x, this.heightAt(x, z) + yOff, z);
        const s = minS + rnd() * (maxS - minS);
        dummy.scale.setScalar(s);
        dummy.rotation.set(0, rnd() * 6.28, (rnd() - 0.5) * 0.4);
        dummy.updateMatrix();
        inst.setMatrixAt(n++, dummy.matrix);
      }
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    };
    place(tufts, 2600, 0.7, 1.4, 0.08);
    for (const f of flowers) place(f, 220, 0.8, 1.2, 0.12);
    place(pebbles, 300, 0.6, 1.5, 0.02);
    return g;
  }
}

// ---------- pathfinding grid ----------
export class Grid {
  blocked = new Uint8Array(MAP * MAP); // 1 = water / building / resource
  inBounds(i: number, j: number) {
    return i >= 0 && j >= 0 && i < MAP && j < MAP;
  }
  walkable(i: number, j: number) {
    return this.inBounds(i, j) && this.blocked[j * MAP + i] === 0;
  }
  set(i: number, j: number, v: boolean) {
    if (this.inBounds(i, j)) this.blocked[j * MAP + i] = v ? 1 : 0;
  }

  /** A* with 8 directions, no corner cutting. Returns tile list excluding start, or null. */
  findPath(si: number, sj: number, ti: number, tj: number, maxIter = 12000): [number, number][] | null {
    if (!this.walkable(ti, tj)) return null;
    if (si === ti && sj === tj) return [];
    const N = MAP * MAP;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: [number, number][] = []; // [f, idx]
    const push = (f: number, idx: number) => {
      heap.push([f, idx]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let s = c;
          if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
          if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
          if (s === c) break;
          [heap[s], heap[c]] = [heap[c], heap[s]];
          c = s;
        }
      }
      return top;
    };
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const start = sj * MAP + si;
    g[start] = 0;
    push(h(si, sj), start);
    let iter = 0;
    while (heap.length && iter++ < maxIter) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % MAP, cj = (cur / MAP) | 0;
      if (ci === ti && cj === tj) {
        const out: [number, number][] = [];
        let k = cur;
        while (k !== start) {
          out.push([k % MAP, (k / MAP) | 0]);
          k = came[k];
        }
        return out.reverse();
      }
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.walkable(ni, nj)) continue;
          if (di && dj && (!this.walkable(ci + di, cj) || !this.walkable(ci, cj + dj))) continue;
          const nidx = nj * MAP + ni;
          if (closed[nidx]) continue;
          const ng = g[cur] + (di && dj ? 1.414 : 1);
          if (ng < g[nidx]) {
            g[nidx] = ng;
            came[nidx] = cur;
            push(ng + h(ni, nj), nidx);
          }
        }
    }
    return null;
  }

  /** Walkable tiles touching a rectangle footprint, nearest first */
  ringAround(i0: number, j0: number, size: number, fromI: number, fromJ: number) {
    const out: [number, number][] = [];
    for (let j = j0 - 1; j <= j0 + size; j++)
      for (let i = i0 - 1; i <= i0 + size; i++) {
        const inside = i >= i0 && i < i0 + size && j >= j0 && j < j0 + size;
        if (!inside && this.walkable(i, j)) out.push([i, j]);
      }
    out.sort((a, b) => Math.hypot(a[0] - fromI, a[1] - fromJ) - Math.hypot(b[0] - fromI, b[1] - fromJ));
    return out;
  }

  /** Nearest walkable tile to (i,j) searching outward */
  nearestWalkable(i: number, j: number) {
    if (this.walkable(i, j)) return [i, j] as [number, number];
    for (let r = 1; r < 12; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.walkable(i + di, j + dj)) return [i + di, j + dj] as [number, number];
        }
    return null;
  }
}
