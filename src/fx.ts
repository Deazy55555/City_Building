import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { model } from './assets';
import { MAP } from './world';

import { U } from './uniforms';
export { U };

export type Quality = 'low' | 'medium' | 'high';
export function loadQuality(): Quality {
  try {
    const q = localStorage.getItem('citybuilding.quality');
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch { /* ignore */ }
  return 'high';
}
export function saveQuality(q: Quality) {
  try { localStorage.setItem('citybuilding.quality', q); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ particles
const softDot = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export interface EmitOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  spread?: number;
  color?: number;
  size?: number;
  grow?: number; // size added per second
  life?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
}

class ParticleSystem {
  max: number;
  count = 0;
  geo = new THREE.BufferGeometry();
  pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array;
  vel: Float32Array; life: Float32Array; maxLife: Float32Array; grow: Float32Array; grav: Float32Array; drag: Float32Array; a0: Float32Array;
  points: THREE.Points;
  private c = new THREE.Color();

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot }, scale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vA; varying vec3 vC; uniform float scale;
        void main() {
          vA = alpha; vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vA; varying vec3 vC;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vC, t.a * vA);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(o: EmitOpts) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const s = o.spread ?? 0;
    this.pos[i * 3] = o.pos.x + (Math.random() - 0.5) * s;
    this.pos[i * 3 + 1] = o.pos.y + (Math.random() - 0.5) * s * 0.5;
    this.pos[i * 3 + 2] = o.pos.z + (Math.random() - 0.5) * s;
    const v = o.vel ?? new THREE.Vector3();
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.c.set(o.color ?? 0xffffff);
    this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    this.size[i] = o.size ?? 0.3;
    this.grow[i] = o.grow ?? 0;
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.a0[i] = o.alpha ?? 1;
    this.alpha[i] = this.a0[i];
  }

  private kill(i: number) {
    const j = --this.count;
    if (i === j) return;
    const copy3 = (a: Float32Array) => { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; };
    copy3(this.pos); copy3(this.col); copy3(this.vel);
    for (const a of [this.size, this.alpha, this.life, this.maxLife, this.grow, this.grav, this.drag, this.a0]) a[i] = a[j];
  }

  update(dt: number) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this.kill(i); continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 6) * (1 - t);
    }
    this.geo.setDrawRange(0, this.count);
    for (const n of ['position', 'color', 'size', 'alpha']) (this.geo.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ day & night
interface SkyKey { top: number; horizon: number; sun: number; sunI: number; hemi: number; hemiSky: number; exposure: number }
const DAWN: SkyKey = { top: 0x86a9db, horizon: 0xf7bd95, sun: 0xffc9a0, sunI: 1.6, hemi: 0.85, hemiSky: 0xf2d6c8, exposure: 1.0 };
const DAY: SkyKey = { top: 0x5fa8ec, horizon: 0xcde8ff, sun: 0xfff1d8, sunI: 2.5, hemi: 1.1, hemiSky: 0xcfe8ff, exposure: 1.05 };
const DUSK: SkyKey = { top: 0x5868b0, horizon: 0xf59a63, sun: 0xff9b5c, sunI: 1.5, hemi: 0.75, hemiSky: 0xe8b8a8, exposure: 1.0 };
const NIGHT: SkyKey = { top: 0x0d1838, horizon: 0x2c3f73, sun: 0xa9bfff, sunI: 0.75, hemi: 0.55, hemiSky: 0x7f95cc, exposure: 1.1 };
// [time, key] — a day lasts DAY_LENGTH seconds of play
const KEYS: [number, SkyKey][] = [[0, DAWN], [0.06, DAY], [0.7, DAY], [0.78, DUSK], [0.84, NIGHT], [0.95, NIGHT], [1, DAWN]];
export const DAY_LENGTH = 600;

function lerpKey(t: number): SkyKey {
  let a = KEYS[0], b = KEYS[1];
  for (let k = 0; k < KEYS.length - 1; k++) if (t >= KEYS[k][0] && t <= KEYS[k + 1][0]) { a = KEYS[k]; b = KEYS[k + 1]; break; }
  const f = THREE.MathUtils.smoothstep((t - a[0]) / Math.max(1e-5, b[0] - a[0]), 0, 1);
  const c = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), f).getHex();
  const n = (x: number, y: number) => x + (y - x) * f;
  return {
    top: c(a[1].top, b[1].top), horizon: c(a[1].horizon, b[1].horizon), sun: c(a[1].sun, b[1].sun), sunI: n(a[1].sunI, b[1].sunI),
    hemi: n(a[1].hemi, b[1].hemi), hemiSky: c(a[1].hemiSky, b[1].hemiSky), exposure: n(a[1].exposure, b[1].exposure),
  };
}

