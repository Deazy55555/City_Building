import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

/** Groups many static meshes into a few merged meshes by map area, so forests cost very few draw calls. */
export class ChunkMerger {
  private chunks = new Map<string, { members: Set<THREE.Mesh>; mesh: THREE.Mesh | null; dirty: boolean }>();
  constructor(private parent: THREE.Object3D, private size = 8) {}
  private key(x: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
  }
  add(m: THREE.Mesh) {
    const k = this.key(m.position.x, m.position.z);
    let c = this.chunks.get(k);
    if (!c) { c = { members: new Set(), mesh: null, dirty: true }; this.chunks.set(k, c); }
    c.members.add(m);
    c.dirty = true;
    m.userData.chunk = k;
  }
  remove(m: THREE.Mesh) {
    const c = this.chunks.get(m.userData.chunk);
    if (!c) return;
    c.members.delete(m);
    c.dirty = true;
    delete m.userData.chunk;
  }
  has(m: THREE.Mesh) {
    return m.userData.chunk !== undefined;
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
      const geos: THREE.BufferGeometry[] = [];
      for (const m of c.members) {
        m.updateMatrix();
        geos.push(m.geometry.clone().applyMatrix4(m.matrix));
      }
      const merged = mergeGeometries(geos, false)!;
      geos.forEach((g) => g.dispose());
      c.mesh = new THREE.Mesh(merged, bakedMat);
      c.mesh.castShadow = true;
      c.mesh.receiveShadow = true;
      this.parent.add(c.mesh);
    }
  }
}
