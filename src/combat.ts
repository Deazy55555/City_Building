import * as THREE from 'three';
import { BUILDINGS, SAM_MAX_LEVEL, SCOUT_COST, SCOUT_TIME, SOLDIER_COST, SOLDIER_TIME, samUpgradeCost, type Res } from './data';
import { CHAR_SCALE, makeCharacter, model, playAnim, type Character } from './assets';
import { MAP, tileToWorld, worldToTile } from './world';
import type { Building, Game, Villager } from './game';

export type UnitKind = 'soldier' | 'scout' | 'raider' | 'sam';
export interface Unit {
  id: number;
  kind: UnitKind;
  pos: THREE.Vector3;
  mesh: THREE.Group;
  ch: Character;
  ring: THREE.Mesh;
  path: THREE.Vector3[];
  offset: THREE.Vector2;
  hp: number;
  maxHp: number;
  selected: boolean;
  order: 'idle' | 'move' | 'attack' | 'explore' | 'home';
  target: { k: 'unit'; id: number } | { k: 'villager'; id: number } | { k: 'building'; id: number } | null;
  home: THREE.Vector3 | null;
  atkT: number;
  scanT: number;
  repathT: number;
  dying: number;
  anim: string;
  cheer: number;
  blockT: number;
}

const STATS: Record<UnitKind, { hp: number; speed: number; dmg: number; every: number; sight: number }> = {
  soldier: { hp: 70, speed: 2.4, dmg: 10, every: 1.0, sight: 5 },
  scout: { hp: 35, speed: 3.0, dmg: 0, every: 1, sight: 6 },
  raider: { hp: 40, speed: 2.0, dmg: 6, every: 1.3, sight: 0 },
  sam: { hp: 9999, speed: 3.2, dmg: 40, every: 1.0, sight: 6 },
};

const FIRST_RAID = 480; // seconds of play before the first raid
const RAID_GAP = 420;
const WARNING = 45;

export class Combat {
  units = new Map<number, Unit>();
  raidT = FIRST_RAID;
  wave = 0;
  raidActive = false;
  raidTime = 0;
  warned = false;
  samLevel = 1;
  sam: Unit | null = null;
  bell = false;
  arrows: { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; target: number }[] = [];
  towerT = new Map<number, number>();
  private bars = new Map<string, THREE.Group>();
  private barGeo = new THREE.PlaneGeometry(1, 1);
  private barBg = new THREE.MeshBasicMaterial({ color: 0x1b1b1b, depthTest: false, transparent: true, opacity: 0.75 });
  private barGood = new THREE.MeshBasicMaterial({ color: 0x5fd35f, depthTest: false, transparent: true });
  private barBad = new THREE.MeshBasicMaterial({ color: 0xe0483e, depthTest: false, transparent: true });
  private barMid = new THREE.MeshBasicMaterial({ color: 0xf2c230, depthTest: false, transparent: true });
  private revealT = 0;

  constructor(private g: Game) {}

  reset() {
    for (const u of this.units.values()) this.g.root.remove(u.mesh, u.ring);
    this.units.clear();
    for (const a of this.arrows) this.g.root.remove(a.mesh);
    this.arrows = [];
    for (const b of this.bars.values()) this.g.scene.remove(b);
    this.bars.clear();
    this.raidT = FIRST_RAID; this.wave = 0; this.raidActive = false; this.raidTime = 0; this.warned = false;
    this.samLevel = 1; this.sam = null; this.bell = false;
  }

