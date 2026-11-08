import type { Game } from './game';
import { MAP } from './world';

/** Small map in the corner: explored land, buildings, villagers, soldiers and raiders. Click to jump there. */
export class Minimap {
  canvas = document.createElement('canvas');
  private base = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private size = 190;
  private baseT = 0;

  constructor(private g: Game, container: HTMLElement) {
    const px = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = this.size * px;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(px, px);
    this.base.width = this.base.height = MAP;
    container.appendChild(this.canvas);
    const go = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MAP - MAP / 2;
      const z = ((e.clientY - r.top) / r.height) * MAP - MAP / 2;
      this.g.rts.focus(x, z);
    };
    let down = false;
    this.canvas.addEventListener('pointerdown', (e) => { down = true; go(e); });
    window.addEventListener('pointermove', (e) => { if (down) go(e); });
    window.addEventListener('pointerup', () => (down = false));
  }

  private drawBase() {
    const g = this.g;
    const c = this.base.getContext('2d')!;
    const img = c.createImageData(MAP, MAP);
    for (let j = 0; j < MAP; j++)
      for (let i = 0; i < MAP; i++) {
        const k = (j * MAP + i) * 4;
        let col = [120, 180, 90];
        if (!g.fog.isExplored(i, j)) col = [205, 214, 228];
        else if (g.terrain.isWater(i, j)) col = [70, 150, 210];
        else {
          const id = g.nodeAt.get(j * MAP + i);
          const n = id !== undefined ? g.nodes.get(id) : undefined;
          if (n) col = n.kind === 'tree' ? [40, 110, 60] : n.kind === 'stone' ? [150, 150, 150] : n.kind === 'gold' ? [240, 200, 60] : [200, 60, 70];
          else if (g.terrain.wear[j * MAP + i] > 0.4) col = [190, 160, 110];
        }
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    c.putImageData(img, 0, 0);
  }

  tick() {
    const g = this.g;
    this.baseT -= 0.15;
    if (g.fog.changed || this.baseT <= 0) {
      g.fog.changed = false;
      this.baseT = 2;
      this.drawBase();
    }
    const ctx = this.ctx, S = this.size, k = S / MAP;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.base, 0, 0, S, S);
    const toS = (x: number) => (x + MAP / 2) * k;
    for (const b of g.buildings.values()) {
      ctx.fillStyle = b.broken ? '#6b5a4a' : b.type === 'towncenter' ? '#2f6fd6' : '#4f8be0';
      ctx.fillRect(b.i * k, b.j * k, b.size * k, b.size * k);
    }
    const dot = (x: number, z: number, color: string, r = 2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toS(x), toS(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const v of g.villagers.values()) if (!v.hidden && !v.dying) dot(v.pos.x, v.pos.z, '#ffffff', 1.6);
    for (const u of g.combat.units.values()) {
      if (u.dying) continue;
      if (u.kind === 'raider') dot(u.pos.x, u.pos.z, '#ff3b30', 2.6);
      else if (u.kind === 'sam') dot(u.pos.x, u.pos.z, '#ffd34d', 3.2);
      else dot(u.pos.x, u.pos.z, u.kind === 'scout' ? '#b07cff' : '#36c5ff', 2.2);
    }
    // camera view box
    const t = g.rts.target, d = g.rts.dist;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(toS(t.x) - d * 0.8 * k, toS(t.z) - d * 0.5 * k, d * 1.6 * k, d * 1.0 * k);
  }
}