// ------------------------------------------------------------------ the FX manager
export class FX {
  quality: Quality;
  composer: EffectComposer | null = null;
  private ao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  sky: THREE.Mesh;
  smoke = new ParticleSystem(1600, false);
  glow = new ParticleSystem(600, true);
  clouds: THREE.Group[] = [];
  birds: { group: THREE.Group; birds: THREE.Group[]; center: THREE.Vector2; r: number; a: number; speed: number; h: number }[] = [];
  fish: { mesh: THREE.Object3D; t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  fishT = 6;
  dayT = 0.12;
  sunDir = new THREE.Vector3();
  waterTiles: [number, number][] = [];
  lights: THREE.Vector3[] = []; // lantern spots that glow at night
  private skyMat: THREE.ShaderMaterial;
  private cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, flatShading: false });
  private lanternT = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
    quality: Quality,
  ) {
    this.quality = quality;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: U.night },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float night; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.6 * (1.0 - night);
          // stars at night
          vec3 q = floor(vDir * 180.0);
          float star = step(0.9965, hash(q)) * smoothstep(0.05, 0.3, h) * night;
          col += vec3(star);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), this.skyMat);
    this.sky.renderOrder = -10;
    scene.add(this.sky, this.smoke.points, this.glow.points);
    this.makeClouds();
    this.makeBirds();
    this.setQuality(quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    saveQuality(q);
    const r = this.renderer;
    r.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    r.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    for (const c of this.clouds) c.traverse((o) => (o.castShadow = q === 'high'));
    this.buildComposer();
  }

  private buildComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.ao = null;
    this.bloom = null;
    if (this.quality === 'low') return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const comp = new EffectComposer(this.renderer, rt);
    comp.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      comp.addPass(ao);
      this.ao = ao;
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.5, 0.88);
    comp.addPass(bloom);
    this.bloom = bloom;
    comp.addPass(new OutputPass());
    this.composer = comp;
  }

  resize(w: number, h: number) {
    this.composer?.setSize(w, h);
  }

  private makeClouds() {
    for (let k = 0; k < 11; k++) {
      const c = model(k % 3 === 0 ? 'cloud_small' : 'cloud_big');
      const s = 2.2 + Math.random() * 1.8;
      c.scale.setScalar(s);
      c.position.set((Math.random() - 0.5) * (MAP + 40), 24 + Math.random() * 6, (Math.random() - 0.5) * (MAP + 40));
      c.rotation.y = Math.random() * 6;
      c.traverse((o) => {
        o.receiveShadow = false;
        const me = o as THREE.Mesh;
        if (me.isMesh) me.material = this.cloudMat;
      });
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  private makeBirds() {
    const body = new THREE.MeshStandardMaterial({ color: 0x3b3b46, roughness: 0.8, side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.08), new THREE.Vector3(0.32, 0.02, 0), new THREE.Vector3(0, 0, 0.1)]);
    wingGeo.computeVertexNormals();
    for (let f = 0; f < 3; f++) {
      const group = new THREE.Group();
      const birds: THREE.Group[] = [];
      for (let b = 0; b < 5; b++) {
        const bird = new THREE.Group();
        const l = new THREE.Mesh(wingGeo, body), r = new THREE.Mesh(wingGeo, body);
        r.scale.x = -1;
        bird.add(l, r, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.25), body));
        bird.position.set((b % 2 ? 1 : -1) * Math.ceil(b / 2) * 0.5, Math.random() * 0.3, -Math.ceil(b / 2) * 0.45);
        bird.userData.l = l; bird.userData.r = r; bird.userData.ph = Math.random() * 6;
        group.add(bird);
        birds.push(bird);
      }
      this.scene.add(group);
      this.birds.push({ group, birds, center: new THREE.Vector2((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), r: 14 + Math.random() * 14, a: Math.random() * 6, speed: 0.08 + Math.random() * 0.05, h: 8 + Math.random() * 3 });
    }
  }

  // ------------------------------ effects helpers used by the game
  puff(pos: THREE.Vector3, color = 0xcbb79a, n = 14, size = 0.5) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      this.smoke.emit({ pos, spread: 0.6, vel: new THREE.Vector3(Math.cos(a) * sp, 0.5 + Math.random() * 0.8, Math.sin(a) * sp), color, size, grow: 0.8, life: 1.1 + Math.random() * 0.6, drag: 2, alpha: 0.75 });
    }
  }
  chips(pos: THREE.Vector3, color: number, n = 3) {
    if (this.quality === 'low') return;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({ pos, spread: 0.2, vel: new THREE.Vector3(Math.cos(a) * 1.2, 1.5 + Math.random(), Math.sin(a) * 1.2), color, size: 0.09, life: 0.7, gravity: 6, alpha: 1 });
    }
  }
  sparkle(pos: THREE.Vector3, n = 2) {
    for (let k = 0; k < n; k++)
      this.glow.emit({ pos, spread: 0.5, vel: new THREE.Vector3(0, 0.6 + Math.random() * 0.5, 0), color: 0xffd34d, size: 0.18, life: 0.9, alpha: 1 });
  }
  smokeFrom(pos: THREE.Vector3) {
    this.smoke.emit({ pos, spread: 0.08, vel: new THREE.Vector3(0.15 + Math.random() * 0.1, 0.55, 0.05), color: 0xd9d6d0, size: 0.22, grow: 0.45, life: 3.2, alpha: 0.55 });
  }
  splash(pos: THREE.Vector3) {
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({ pos, spread: 0.15, vel: new THREE.Vector3(Math.cos(a) * 0.9, 1.6 + Math.random(), Math.sin(a) * 0.9), color: 0xe8f6ff, size: 0.12, life: 0.7, gravity: 6, alpha: 0.9 });
    }
  }
  leaves(pos: THREE.Vector3) {
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({ pos, spread: 0.8, vel: new THREE.Vector3(Math.cos(a) * 1.2, 0.8 + Math.random(), Math.sin(a) * 1.2), color: Math.random() < 0.5 ? 0x3f9a4a : 0x5fb55a, size: 0.12, life: 1.4, gravity: 2.5, drag: 1.5, alpha: 1 });
    }
  }
  confetti(pos: THREE.Vector3) {
    const cols = [0xff5d5d, 0xffd34d, 0x5dc8ff, 0x7ee07e, 0xc87eff];
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
      this.glow.emit({ pos, spread: 0.4, vel: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 2, Math.sin(a) * sp), color: cols[k % cols.length], size: 0.16, life: 1.6, gravity: 5, drag: 0.8, alpha: 1 });
    }
  }

  isNight() {
    return U.night.value > 0.5;
  }

  update(dt: number, paused: boolean, target: THREE.Vector3, terrainHeight: (x: number, z: number) => number) {
    U.time.value += dt;
    if (!paused) this.dayT = (this.dayT + dt / DAY_LENGTH) % 1;
    const k = lerpKey(this.dayT);
    // sun travels across the sky during the day; the moon takes over at night
    const day = this.dayT < 0.8 || this.dayT > 0.97;
    const nightF = THREE.MathUtils.clamp((this.dayT - 0.78) / 0.06, 0, 1) * (1 - THREE.MathUtils.clamp((this.dayT - 0.95) / 0.05, 0, 1));
    U.night.value = nightF;
    const p = day ? ((this.dayT + 0.03) % 1) / 0.83 : 0.5;
    const az = -0.9 + p * 1.8, el = day ? 0.35 + Math.sin(Math.min(1, p) * Math.PI) * 0.75 : 0.95;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.6 + 0.4).normalize();
    this.sun.position.copy(target).addScaledVector(this.sunDir, 30);
    this.sun.target.position.copy(target);
    this.sun.color.setHex(k.sun);
    this.sun.intensity = k.sunI;
    this.sun.shadow.intensity = 0.85 - nightF * 0.4;
    this.hemi.intensity = k.hemi;
    this.hemi.color.setHex(k.hemiSky);
    this.renderer.toneMappingExposure = k.exposure;
    this.skyMat.uniforms.top.value.setHex(k.top);
    this.skyMat.uniforms.horizon.value.setHex(k.horizon);
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(k.horizon);
    this.sky.position.copy(this.camera.position);

    // clouds drift; they fade out when the camera flies up near them
    const camH = this.camera.position.y;
    this.cloudMat.opacity = THREE.MathUtils.clamp((22 - camH) / 8, 0, 0.92);
    for (const c of this.clouds) c.visible = this.cloudMat.opacity > 0.02 || this.quality === 'high';
    const lim = MAP / 2 + 25;
    for (const c of this.clouds) {
      c.position.x += dt * 0.6;
      if (c.position.x > lim) c.position.x = -lim;
    }
    // birds circle overhead
    for (const f of this.birds) {
      f.a += dt * f.speed;
      const x = f.center.x + Math.cos(f.a) * f.r, z = f.center.y + Math.sin(f.a) * f.r;
      f.group.position.set(x, f.h + Math.sin(f.a * 3) * 0.6, z);
      f.group.rotation.y = -f.a;
      for (const b of f.birds) {
        const flap = Math.sin(U.time.value * 9 + b.userData.ph) * 0.6;
        b.userData.l.rotation.z = flap;
        b.userData.r.rotation.z = -flap;
      }
      f.group.visible = nightF < 0.6;
    }
    // a fish jumps now and then
    if (!paused && this.waterTiles.length) {
      this.fishT -= dt;
      if (this.fishT <= 0 && !this.fish) {
        this.fishT = 7 + Math.random() * 10;
        const [i, j] = this.waterTiles[Math.floor(Math.random() * this.waterTiles.length)];
        const x = i - MAP / 2 + 0.5, z = j - MAP / 2 + 0.5, a = Math.random() * 6;
        const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 5).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.4, metalness: 0.2 }));
        this.scene.add(mesh);
        const from = new THREE.Vector3(x, -0.12, z), to = new THREE.Vector3(x + Math.cos(a) * 1.4, -0.12, z + Math.sin(a) * 1.4);
        this.fish = { mesh, t: 0, from, to };
        this.splash(from);
      }
    }
    if (this.fish) {
      const f = this.fish;
      f.t += dt / 1.1;
      const pos = f.from.clone().lerp(f.to, f.t);
      pos.y += Math.sin(f.t * Math.PI) * 1.1;
      f.mesh.position.copy(pos);
      f.mesh.lookAt(f.to.x, pos.y + Math.cos(f.t * Math.PI) * 0.8, f.to.z);
      f.mesh.rotateY(Math.PI / 2);
      if (f.t >= 1) {
        this.splash(f.to);
        this.scene.remove(f.mesh);
        this.fish = null;
      }
    }
    // lanterns glow at night
    this.lanternT -= dt;
    if (nightF > 0.15 && this.lanternT <= 0) {
      this.lanternT = 0.25;
      for (const l of this.lights) {
        if (Math.abs(l.x - target.x) > 30 || Math.abs(l.z - target.z) > 30) continue;
        this.glow.emit({ pos: l, color: 0xffb347, size: 0.42, life: 0.6, alpha: 0.45 * nightF });
      }
    }
    this.smoke.update(dt);
    this.glow.update(dt);
    const scale = (this.renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    (this.smoke.points.material as THREE.ShaderMaterial).uniforms.scale.value = scale;
    (this.glow.points.material as THREE.ShaderMaterial).uniforms.scale.value = scale;
    if (this.bloom) this.bloom.strength = 0.25 + nightF * 0.35;
    void terrainHeight;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
