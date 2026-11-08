import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flatGeometry } from './assets';

export const bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });

/** Merge a static model made of many meshes into one mesh (one draw call) using vertex colors. */
export function bake(group: THREE.Object3D): THREE.Mesh {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || !me.visible) return;
    let g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld);
    g.applyMatrix4(mtx);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const col = ((me.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff)).clone();
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  });
  const merged = mergeGeometries(geos, false)!;
  const out = new THREE.Mesh(merged, bakedMat);
  out.castShadow = true;
  out.receiveShadow = true;
  out.position.copy(group.position);
  out.rotation.copy(group.rotation);
  out.scale.copy(group.scale);
  return out;
}

/**
 * Groups many static textured models (trees) into a few merged meshes by map area,
 * so a whole forest costs only a handful of draw calls. Trees sway in the wind.
 */
export class ChunkMerger {
  private chunks = new Map<string, { members: Set<THREE.Object3D>; mesh: THREE.Mesh | null; dirty: boolean }>();
  constructor(private parent: THREE.Object3D, private material: THREE.Material, private size = 8) {}
  private key(x: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
  }
  add(o: THREE.Object3D) {
    const k = this.key(o.position.x, o.position.z);
    let c = this.chunks.get(k);
    if (!c) { c = { members: new Set(), mesh: null, dirty: true }; this.chunks.set(k, c); }
    if (!o.userData.geo) {
      const g = flatGeometry(o);
      // sway: 0 at the trunk base, 1 at the top of the tree
      const pos = g.getAttribute('position');
      const sway = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) sway[i] = Math.max(0, Math.min(1, pos.getY(i) / 1.2));
      g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
      o.updateMatrix();
      g.applyMatrix4(o.matrix);
      o.userData.geo = g;
    }
    c.members.add(o);
    c.dirty = true;
    o.userData.chunk = k;
  }
  remove(o: THREE.Object3D) {
    const c = this.chunks.get(o.userData.chunk);
    if (!c) return;
    c.members.delete(o);
    c.dirty = true;
    delete o.userData.chunk;
  }
  has(o: THREE.Object3D) {
    return o.userData.chunk !== undefined;
  }
  clear() {
    for (const c of this.chunks.values()) if (c.mesh) { this.parent.remove(c.mesh); c.mesh.geometry.dispose(); }
    this.chunks.clear();
  }
  flush() {
    for (const c of this.chunks.values()) {
      if (!c.dirty) continue;
      c.dirty = false;
      if (c.mesh) { this.parent.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
      if (!c.members.size) continue;
      const merged = mergeGeometries([...c.members].map((m) => m.userData.geo as THREE.BufferGeometry), false)!;
      c.mesh = new THREE.Mesh(merged, this.material);
      c.mesh.castShadow = true;
      c.mesh.receiveShadow = true;
      this.parent.add(c.mesh);
    }
  }
}

/** Material for trees: the shared atlas plus a gentle wind sway */
export function windMaterial(base: THREE.MeshStandardMaterial, time: { value: number }) {
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.time = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float time; attribute float sway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = position.x * 0.35 + position.z * 0.27;
        float s = sway * sway;
        transformed.x += (sin(time * 1.3 + ph) * 0.06 + sin(time * 2.7 + ph * 2.0) * 0.02) * s;
        transformed.z += cos(time * 1.1 + ph) * 0.04 * s;`);
  };
  return m;
}
