import * as THREE from 'three';
import { MAP } from './world';
import { clamp } from './util';

/** Angled strategy-game camera: WASD/arrows or right-drag to pan, wheel to zoom, Q/E to turn. */
export class RTSCamera {
  cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 0, 0);
  dist = 22;
  wantDist = 22;
  yaw = Math.PI / 4;
  wantYaw = Math.PI / 4;
  keys = new Set<string>();
  minDist = 6;
  maxDist = 58;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(42, aspect, 0.1, 400);
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'q') this.wantYaw += Math.PI / 4;
      if (e.key.toLowerCase() === 'e') this.wantYaw -= Math.PI / 4;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  zoom(deltaY: number) {
    this.wantDist = clamp(this.wantDist * (1 + deltaY * 0.0012), this.minDist, this.maxDist);
  }

  /** Move the target by a screen-space amount (pixels) */
  panPixels(dx: number, dy: number) {
    const k = this.dist * 0.0022;
    this.panLocal(-dx * k, dy * k);
  }

  panLocal(right: number, forward: number) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.target.x += rx * right + fx * forward;
    this.target.z += rz * right + fz * forward;
    const lim = MAP / 2 - 2;
    this.target.x = clamp(this.target.x, -lim, lim);
    this.target.z = clamp(this.target.z, -lim, lim);
  }

  focus(x: number, z: number) {
    this.target.set(x, 0, z);
  }

  update(dt: number) {
    const speed = this.dist * 1.1 * dt;
    let f = 0, r = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) f += speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) f -= speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) r += speed;
    if (this.keys.has('a') || this.keys.has('arrowleft')) r -= speed;
    if (f || r) this.panLocal(r, f);
    this.dist += (this.wantDist - this.dist) * Math.min(1, dt * 10);
    this.yaw += (this.wantYaw - this.yaw) * Math.min(1, dt * 8);
    // tilt: steeper when zoomed out, flatter when zoomed in for a closer look
    const t = (this.dist - this.minDist) / (this.maxDist - this.minDist);
    const pitch = THREE.MathUtils.lerp(0.62, 1.0, t);
    const h = Math.sin(pitch) * this.dist;
    const back = Math.cos(pitch) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * back, this.target.y + h, this.target.z + Math.cos(this.yaw) * back);
    this.cam.lookAt(this.target.x, this.target.y + 0.3, this.target.z);
  }
}