  // ------------------------------------------------------------ units
  spawn(kind: UnitKind, x: number, z: number, id?: number): Unit {
    const charKind = kind === 'raider' ? 'barbarian' : kind === 'scout' ? 'rogue_hooded' : 'knight';
    const ch = makeCharacter(charKind, kind === 'scout' ? 3 : 0);
    const st = STATS[kind];
    if (kind === 'soldier' || kind === 'sam') {
      const sword = model('sword_1handed');
      ch.handR.add(sword);
      const shield = model(kind === 'sam' ? 'shield_badge_color' : 'shield_round_color');
      ch.handL.add(shield);
      ch.root.userData.sword = sword;
      ch.root.userData.shield = shield;
    } else if (kind === 'raider') {
      ch.handR.add(model('axe_1handed'));
    } else if (kind === 'scout') {
      const flag = model('flag');
      flag.scale.setScalar(2.4);
      flag.position.set(0, -0.2, -0.45);
      ch.back.add(flag);
    }
    if (kind === 'sam') this.dressSam(ch);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.32, 20), new THREE.MeshBasicMaterial({ color: kind === 'raider' ? 0xff5555 : 0x66ccff, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.g.root.add(ch.root, ring);
    const pos = new THREE.Vector3(x, this.g.terrain.heightAt(x, z), z);
    ch.root.position.copy(pos);
    const hp = kind === 'raider' ? st.hp + this.wave * 6 : st.hp;
    const u: Unit = {
      id: id ?? this.g.nextId++, kind, pos, mesh: ch.root, ch, ring, path: [], offset: new THREE.Vector2((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5),
      hp, maxHp: hp, selected: false, order: kind === 'scout' ? 'explore' : 'idle', target: null, home: kind === 'soldier' ? pos.clone() : null,
      atkT: Math.random(), scanT: Math.random() * 0.4, repathT: 0, dying: 0, anim: '', cheer: 0, blockT: 0,
    };
    this.units.set(u.id, u);
    return u;
  }

  private dressSam(ch: Character) {
    const L = this.samLevel;
    const inner = ch.root.children[0];
    inner.scale.setScalar(CHAR_SCALE * (1.3 + Math.min(L, 5) * 0.05));
    if (L >= 4) {
      inner.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh) {
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          mat.color = new THREE.Color(0xffe39a);
          mat.metalness = 0.35;
          m.material = mat;
        }
      });
    }
    const sword = ch.root.userData.sword as THREE.Object3D | undefined;
    if (sword && L >= 3) {
      sword.scale.setScalar(1.25);
      if (L >= 5)
        sword.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            mat.emissive = new THREE.Color(0x66ccff);
            mat.emissiveIntensity = 1.2;
            m.material = mat;
          }
        });
    }
    const shield = ch.root.userData.shield as THREE.Object3D | undefined;
    if (shield) shield.visible = L >= 2;
  }

  alive(kind?: UnitKind) {
    return [...this.units.values()].filter((u) => !u.dying && (!kind || u.kind === kind));
  }

  raiders() {
    return this.alive('raider');
  }

  private removeUnit(u: Unit) {
    this.g.root.remove(u.mesh, u.ring);
    this.units.delete(u.id);
    const bar = this.bars.get('u' + u.id);
    if (bar) { this.g.scene.remove(bar); this.bars.delete('u' + u.id); }
    if (this.sam === u) this.sam = null;
  }

  // ------------------------------------------------------------ training
  async trainSoldier(b: Building) {
    const g = this.g;
    if (g.popUsed() >= g.popCap()) { g.ui.toast('Your town is full! Build a House to make room.', true); return; }
    if (b.queue.length >= 5) { g.ui.toast('The Barracks is busy. Wait for a soldier to finish.', true); return; }
    const ok = await g.tryWithQuestion('math', 'Train a soldier', SOLDIER_COST);
    if (ok) b.queue.push({ job: null, t: 0, kind: 'soldier' });
    g.ui.refreshSelection();
  }

  async trainScout(tc: Building) {
    const g = this.g;
    if (g.popUsed() >= g.popCap()) { g.ui.toast('Your town is full! Build a House to make room.', true); return; }
    if (tc.queue.length >= 5) { g.ui.toast('The Town Center is busy. Wait a little.', true); return; }
    const ok = await g.tryWithQuestion('reading', 'Train a scout', SCOUT_COST);
    if (ok) tc.queue.push({ job: null, t: 0, kind: 'scout' });
    g.ui.refreshSelection();
  }

  queueTime(kind: string | undefined) {
    return kind === 'soldier' ? SOLDIER_TIME : kind === 'scout' ? SCOUT_TIME : 0;
  }

  async upgradeSam() {
    const g = this.g;
    if (this.samLevel >= SAM_MAX_LEVEL) return;
    const ok = await g.tryWithQuestion('mixed', `⭐ Boss question: make General Sam stronger (level ${this.samLevel + 1})`, samUpgradeCost(this.samLevel), 3);
    if (ok) {
      this.samLevel++;
      g.markGoal('sam');
      g.ui.toast(`🛡️ General Sam is now level ${this.samLevel}! He is stronger and faster.`, true);
      if (this.sam) this.dressSam(this.sam.ch);
      const tc = g.townCenter();
      if (tc) g.fx.confetti(tc.mesh.position.clone().setY(tc.mesh.position.y + 3));
    }
    g.ui.refreshSelection();
  }

  // ------------------------------------------------------------ damage
  damageUnit(u: Unit, dmg: number) {
    if (u.dying) return;
    if (u.kind === 'sam') {
      // Sam can't be hurt; he blocks
      if (u.blockT <= 0) u.blockT = 0.6;
      return;
    }
    u.hp -= dmg;
    this.g.fx.chips(u.pos.clone().setY(u.pos.y + 0.6), u.kind === 'raider' ? 0xff8a5c : 0xffd0a0, 3);
    if (u.hp <= 0) {
      u.hp = 0;
      u.dying = 2.6;
      u.selected = false;
      u.path = [];
      playAnim(u.ch, 'Death_A', 0.1);
      if (u.kind !== 'raider') this.g.ui.toast(u.kind === 'soldier' ? '🛡️ A soldier was knocked out.' : '🧭 A scout was knocked out.');
    }
  }

  damageVillager(v: Villager, dmg: number) {
    if (v.dying || v.hidden) return;
    v.hp -= dmg;
    this.g.fx.chips(v.pos.clone().setY(v.pos.y + 0.6), 0xffd0a0, 3);
    if (v.hp <= 0) this.g.villagerDown(v);
    else if (v.task.k !== 'hide' && !this.bell) {
      // run home to the Town Center when hurt
      this.g.hideVillager(v);
    }
  }

  damageBuilding(b: Building, dmg: number) {
    const def = BUILDINGS[b.type];
    if (b.broken) return;
    b.hp -= dmg;
    if (Math.random() < 0.4) this.g.fx.puff(b.mesh.position.clone().setY(b.mesh.position.y + 0.8), 0x8f8577, 3, 0.35);
    if (b.type === 'towncenter') {
      b.hp = Math.max(1, b.hp); // the Town Center never breaks
      if (b.hp <= def.hp * 0.3 && !this.sam) this.callSam();
      return;
    }
    if (b.hp <= 0) {
      b.hp = 0;
      if (!b.built) {
        // knocked down before it was finished
        b.progress = Math.max(0, b.progress - 0.3);
        b.hp = 1;
        return;
      }
      this.g.breakBuilding(b);
    }
  }

  // ------------------------------------------------------------ raids
  private startRaid() {
    const g = this.g;
    this.wave++;
    this.raidActive = true;
    this.raidTime = 0;
    const n = Math.min(14, 1 + Math.ceil(this.wave * 1.2));
    const a = Math.random() * Math.PI * 2;
    let sx = Math.cos(a) * (MAP / 2 - 3), sz = Math.sin(a) * (MAP / 2 - 3);
    const t = g.grid.nearestWalkable(worldToTile(sx), worldToTile(sz));
    if (t) { sx = tileToWorld(t[0]); sz = tileToWorld(t[1]); }
    for (let k = 0; k < n; k++) {
      const off = g.grid.nearestWalkable(worldToTile(sx + (Math.random() - 0.5) * 3), worldToTile(sz + (Math.random() - 0.5) * 3)) ?? t!;
      this.spawn('raider', tileToWorld(off[0]), tileToWorld(off[1]));
    }
    g.ui.toast(`⚔️ ${n} raiders are attacking! Your soldiers and towers will fight. General Sam will help if things get bad.`, true);
  }

  private endRaid() {
    const g = this.g;
    this.raidActive = false;
    this.warned = false;
    this.raidT = RAID_GAP + Math.random() * 120;
    const loot = 20 + this.wave * 10;
    g.give({ gold: loot });
    g.stats.raidsDefended = (g.stats.raidsDefended ?? 0) + 1;
    g.markGoal('defend');
    g.ui.toast(`🎉 You defended your town! The raiders dropped ${loot} 🪙 gold.`, true);
    if (this.bell) this.ringBell(false);
    for (const u of this.alive('soldier')) u.cheer = 2;
    if (this.sam) { this.sam.cheer = 2.2; this.sam.order = 'home'; }
  }

  /** seconds until raiders come, or 0 during a raid */
  timeToRaid() {
    return this.raidActive ? 0 : Math.max(0, this.raidT);
  }

  warning() {
    return !this.raidActive && this.raidT <= WARNING;
  }

  raidCenter() {
    const rs = this.raiders();
    if (!rs.length) return null;
    const c = new THREE.Vector3();
    for (const r of rs) c.add(r.pos);
    return c.divideScalar(rs.length);
  }

  ringBell(on: boolean) {
    this.bell = on;
    const g = this.g;
    if (on) {
      for (const v of g.villagers.values()) g.hideVillager(v);
      g.ui.toast('🔔 Ding ding! Villagers are hiding in the Town Center.', true);
    } else {
      g.unhideAll();
      g.ui.toast('🔔 All clear! Villagers are going back to work.');
    }
  }

  private callSam() {
    const g = this.g;
    const tc = g.townCenter();
    if (!tc || this.sam || !this.raiders().length) return;
    const ring = g.grid.ringAround(tc.i, tc.j, tc.size, tc.i + 1, tc.j + 4);
    const spot = ring[0] ?? [tc.i + 1, tc.j + 3];
    this.sam = this.spawn('sam', tileToWorld(spot[0]), tileToWorld(spot[1]));
    this.sam.order = 'attack';
    this.sam.cheer = 1.2;
    g.fx.puff(this.sam.pos.clone(), 0xffe9a8, 20, 0.5);
    g.fx.confetti(this.sam.pos.clone().setY(this.sam.pos.y + 1));
    g.ui.toast('🛡️ General Sam is here to save the town!', true);
  }

  // ------------------------------------------------------------ main update
  update(dt: number) {
    const g = this.g;
    // raid timer
    if (!this.raidActive) {
      this.raidT -= dt;
      if (this.raidT <= WARNING && !this.warned) {
        this.warned = true;
        g.ui.toast('📯 Raiders are coming soon! Get your soldiers ready, or ring the bell to hide your villagers.', true);
      }
      if (this.raidT <= 0) this.startRaid();
    } else {
      this.raidTime += dt;
      if (this.raidTime > 100 && !this.sam) this.callSam();
      if (!this.raiders().length) this.endRaid();
    }

    for (const u of [...this.units.values()]) this.updateUnit(u, dt);
    this.updateTowers(dt);
    this.updateArrows(dt);

    // units explore as they move
    this.revealT -= dt;
    if (this.revealT <= 0) {
      this.revealT = 0.25;
      for (const u of this.units.values()) if (u.kind !== 'raider' && !u.dying) g.fog.reveal(u.pos.x, u.pos.z, STATS[u.kind].sight);
    }
  }

  private nearestRaider(p: THREE.Vector3, maxD: number) {
    let best: Unit | null = null, bd = maxD;
    for (const r of this.units.values()) {
      if (r.kind !== 'raider' || r.dying) continue;
      const d = r.pos.distanceTo(p);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  private moveToward(u: Unit, x: number, z: number) {
    if (u.repathT <= 0 || !u.path.length) {
      u.repathT = 0.7;
      this.g.pathTo(u, worldToTile(x), worldToTile(z));
    }
  }

  private updateUnit(u: Unit, dt: number) {
    const g = this.g;
    u.repathT -= dt;
    u.atkT -= dt;
    u.blockT -= dt;
    if (u.dying) {
      u.dying -= dt;
      if (u.dying < 0.8) u.pos.y -= dt * 0.5;
      if (u.dying <= 0) this.removeUnit(u);
      return;
    }
    if (u.cheer > 0) {
      u.cheer -= dt;
      u.anim = 'Cheer';
      return;
    }
    const st = STATS[u.kind];
    const speed = st.speed * (u.kind === 'sam' ? 1 + this.samLevel * 0.06 : 1);
    const moving = g.stepPath(u, dt, speed);
    let anim = moving ? (u.kind === 'raider' || u.order === 'attack' || u.kind === 'sam' ? 'Running_A' : 'Walking_A') : 'Idle';

    if (u.kind === 'scout') {
      if (u.order === 'explore' && !moving) {
        const t = g.fog.nearestUnexplored(worldToTile(u.pos.x), worldToTile(u.pos.z), (i, j) => g.grid.walkable(i, j));
        if (t) g.pathTo(u, t[0], t[1]);
        else { u.order = 'idle'; g.ui.toast('🧭 Your scout has explored everywhere it can reach!'); }
      } else if (u.order === 'move' && !moving) u.order = 'idle';
    } else if (u.kind === 'soldier' || u.kind === 'sam') {
      if (u.order === 'move') {
        if (!moving) { u.order = 'idle'; u.home = u.pos.clone(); }
      } else if (u.order === 'home' && u.kind === 'sam') {
        const tc = g.townCenter();
        if (!tc) { this.removeUnit(u); return; }
        if (g.rectDist(u.pos, tc.i, tc.j, tc.size) < 0.9) {
          g.fx.puff(u.pos.clone(), 0xffe9a8, 10, 0.4);
          this.removeUnit(u);
          g.ui.toast('🛡️ General Sam went back inside the Town Center. He will come out again if you need him.');
          return;
        }
        if (!moving) g.pathToRect(u, tc.i, tc.j, tc.size);
      } else {
        // look for raiders
        u.scanT -= dt;
        let target = u.target?.k === 'unit' ? this.units.get(u.target.id) : undefined;
        if (target && target.dying) target = undefined;
        if (!target && u.scanT <= 0) {
          u.scanT = 0.4;
          const range = u.kind === 'sam' ? 60 : 7;
          const r = this.nearestRaider(u.pos, range) ?? (u.home && u.kind === 'soldier' ? this.nearestRaider(u.home, 9) : null);
          if (r) { u.target = { k: 'unit', id: r.id }; u.order = 'attack'; target = r; }
        }
        if (target) {
          const d = target.pos.distanceTo(u.pos);
          if (d <= 0.95) {
            u.path = [];
            this.face(u, target.pos);
            anim = u.kind === 'sam' && this.samLevel >= 3 && (u.atkT % 2 < 1) ? '2H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Diagonal';
            if (u.atkT <= 0) {
              const every = u.kind === 'sam' ? Math.max(0.45, 1.1 - 0.15 * (this.samLevel - 1)) : st.every;
              u.atkT = every;
              const dmg = u.kind === 'sam' ? 25 + 15 * this.samLevel : st.dmg;
              this.damageUnit(target, dmg);
              if (u.kind === 'sam' && this.samLevel >= 5) g.fx.sparkle(target.pos.clone().setY(target.pos.y + 0.6), 6);
            }
          } else {
            this.moveToward(u, target.pos.x, target.pos.z);
            anim = 'Running_A';
          }
        } else {
          u.target = null;
          if (u.kind === 'sam') {
            if (!this.raiders().length) u.order = 'home';
          } else {
            u.order = 'idle';
            if (u.home && u.home.distanceTo(u.pos) > 1.5 && !moving) g.pathTo(u, worldToTile(u.home.x), worldToTile(u.home.z));
          }
        }
      }
      if (u.kind === 'sam' && u.blockT > 0 && anim === 'Idle') anim = 'Block';
    } else {
      anim = this.updateRaider(u, dt, moving, anim);
    }
    u.anim = anim;
  }

  private face(u: Unit, p: THREE.Vector3) {
    u.mesh.rotation.y = Math.atan2(p.x - u.pos.x, p.z - u.pos.z);
  }

  private updateRaider(u: Unit, dt: number, moving: boolean, anim: string) {
    const g = this.g;
    u.scanT -= dt;
    // pick something to attack: defenders and villagers nearby, then buildings, then the Town Center
    if (u.scanT <= 0 || !u.target) {
      u.scanT = 0.5;
      let best: Unit['target'] = null, bd = 4.5;
      for (const o of this.units.values()) {
        if (o.kind === 'raider' || o.dying) continue;
        const d = o.pos.distanceTo(u.pos);
        if (d < bd) { bd = d; best = { k: 'unit', id: o.id }; }
      }
      for (const v of g.villagers.values()) {
        if (v.dying || v.hidden) continue;
        const d = v.pos.distanceTo(u.pos) + 0.5;
        if (d < bd) { bd = d; best = { k: 'villager', id: v.id }; }
      }
      if (!best) {
        let bb = 3.5;
        for (const b of g.buildings.values()) {
          if (b.broken) continue;
          const d = g.rectDist(u.pos, b.i, b.j, b.size);
          if (d < bb) { bb = d; best = { k: 'building', id: b.id }; }
        }
      }
      if (!best) {
        const tc = g.townCenter();
        if (tc) best = { k: 'building', id: tc.id };
      }
      if (JSON.stringify(best) !== JSON.stringify(u.target)) u.path = [];
      u.target = best;
    }
    const t = u.target;
    if (!t) return anim;
    const dmg = STATS.raider.dmg + this.wave;
    if (t.k === 'building') {
      const b = g.buildings.get(t.id);
      if (!b || b.broken) { u.target = null; return anim; }
      if (g.rectDist(u.pos, b.i, b.j, b.size) < 0.85) {
        u.path = [];
        this.face(u, b.mesh.position);
        if (u.atkT <= 0) { u.atkT = STATS.raider.every; this.damageBuilding(b, 14 + this.wave * 3); }
        return '1H_Melee_Attack_Chop';
      }
      if (!moving && u.repathT <= 0) { u.repathT = 1; if (!g.pathToRect(u, b.i, b.j, b.size)) u.target = null; }
      return moving ? 'Running_A' : anim;
    }
    const tp = t.k === 'unit' ? this.units.get(t.id) : g.villagers.get(t.id);
    if (!tp || (tp as { dying?: number | boolean }).dying || (t.k === 'villager' && (tp as Villager).hidden)) { u.target = null; return anim; }
    if (tp.pos.distanceTo(u.pos) < 0.95) {
      u.path = [];
      this.face(u, tp.pos);
      if (u.atkT <= 0) {
        u.atkT = STATS.raider.every;
        if (t.k === 'unit') this.damageUnit(tp as Unit, dmg);
        else this.damageVillager(tp as Villager, dmg);
      }
      return '1H_Melee_Attack_Chop';
    }
    this.moveToward(u, tp.pos.x, tp.pos.z);
    return 'Running_A';
  }

  // ------------------------------------------------------------ towers & arrows
  private updateTowers(dt: number) {
    for (const b of this.g.buildings.values()) {
      if (b.type !== 'tower' || !b.built || b.broken) continue;
      const t = (this.towerT.get(b.id) ?? 0) - dt;
      this.towerT.set(b.id, t);
      if (t > 0) continue;
      const from = b.mesh.position.clone().setY(b.mesh.position.y + 2.6);
      const r = this.nearestRaider(b.mesh.position, 7);
      if (!r) continue;
      this.towerT.set(b.id, 1.4);
      this.shoot(from, r);
    }
  }

  private shoot(from: THREE.Vector3, target: Unit) {
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x8a5a33 }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.28;
    arrow.add(shaft, tip);
    this.g.root.add(arrow);
    const to = target.pos.clone().setY(target.pos.y + 0.5);
    this.arrows.push({ mesh: arrow, from, to, t: 0, dur: Math.max(0.3, from.distanceTo(to) / 14), target: target.id });
  }

  private updateArrows(dt: number) {
    this.arrows = this.arrows.filter((a) => {
      a.t += dt / a.dur;
      const tgt = this.units.get(a.target);
      if (tgt && !tgt.dying) a.to.copy(tgt.pos).setY(tgt.pos.y + 0.5);
      const p = a.from.clone().lerp(a.to, Math.min(1, a.t));
      p.y += Math.sin(Math.min(1, a.t) * Math.PI) * 0.8;
      a.mesh.lookAt(p);
      a.mesh.position.copy(p);
      if (a.t >= 1) {
        this.g.root.remove(a.mesh);
        if (tgt && !tgt.dying) this.damageUnit(tgt, 12);
        return false;
      }
      return true;
    });
  }

  // ------------------------------------------------------------ visuals
  updateVisuals(dt: number, paused: boolean) {
    const cam = this.g.rts.cam;
    for (const u of this.units.values()) {
      u.pos.y = u.dying && u.dying < 0.8 ? u.pos.y : this.g.terrain.heightAt(u.pos.x, u.pos.z);
      u.mesh.position.copy(u.pos);
      const speed = u.kind === 'sam' ? 1 + this.samLevel * 0.08 : 1;
      if (!u.dying) playAnim(u.ch, paused ? 'Idle' : u.anim || 'Idle', 0.15, speed);
      u.ch.mixer.update(paused ? dt * 0.5 : dt);
      u.ring.visible = u.selected;
      if (u.selected) u.ring.position.set(u.pos.x, u.pos.y + 0.03, u.pos.z);
      if (u.kind === 'sam' && this.samLevel >= 5 && Math.random() < dt * 4) this.g.fx.sparkle(u.pos.clone().setY(u.pos.y + 0.8), 1);
    }
    // health bars
    const want = new Map<string, { pos: THREE.Vector3; f: number; w: number }>();
    for (const u of this.units.values()) if (!u.dying && u.kind !== 'sam' && (u.hp < u.maxHp || u.selected || u.kind === 'raider'))
      want.set('u' + u.id, { pos: u.pos.clone().setY(u.pos.y + 1.15), f: u.hp / u.maxHp, w: 0.6 });
    for (const v of this.g.villagers.values()) if (!v.dying && !v.hidden && v.hp < v.maxHp)
      want.set('v' + v.id, { pos: v.pos.clone().setY(v.pos.y + 1.1), f: v.hp / v.maxHp, w: 0.55 });
    for (const b of this.g.buildings.values()) {
      const max = BUILDINGS[b.type].hp;
      if (b.built && b.hp < max) want.set('b' + b.id, { pos: b.mesh.position.clone().setY(b.mesh.position.y + (b.type === 'towncenter' ? 5.6 : 2.6)), f: b.hp / max, w: b.size * 0.7 });
    }
    for (const [k, bar] of this.bars) if (!want.has(k)) { this.g.scene.remove(bar); this.bars.delete(k); }
    for (const [k, w] of want) {
      let bar = this.bars.get(k);
      if (!bar) {
        bar = new THREE.Group();
        const bg = new THREE.Mesh(this.barGeo, this.barBg);
        const fill = new THREE.Mesh(this.barGeo, this.barGood);
        fill.position.z = 0.001;
        bar.add(bg, fill);
        bar.renderOrder = 10;
        bg.renderOrder = 10; fill.renderOrder = 11;
        this.g.scene.add(bar);
        this.bars.set(k, bar);
      }
      bar.position.copy(w.pos);
      bar.quaternion.copy(cam.quaternion);
      const [bg, fill] = bar.children as THREE.Mesh[];
      bg.scale.set(w.w + 0.06, 0.13, 1);
      const f = Math.max(0, Math.min(1, w.f));
      fill.scale.set(w.w * f, 0.08, 1);
      fill.position.x = -(w.w * (1 - f)) / 2;
      fill.material = f > 0.6 ? this.barGood : f > 0.3 ? this.barMid : this.barBad;
    }
  }

  // ------------------------------------------------------------ save
  serialize() {
    return {
      raidT: this.raidActive ? 60 : this.raidT, wave: this.wave, samLevel: this.samLevel,
      units: this.alive().filter((u) => u.kind === 'soldier' || u.kind === 'scout').map((u) => ({ id: u.id, kind: u.kind, x: u.pos.x, z: u.pos.z, hp: u.hp, order: u.order, home: u.home ? [u.home.x, u.home.z] : null })),
    };
  }

  load(d: { raidT: number; wave: number; samLevel: number; units: { id: number; kind: UnitKind; x: number; z: number; hp: number; order: Unit['order']; home: number[] | null }[] } | undefined) {
    this.reset();
    if (!d) return;
    this.raidT = d.raidT; this.wave = d.wave; this.samLevel = d.samLevel ?? 1;
    this.warned = this.raidT <= WARNING;
    for (const s of d.units ?? []) {
      const u = this.spawn(s.kind, s.x, s.z, s.id);
      u.hp = s.hp;
      u.order = s.order === 'attack' ? 'idle' : s.order;
      u.home = s.home ? new THREE.Vector3(s.home[0], 0, s.home[1]) : u.home;
    }
  }
}

export type JobRes = Res;
