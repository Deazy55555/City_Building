import './style.css';
import { Game } from './game';
import { UI } from './ui';

const container = document.getElementById('app')!;
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
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // time only passes while he is actually playing (tab visible)
  if (!document.hidden) {
    game.update(dt);
    game.render();
    uiT += dt;
    if (uiT > 0.15) { uiT = 0; ui.tick(); }
    saveT += dt;
    if (saveT > 20 && !game.paused) { saveT = 0; game.save(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('beforeunload', () => game.save());

// handy for testing from the browser console
(window as unknown as { game: Game }).game = game;
