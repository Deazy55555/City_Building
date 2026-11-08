import * as THREE from 'three';

/**
 * Rounded, cartoony four-legged animals (deer and horses) built from simple shapes,
 * styled to match the chunky KayKit look, with a trotting/galloping/grazing animation.
 * The animal faces +X.
 */

const mats = new Map<string, THREE.MeshStandardMaterial>();
function m(color: number, rough = 0.75) {
  const k = `${color}-${rough}`;
  let mm = mats.get(k);
  if (!mm) {
    mm = new THREE.MeshStandardMaterial({ color, roughness: rough });
    mats.set(k, mm);
  }
  return mm;
}
const geos = new Map<string, THREE.BufferGeometry>();
function capsule(r: number, len: number) {
  const k = `c${r}-${len}`;
  let g = geos.get(k);
  if (!g) { g = new THREE.CapsuleGeometry(r, len, 6, 12); geos.set(k, g); }
  return g;
}
function sphere(r: number) {
  const k = `s${r}`;
  let g = geos.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, 14, 10); geos.set(k, g); }
  return g;
}
function cone(r: number, h: number) {
  const k = `k${r}-${h}`;
  let g = geos.get(k);
  if (!g) { g = new THREE.ConeGeometry(r, h, 10); geos.set(k, g); }
  return g;
}
function cyl(r1: number, r2: number, h: number) {
  const k = `y${r1}-${r2}-${h}`;
  let g = geos.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r1, r2, h, 10); geos.set(k, g); }
  return g;
}
function mesh(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(g, mat);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

export interface Leg { hip: THREE.Group; knee: THREE.Group; front: boolean; phase: number }
export interface Quad {
  root: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  ears: THREE.Object3D[];
  legs: Leg[];
  saddle: THREE.Group | null;
  kind: 'deer' | 'horse';
  t: number;
  earT: number;
  grazeW: number;
}

interface QuadOpts {
  kind: 'deer' | 'horse';
  coat: number;
  dark: number; // mane, tail, hooves
  light: number; // belly, muzzle
  antlers?: boolean;
  spots?: boolean;
  saddle?: number; // blanket color
}

export function makeQuad(o: QuadOpts): Quad {
  const horse = o.kind === 'horse';
  const coat = m(o.coat), light = m(o.light), dark = m(o.dark, 0.6);
  const root = new THREE.Group();
  const body = new THREE.Group();
  const bodyY = horse ? 0.62 : 0.5;
  body.position.y = bodyY;
  root.add(body);

  // body: one long rounded capsule plus chest and rump bumps
  const bodyLen = horse ? 0.5 : 0.36, bodyR = horse ? 0.2 : 0.16;
  const torso = mesh(capsule(bodyR, bodyLen), coat);
  torso.rotation.z = Math.PI / 2;
  torso.scale.set(1, 1, 0.85);
  body.add(torso);
  const belly = mesh(capsule(bodyR * 0.8, bodyLen * 0.8), light, 0, -bodyR * 0.35, 0);
  belly.rotation.z = Math.PI / 2;
  belly.scale.set(1, 1, 0.9);
  body.add(belly);
  if (o.spots) {
    const spot = m(0xf6efe0);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      body.add(mesh(sphere(0.025), spot, ((k % 5) - 2) * 0.08, bodyR * 0.75, Math.sin(a) * bodyR * 0.55));
    }
  }

  // neck and head
  const neck = new THREE.Group();
  neck.position.set(bodyLen * 0.55, bodyR * 0.45, 0);
  body.add(neck);
  const neckLen = horse ? 0.3 : 0.24;
  const neckMesh = mesh(capsule(horse ? 0.095 : 0.07, neckLen), coat, 0.05, neckLen * 0.45, 0);
  neckMesh.rotation.z = -0.45;
  neck.add(neckMesh);
  if (horse) {
    for (let k = 0; k < 7; k++) {
      const mane = mesh(capsule(0.03, 0.06), dark, -0.04 + k * 0.025, 0.06 + k * 0.05, 0);
      mane.rotation.z = -0.9;
      neck.add(mane);
    }
  }
  const head = new THREE.Group();
  head.position.set(0.14, neckLen + 0.05, 0);
  neck.add(head);
  const skull = mesh(sphere(horse ? 0.1 : 0.09), coat);
  skull.scale.set(1.15, 1, 0.95);
  head.add(skull);
  const snout = mesh(capsule(horse ? 0.07 : 0.055, horse ? 0.16 : 0.08), horse ? coat : light, horse ? 0.14 : 0.1, horse ? -0.06 : -0.03, 0);
  snout.rotation.z = Math.PI / 2 - (horse ? 0.55 : 0.35);
  head.add(snout);
  head.add(mesh(sphere(horse ? 0.045 : 0.03), m(0x1e1a18, 0.4), horse ? 0.22 : 0.17, horse ? -0.13 : -0.06, 0));
  // big friendly eyes
  for (const z of [-1, 1]) {
    head.add(mesh(sphere(horse ? 0.026 : 0.028), m(0x14110f, 0.2), 0.05, 0.03, z * (horse ? 0.085 : 0.075)));
    head.add(mesh(sphere(0.009), m(0xffffff, 0.2), 0.065, 0.045, z * (horse ? 0.105 : 0.095)));
  }
  const ears: THREE.Object3D[] = [];
  for (const z of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(-0.03, 0.08, z * 0.06);
    const e = mesh(cone(horse ? 0.03 : 0.04, horse ? 0.1 : 0.12), coat, 0, 0.05, 0);
    e.scale.set(1, 1, 0.55);
    ear.add(e);
    ear.rotation.x = z * (horse ? 0.25 : 0.7);
    head.add(ear);
    ears.push(ear);
  }
  if (horse) {
    // bridle
    const strap = m(0x4a2c18, 0.5);
    const b = mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), strap, 0.13, -0.07, 0);
    b.rotation.y = Math.PI / 2;
    b.rotation.x = 0.5;
    head.add(b);
  }
  if (o.antlers) {
    const ant = m(0xe2cfa6, 0.6);
    for (const z of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(-0.02, 0.08, z * 0.045);
      const beam = mesh(cyl(0.012, 0.018, 0.2), ant, 0, 0.1, 0);
      beam.rotation.z = 0.25;
      a.add(beam);
      for (let k = 0; k < 3; k++) {
        const tine = mesh(cyl(0.008, 0.012, 0.08), ant, -0.01 - k * 0.02, 0.08 + k * 0.05, z * 0.02);
        tine.rotation.set(z * 0.6, 0, -0.5);
        a.add(tine);
      }
      a.rotation.x = z * 0.45;
      head.add(a);
    }
  }

  // tail
  const tail = new THREE.Group();
  tail.position.set(-bodyLen * 0.62, bodyR * 0.45, 0);
  body.add(tail);
  if (horse) {
    for (let k = 0; k < 4; k++) {
      const t = mesh(capsule(0.04 - k * 0.006, 0.08), dark, -0.04 - k * 0.04, -0.03 - k * 0.07, 0);
      t.rotation.z = 0.5 + k * 0.15;
      tail.add(t);
    }
  } else {
    tail.add(mesh(sphere(0.055), light, -0.03, 0.01, 0));
    tail.add(mesh(sphere(0.045), coat, -0.015, 0.035, 0));
  }

  // legs: hip → upper leg → knee → lower leg → hoof
  const legs: Leg[] = [];
  const upper = horse ? 0.24 : 0.2, lower = horse ? 0.24 : 0.2, lr = horse ? 0.055 : 0.04;
  for (const front of [true, false])
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(front ? bodyLen * 0.5 : -bodyLen * 0.5, -bodyR * 0.45, side * bodyR * 0.55);
      body.add(hip);
      hip.add(mesh(capsule(lr * (front ? 1 : 1.25), upper * 0.6), coat, 0, -upper * 0.45, 0));
      const knee = new THREE.Group();
      knee.position.y = -upper;
      hip.add(knee);
      knee.add(mesh(capsule(lr * 0.75, lower * 0.65), horse ? coat : m(new THREE.Color(o.coat).multiplyScalar(0.8).getHex()), 0, -lower * 0.45, 0));
      knee.add(mesh(cyl(lr * 0.9, lr * 1.05, 0.05), dark, 0, -lower - 0.005, 0));
      // the phase pattern makes a trot: diagonal legs move together
      legs.push({ hip, knee, front, phase: (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0) });
    }

  let saddle: THREE.Group | null = null;
  if (o.saddle !== undefined) {
    saddle = new THREE.Group();
    const blanket = mesh(new THREE.BoxGeometry(0.34, 0.03, 0.44), m(o.saddle, 0.8), 0, bodyR * 0.95, 0);
    saddle.add(blanket);
    for (const z of [-1, 1]) saddle.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.02), m(o.saddle, 0.8), 0, bodyR * 0.85 - 0.08, z * 0.215));
    const seat = mesh(capsule(0.08, 0.14), m(0x6b3e22, 0.5), 0, bodyR * 1.0 + 0.04, 0);
    seat.rotation.z = Math.PI / 2;
    seat.scale.set(1, 0.6, 1.2);
    saddle.add(seat);
    body.add(saddle);
  }
  return { root, body, neck, head, tail, ears, legs, saddle, kind: o.kind, t: Math.random() * 10, earT: Math.random() * 3, grazeW: 0 };
}

