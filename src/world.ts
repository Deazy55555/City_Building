import * as THREE from 'three';
import { makeNoise, mulberry32 } from './util';
import { mat } from './models';
import { model, type StaticName } from './assets';
import { U } from './uniforms';

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
  /** how worn the ground is (0..1) per tile: villagers wear dirt paths into the grass */
  wear = new Float32Array(MAP * MAP);
  wearTex: THREE.DataTexture;
  private wearData = new Uint8Array(MAP * MAP * 4);
  scenery: THREE.Group;

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

    this.wearTex = new THREE.DataTexture(this.wearData, MAP, MAP, THREE.RGBAFormat);
    this.wearTex.magFilter = THREE.LinearFilter;
    this.wearTex.minFilter = THREE.LinearFilter;
    this.wearTex.needsUpdate = true;
    this.mesh = this.buildMesh();
    this.waterMesh = this.buildWater();
    this.decor = this.buildDecor(rnd);
    this.scenery = this.buildScenery(rnd);
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
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
    const wearTex = this.wearTex;
    material.onBeforeCompile = (sh) => {
      sh.uniforms.wearMap = { value: wearTex };
      sh.uniforms.detailMap = { value: detailTexture() };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform sampler2D wearMap; uniform sampler2D detailMap;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float det = texture2D(detailMap, vWPos.xz * 0.45).r;
          float det2 = texture2D(detailMap, vWPos.xz * 0.07 + 0.3).r;
          diffuseColor.rgb *= 0.86 + 0.22 * det + 0.12 * (det2 - 0.5);
          vec2 wuv = (vWPos.xz + ${(MAP / 2).toFixed(1)}) / ${MAP.toFixed(1)};
          float inside = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
          float wear = texture2D(wearMap, wuv).r * inside;
          vec3 dirt = vec3(0.56, 0.43, 0.29) * (0.85 + 0.3 * det);
          diffuseColor.rgb = mix(diffuseColor.rgb, dirt, smoothstep(0.12, 0.75, wear + (det - 0.5) * 0.25));`);
    };
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWater() {
    const ext = MAP + 24, res = 192;
    const heights = new Float32Array(res * res);
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) heights[j * res + i] = this.heightAt((i / (res - 1) - 0.5) * ext, (j / (res - 1) - 0.5) * ext);
    const hTex = new THREE.DataTexture(heights, res, res, THREE.RedFormat, THREE.FloatType);
    hTex.magFilter = THREE.LinearFilter;
    hTex.minFilter = THREE.LinearFilter;
    hTex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(ext, ext, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { heightMap: { value: null }, time: { value: 0 }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) }, night: { value: 0 }, ext: { value: ext } },
      ]),
      vertexShader: `
        varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vUv = uv;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D heightMap; uniform float time; uniform vec3 sunDir; uniform float night; uniform float ext;
        varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          float h = texture2D(heightMap, vec2(vUv.x, 1.0 - vUv.y)).r;
          float depth = vW.y - h;
          if (depth < -0.02) discard;
          vec2 p = vW.xz;
          float w1 = sin(p.x * 2.1 + time * 1.3) + sin(p.y * 1.7 - time * 1.1);
          float w2 = sin((p.x + p.y) * 3.3 + time * 2.0) * 0.5 + sin((p.x - p.y) * 2.7 - time * 1.7) * 0.5;
          vec3 n = normalize(vec3(cos(p.x * 2.1 + time * 1.3) * 0.12 + cos((p.x + p.y) * 3.3 + time * 2.0) * 0.08,
                                  1.0,
                                  -cos(p.y * 1.7 - time * 1.1) * 0.12 + cos((p.x - p.y) * 2.7 - time * 1.7) * 0.08));
          vec3 shallow = vec3(0.36, 0.78, 0.84), deep = vec3(0.07, 0.36, 0.62);
          vec3 col = mix(shallow, deep, smoothstep(0.02, 0.5, depth));
          vec3 v = normalize(cameraPosition - vW);
          vec3 r = reflect(-normalize(sunDir), n);
          float spec = pow(max(dot(r, v), 0.0), 80.0) * 0.9;
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          col = mix(col, vec3(0.75, 0.88, 1.0), fres * 0.35);
          col += vec3(1.0, 0.95, 0.85) * spec * (1.0 - night);
          // foam along the shore, gently moving
          float band = smoothstep(0.16, 0.0, depth);
          float ripple = step(0.55, fract(depth * 9.0 - time * 0.35 + (w1 + w2) * 0.08));
          float foam = clamp(band * (0.55 + 0.45 * ripple), 0.0, 1.0);
          col = mix(col, vec3(0.96, 0.99, 1.0), foam * 0.85);
          col *= mix(1.0, 0.42, night);
          gl_FragColor = vec4(col, mix(0.62, 0.9, smoothstep(0.0, 0.35, depth)) + foam * 0.1);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      fog: true,
      depthWrite: false,
    });
    material.uniforms.heightMap.value = hTex;
    material.uniforms.time = U.time;
    material.uniforms.night = U.night;
    const w = new THREE.Mesh(geo, material);
    w.position.y = -0.12;
    w.renderOrder = 1;
    return w;
  }

  /** Mountains, hills and water plants around the edges (decoration only) */
  private buildScenery(rnd: () => number) {
    const g = new THREE.Group();
    const half = MAP / 2;
    const put = (name: StaticName, x: number, z: number, s: number) => {
      const m = model(name);
      m.scale.setScalar(s);
      m.position.set(x, this.heightAt(x, z) - 0.05, z);
      m.rotation.y = Math.floor(rnd() * 6) * (Math.PI / 3);
      g.add(m);
    };
    const big: StaticName[] = ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'];
    const small: StaticName[] = ['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'trees_A_large', 'trees_B_large'];
    for (let side = 0; side < 4; side++) {
      for (let t = -half - 6; t <= half + 6; t += 5.5) {
        const off1 = half + 3.2 + rnd() * 1.5, off2 = half + 8 + rnd() * 2.5;
        const pts = side === 0 ? [[t, -off1], [t + 2.7, -off2]] : side === 1 ? [[t, off1], [t + 2.7, off2]] : side === 2 ? [[-off1, t], [-off2, t + 2.7]] : [[off1, t], [off2, t + 2.7]];
        put(small[Math.floor(rnd() * small.length)], pts[0][0], pts[0][1], 2.6 + rnd() * 1.0);
        put(big[Math.floor(rnd() * big.length)], pts[1][0], pts[1][1], 3.6 + rnd() * 1.6);
      }
    }
    // lilies and reeds in the lakes
    for (let j = 1; j < MAP - 1; j++)
      for (let i = 1; i < MAP - 1; i++) {
        if (!this.isWater(i, j)) continue;
        const x = tileToWorld(i), z = tileToWorld(j);
        const shore = !this.isWater(i + 1, j) || !this.isWater(i - 1, j) || !this.isWater(i, j + 1) || !this.isWater(i, j - 1);
        const r = rnd();
        if (shore && r < 0.3) {
          const m = model(rnd() < 0.5 ? 'waterplant_A' : 'waterplant_B');
          m.scale.setScalar(1.6);
          m.position.set(x + (rnd() - 0.5) * 0.6, this.heightAt(x, z), z + (rnd() - 0.5) * 0.6);
          g.add(m);
        } else if (!shore && r < 0.12) {
          const m = model(rnd() < 0.5 ? 'waterlily_A' : 'waterlily_B');
          m.scale.setScalar(1.8);
          m.position.set(x + (rnd() - 0.5) * 0.6, -0.11, z + (rnd() - 0.5) * 0.6);
          m.rotation.y = rnd() * 6;
          g.add(m);
        }
      }
    return g;
  }

  /** Called as villagers walk: wear a path into the grass */
  addWear(i: number, j: number, amt: number) {
    if (i < 0 || j < 0 || i >= MAP || j >= MAP) return;
    const k = j * MAP + i;
    this.wear[k] = Math.min(1, this.wear[k] + amt);
  }

  /** Paths slowly grow back; push the latest wear values to the GPU */
  refreshWear(decay: number) {
    for (let k = 0; k < this.wear.length; k++) {
      if (decay) this.wear[k] = Math.max(this.wear[k] * (1 - decay), this.wear[k] > 0.95 ? this.wear[k] : 0);
      this.wearData[k * 4] = Math.round(this.wear[k] * 255);
    }
    this.wearTex.needsUpdate = true;
  }

  private buildDecor(rnd: () => number) {
    const g = new THREE.Group();
    // grass tufts and flowers using instancing (cheap to draw)
    const tuftGeo = new THREE.ConeGeometry(0.05, 0.22, 3);
    const tuftMat = mat(0x4f9a35).clone();
    tuftMat.onBeforeCompile = (sh) => {
      sh.uniforms.time = U.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float time;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sw = sin(time * 1.8 + ip.x * 0.7 + ip.z * 0.5) * 0.35 + sin(time * 3.1 + ip.x * 1.3) * 0.12;
          transformed.x += sw * max(position.y + 0.11, 0.0);`);
    };
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 3200);
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
    place(tufts, 3200, 0.7, 1.5, 0.08);
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

let _detail: THREE.Texture | null = null;
/** Speckled noise texture that gives the grass some texture */
function detailTexture() {
  if (_detail) return _detail;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const noise = makeNoise(4242);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // tileable: sample noise on a torus-ish wrap by blending
      const u = x / N, v = y / N;
      const n = (noise(u * 8, v * 8) * (1 - u) * (1 - v) + noise((u - 1) * 8, v * 8) * u * (1 - v) + noise(u * 8, (v - 1) * 8) * (1 - u) * v + noise((u - 1) * 8, (v - 1) * 8) * u * v);
      const speck = Math.random() * 0.35;
      const val = Math.max(0, Math.min(255, (n * 0.75 + speck) * 255));
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = val;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  _detail = t;
  return t;
}
