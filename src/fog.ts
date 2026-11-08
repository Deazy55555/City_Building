import * as THREE from 'three';
import { MAP, tileToWorld } from './world';
import { U } from './uniforms';

/**
 * Fog of war: land nobody has seen yet is covered by soft, slowly moving clouds.
 * Once a tile is explored it stays explored.
 */
export class Fog {
  explored = new Uint8Array(MAP * MAP);
  count = 0;
  mesh: THREE.Mesh;
  private data = new Uint8Array(MAP * MAP * 4);
  private tex: THREE.DataTexture;
  private dirty = true;
  changed = true; // for the minimap

  constructor() {
    this.tex = new THREE.DataTexture(this.data, MAP, MAP, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    const ext = MAP + 24;
    const geo = new THREE.PlaneGeometry(ext, ext, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { fogMap: { value: this.tex }, time: U.time, night: U.night },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D fogMap; uniform float time; uniform float night; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec2 uv = (vW.xz + ${(MAP / 2).toFixed(1)}) / ${MAP.toFixed(1)};
          float seen = texture2D(fogMap, uv).r;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float n = fbm(vW.xz * 0.18 + vec2(time * 0.03, time * 0.02));
          float cover = (1.0 - smoothstep(0.25, 0.85, seen + (n - 0.5) * 0.45)) * inside;
          if (cover < 0.01) discard;
          vec3 col = mix(vec3(0.82, 0.86, 0.93), vec3(1.0), n);
          col = mix(col, vec3(0.16, 0.2, 0.34), night * 0.75);
          gl_FragColor = vec4(col, cover * 0.97);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 2.6;
    this.mesh.renderOrder = 4;
  }

  reset() {
    this.explored.fill(0);
    this.count = 0;
    this.dirty = true;
    this.changed = true;
  }

  isExplored(i: number, j: number) {
    if (i < 0 || j < 0 || i >= MAP || j >= MAP) return false;
    return this.explored[j * MAP + i] === 1;
  }

  /** Reveal everything within r tiles of world position (x, z) */
  reveal(x: number, z: number, r: number) {
    const ci = Math.floor(x + MAP / 2), cj = Math.floor(z + MAP / 2);
    const R = Math.ceil(r);
    for (let j = cj - R; j <= cj + R; j++)
      for (let i = ci - R; i <= ci + R; i++) {
        if (i < 0 || j < 0 || i >= MAP || j >= MAP) continue;
        const k = j * MAP + i;
        if (this.explored[k]) continue;
        if ((tileToWorld(i) - x) ** 2 + (tileToWorld(j) - z) ** 2 > r * r) continue;
        this.explored[k] = 1;
        this.count++;
        this.dirty = true;
        this.changed = true;
      }
  }

  fraction() {
    return this.count / (MAP * MAP);
  }

  /** nearest unexplored tile to (i, j), searching outward */
  nearestUnexplored(i: number, j: number, walkable: (i: number, j: number) => boolean) {
    for (let r = 2; r < MAP; r++)
      for (let t = 0; t < 8 * r; t += 2) {
        const a = (t / (8 * r)) * Math.PI * 2 + Math.random() * 0.4;
        const ti = Math.round(i + Math.cos(a) * r), tj = Math.round(j + Math.sin(a) * r);
        if (ti < 2 || tj < 2 || ti >= MAP - 2 || tj >= MAP - 2) continue;
        if (!this.explored[tj * MAP + ti] && walkable(ti, tj)) return [ti, tj] as [number, number];
      }
    return null;
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    for (let k = 0; k < this.explored.length; k++) this.data[k * 4] = this.explored[k] ? 255 : 0;
    this.tex.needsUpdate = true;
  }

  serialize() {
    // run-length encode the explored map
    const out: number[] = [];
    let cur = this.explored[0], run = 0;
    for (let k = 0; k < this.explored.length; k++) {
      if (this.explored[k] === cur) run++;
      else { out.push(run); cur = this.explored[k]; run = 1; }
    }
    out.push(run);
    return { first: this.explored[0], runs: out };
  }

  load(d: { first: number; runs: number[] }) {
    this.reset();
    let v = d.first, k = 0;
    for (const run of d.runs) {
      for (let t = 0; t < run && k < this.explored.length; t++) this.explored[k++] = v;
      v = v ? 0 : 1;
    }
    this.count = this.explored.reduce((a, b) => a + b, 0);
    this.dirty = true;
  }
}