export function makeDeer(rnd: () => number = Math.random) {
  const fawn = rnd() < 0.2;
  const coats = [0xb0743f, 0xa0673a, 0xbd8452, 0x9b6234];
  const q = makeQuad({ kind: 'deer', coat: coats[Math.floor(rnd() * coats.length)], dark: 0x3b2a1e, light: 0xf2e6cf, antlers: !fawn && rnd() < 0.45, spots: fawn });
  q.root.scale.setScalar(fawn ? 0.75 : 1.05);
  return q;
}

export function makeHorse(rnd: () => number = Math.random, blanket = 0x2f6fd6) {
  const coats: [number, number][] = [[0x7b4a2a, 0x2b1d14], [0x2f2725, 0x141010], [0xe6dfd3, 0x8f8578], [0x9a5530, 0x4a2a16], [0x6e6a66, 0x2b2826]];
  const [coat, dark] = coats[Math.floor(rnd() * coats.length)];
  return makeQuad({ kind: 'horse', coat, dark, light: coat === 0xe6dfd3 ? 0xf5f1ea : new THREE.Color(coat).lerp(new THREE.Color(0xffffff), 0.25).getHex(), saddle: blanket });
}

/** speed: 0 standing, ~1 walking, ~2 trotting, ~3 galloping. graze: lowers the head to eat grass */
export function animateQuad(q: Quad, speed: number, graze: boolean, dt: number) {
  q.t += dt;
  const moving = speed > 0.05;
  const freq = moving ? 4 + speed * 2.6 : 0;
  const amp = moving ? Math.min(0.75, 0.35 + speed * 0.14) : 0;
  const ph = q.t * freq;
  for (const l of q.legs) {
    const p = ph + l.phase;
    l.hip.rotation.z = Math.sin(p) * amp * (l.front ? 1 : 0.9);
    // the knee bends while the leg swings forward
    l.knee.rotation.z = moving ? (l.front ? -1 : 1) * Math.max(0, Math.cos(p)) * amp * 1.3 : 0;
  }
  q.body.position.y = (q.kind === 'horse' ? 0.62 : 0.5) + (moving ? Math.abs(Math.sin(ph)) * 0.025 * Math.min(speed, 2) : Math.sin(q.t * 1.6) * 0.004);
  q.body.rotation.z = moving ? Math.sin(ph * 2) * 0.03 * Math.min(speed, 2) : 0;
  q.grazeW += ((graze && !moving ? 1 : 0) - q.grazeW) * Math.min(1, dt * 2.5);
  q.neck.rotation.z = -1.25 * q.grazeW + (moving ? Math.sin(ph * 2) * 0.06 : Math.sin(q.t * 1.3) * 0.03);
  q.head.rotation.z = 0.5 * q.grazeW + (moving ? -Math.sin(ph * 2) * 0.05 : 0);
  // munching while grazing
  if (q.grazeW > 0.8) q.head.rotation.z += Math.sin(q.t * 9) * 0.05;
  q.tail.rotation.z = (q.kind === 'horse' ? 0.2 : 0.4) + Math.sin(q.t * (moving ? 10 : 3)) * (moving ? 0.25 : 0.12);
  q.tail.rotation.x = Math.sin(q.t * 2.3) * 0.15;
  // ears twitch now and then
  q.earT -= dt;
  const twitch = q.earT < 0.25 ? Math.sin((0.25 - q.earT) * 25) * 0.4 : 0;
  if (q.earT < 0) q.earT = 2 + Math.random() * 4;
  q.ears.forEach((e, k) => (e.rotation.y = k === 0 ? twitch : 0));
}
