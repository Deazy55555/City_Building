import './style.css';
import { Game } from './game';
import { UI } from './ui';
import { loadAssets } from './assets';

const container = document.getElementById('app')!;

// loading screen while the 3D models download
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = `<div class="logo">🏰</div><h1>City Building</h1><div class="load-bar"><div></div></div><p>Loading the world…</p>`;
container.appendChild(loading);
const fill = loading.querySelector('.load-bar div') as HTMLElement;

(async () => {
  try {
    await loadAssets((f) => (fill.style.width = `${Math.round(f * 100)}%`));
  } catch (e) {
    loading.querySelector('p')!.textContent = 'Could not load the game. Please refresh the page.';
    console.error(e);
    return;
  }
  loading.remove();
  start();
})();

function start() {
  const game = new Game(container);
  const ui = new UI(game, container);
  game.ui = ui;

  // Build a world behind the start screen so it looks alive
  const hasSave = game.hasSave();
  if (!(hasSave && game.load())) game.newGame();
  game.paused = true;

  ui.showStart(
    hasSave,
    () => { game.paused = false; ui.refreshSelection(); ui.renderGoals(); },
    () => { game.deleteSave(); game.newGame(); game.paused = false; game.save(); ui.refreshSelection(); ui.renderGoals(); ui.showHelp(); },
  );

  let last = performance.now();
  let uiT = 0, saveT = 0;
  // if the laptop struggles, step the graphics down automatically
  let slowT = 0, fpsFrames = 0, fpsT = 0;
  function frame(now: number) {
    const raw = (now - last) / 1000;
    const dt = Math.min(0.1, raw);
    last = now;
    // time only passes while he is actually playing (tab visible)
    if (!document.hidden) {
      game.update(dt);
      game.render();
      uiT += dt;
      if (uiT > 0.15) { uiT = 0; ui.tick(); }
      saveT += dt;
      if (saveT > 20 && !game.paused) { saveT = 0; game.save(); }
      fpsFrames++; fpsT += raw;
      if (fpsT > 2) {
        const fps = fpsFrames / fpsT;
        fpsFrames = 0; fpsT = 0;
        slowT = fps < 32 ? slowT + 2 : 0;
        if (slowT >= 8 && game.fx.quality !== 'low' && !game.paused) {
          slowT = 0;
          const q = game.fx.quality === 'high' ? 'medium' : 'low';
          game.fx.setQuality(q);
          ui.toast(`Graphics set to ${q} so the game runs smoothly. You can change this in the ⚙️ menu.`);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
  window.addEventListener('beforeunload', () => game.save());

  // handy for testing from the browser console
  (window as unknown as { game: Game }).game = game;
}
