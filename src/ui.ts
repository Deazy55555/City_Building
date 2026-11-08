import { BUILD_MENU, BUILDINGS, GOALS, RES, RES_ICON, RES_NAME, RESEARCH, VILLAGER_COST, VILLAGER_TIME, costText, type Cost, type Res } from './data';
import type { Game, GameUI } from './game';
import type { Question } from './questions';
import { say, englishVoices, setVoice, currentVoiceName } from './speech';
import { shuffle } from './util';

const SUBJECT_BADGE: Record<string, string> = { math: '➗ Math', reading: '📖 Reading', science: '🔬 Science', mixed: '🎲 Mixed' };
const JOB_LABEL: Record<Res, string> = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

/** Turn text into clickable words that are read aloud when clicked */
function speakable(text: string, enabled = true) {
  const wrap = h('span', 'speakable');
  for (const token of text.split(/(\s+)/)) {
    if (/^\s+$/.test(token)) { wrap.append(token); continue; }
    const w = h('span', enabled ? 'word' : '');
    w.textContent = token;
    if (enabled) {
      const clean = token.replace(/[^A-Za-z0-9'’-]/g, '');
      if (clean) w.addEventListener('click', (e) => { e.stopPropagation(); say(clean, 0.8); w.classList.add('said'); setTimeout(() => w.classList.remove('said'), 600); });
    }
    wrap.append(w);
  }
  return wrap;
}

export class UI implements GameUI {
  root: HTMLElement;
  top = h('div', 'hud-top');
  goals = h('div', 'goals');
  panel = h('div', 'panel');
  tip = h('div', 'tip');
  toasts = h('div', 'toasts');
  idleBtn = h('button', 'idle-btn');
  private dyn: (() => void)[] = [];
  private mouse = { x: 0, y: 0 };
  private idleIdx = 0;

  constructor(private game: Game, container: HTMLElement) {
    this.root = container;
    container.append(this.top, this.goals, this.panel, this.tip, this.toasts, this.idleBtn);
    this.buildTop();
    this.idleBtn.addEventListener('click', () => this.nextIdle());
    window.addEventListener('mousemove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('.modal')) return;
      if (e.key === '.' || e.key === 'i') this.nextIdle();
      if (e.key === 'h' && this.game.townCenter()) { const tc = this.game.townCenter()!; this.game.selectBuilding(tc); this.game.rts.focus(tc.mesh.position.x, tc.mesh.position.z); }
    });
    this.refreshSelection();
    this.renderGoals();
  }

  // ---------------- top bar ----------------
  private resEls: Partial<Record<Res, HTMLElement>> = {};
  private popEl = h('span');
  private buildTop() {
    const left = h('div', 'res-row');
    for (const r of RES) {
      const chip = h('div', 'res-chip', `<span class="ico">${RES_ICON[r]}</span>`);
      chip.title = RES_NAME[r];
      const val = h('span', 'val');
      chip.append(val);
      this.resEls[r] = val;
      left.append(chip);
    }
    const pop = h('div', 'res-chip', '<span class="ico">👥</span>');
    pop.title = 'Villagers / room in your town';
    pop.append(this.popEl);
    left.append(pop);
    const age = h('div', 'age-chip', '🪨 Stone Age');
    const menu = h('button', 'menu-btn', '⚙️');
    menu.title = 'Menu';
    menu.addEventListener('click', () => this.openMenu());
    const help = h('button', 'menu-btn', '❓');
    help.title = 'How to play';
    help.addEventListener('click', () => this.showHelp());
    this.top.append(left, age, help, menu);
  }

  tick() {
    const g = this.game;
    const cap = g.storageCap();
    for (const r of RES) {
      const el = this.resEls[r]!;
      el.textContent = `${Math.floor(g.res[r])}`;
      el.parentElement!.classList.toggle('full', g.res[r] >= cap);
      el.parentElement!.classList.toggle('empty', r === 'food' && g.res[r] <= 0);
      el.parentElement!.title = `${RES_NAME[r]}: ${Math.floor(g.res[r])} of ${cap} storage`;
    }
    this.popEl.textContent = `${g.villagers.size}/${g.popCap()}`;
    const idle = [...g.villagers.values()].filter((v) => v.task.k === 'idle');
    this.idleBtn.style.display = idle.length ? 'block' : 'none';
    this.idleBtn.textContent = `😴 ${idle.length} idle villager${idle.length === 1 ? '' : 's'}`;
    if (g.hoverText && !document.querySelector('.modal')) {
      this.tip.style.display = 'block';
      this.tip.textContent = g.hoverText;
      this.tip.style.left = `${this.mouse.x + 16}px`;
      this.tip.style.top = `${this.mouse.y + 16}px`;
    } else this.tip.style.display = 'none';
    for (const f of this.dyn) f();
  }

  private nextIdle() {
    const idle = [...this.game.villagers.values()].filter((v) => v.task.k === 'idle');
    if (!idle.length) return;
    const v = idle[this.idleIdx++ % idle.length];
    this.game.setSelected([v]);
    this.game.rts.focus(v.pos.x, v.pos.z);
  }

  // ---------------- selection panel ----------------
  refreshSelection() {
    const g = this.game;
    this.panel.innerHTML = '';
    this.dyn = [];
    const vs = g.selectedVillagers();
    const b = g.selectedBuilding !== null ? g.buildings.get(g.selectedBuilding) : undefined;
    if (vs.length) this.villagerPanel(vs.length);
    else if (b) this.buildingPanel(b.id);
    else {
      this.panel.append(h('div', 'panel-hint', 'Click a villager to give them a job. Click the 🏰 Town Center to train more villagers.'));
    }
  }

  private costButton(label: string, cost: Cost, subject: string, onClick: () => void, sub = '') {
    const btn = h('button', 'act');
    btn.innerHTML = `<div class="act-label">${label}</div><div class="act-cost">${costText(cost) || 'Free'}</div><div class="act-sub">${SUBJECT_BADGE[subject] ?? ''}${sub}</div>`;
    btn.addEventListener('click', onClick);
    this.dyn.push(() => btn.classList.toggle('cant', !this.game.canAfford(cost)));
    return btn;
  }

  private villagerPanel(count: number) {
    const g = this.game;
    const head = h('div', 'panel-head');
    const first = g.selectedVillagers()[0];
    const status = h('span', 'muted');
    this.dyn.push(() => { const v = g.selectedVillagers()[0]; if (v) status.textContent = count === 1 ? `· ${g.villagerStatus(v)}` : ''; });
    head.append(h('span', '', count === 1 ? '🧑 Villager' : `🧑 ${count} villagers`), status);
    const close = h('button', 'x-btn', '✖');
    close.title = 'Deselect (Esc)';
    close.addEventListener('click', () => g.setSelected([]));
    head.append(close);
    this.panel.append(head);
    this.panel.append(h('div', 'panel-hint', 'Click a 🌲 tree, 🫐 bush, 🪨 rock, ✨ gold or 🦌 deer to send them to work. Or build something:'));
    const row = h('div', 'act-row');
    for (const t of BUILD_MENU) {
      const def = BUILDINGS[t];
      row.append(this.costButton(`${def.emoji} ${def.name}`, def.cost, def.subject, () => g.startPlacement(t)));
    }
    this.panel.append(row);
    void first;
  }

  private buildingPanel(id: number) {
    const g = this.game;
    const b = g.buildings.get(id)!;
    const def = BUILDINGS[b.type];
    const head = h('div', 'panel-head', `<span>${def.emoji} ${def.name}</span>`);
    const close = h('button', 'x-btn', '✖');
    close.addEventListener('click', () => g.selectBuilding(null));
    head.append(close);
    this.panel.append(head);
    this.panel.append(speakable(def.desc));
    if (!b.built) {
      const bar = this.progressBar(() => b.progress, () => `Building… ${Math.floor(b.progress * 100)}%`);
      this.panel.append(bar);
      this.panel.append(h('div', 'panel-hint', 'Pick villagers and click this building to help build it faster.'));
      return;
    }
    if (b.type === 'farm') {
      const st = h('div', 'panel-hint');
      this.dyn.push(() => { st.textContent = b.farmer !== null && g.villagers.has(b.farmer) ? '👩‍🌾 A villager is farming here.' : '🌾 Nobody is farming here. Pick a villager and click the farm.'; });
      this.panel.append(st);
    }
    if (b.type === 'towncenter') {
      this.panel.append(h('div', 'section', 'Train a villager <span class="muted">(answer a Reading question)</span>'));
      const row = h('div', 'act-row');
      for (const r of RES) row.append(this.costButton(`${RES_ICON[r]} ${JOB_LABEL[r]} worker`, VILLAGER_COST, 'reading', () => g.trainVillager(r)));
      this.panel.append(row);
      const q = h('div', 'queue');
      this.dyn.push(() => {
        if (!b.queue.length) { q.innerHTML = ''; return; }
        q.innerHTML = b.queue.map((it, k) => `<span class="q-item">${RES_ICON[it.job ?? 'food']}${k === 0 ? ` <span class="mini-bar"><span style="width:${(it.t / VILLAGER_TIME) * 100}%"></span></span>` : ''}</span>`).join('');
      });
      this.panel.append(q);

      this.panel.append(h('div', 'section', 'Research <span class="muted">(answer a Science question)</span>'));
      const rrow = h('div', 'act-row');
      for (const r of RESEARCH) {
        if (g.research.has(r.id)) {
          rrow.append(h('div', 'act done', `<div class="act-label">${r.emoji} ${r.name}</div><div class="act-cost">✅ Done</div><div class="act-sub">${r.desc}</div>`));
          continue;
        }
        const btn = this.costButton(`${r.emoji} ${r.name}`, r.cost, 'science', () => g.startResearch(r.id), `<br>${r.desc}`);
        this.dyn.push(() => {
          const busy = b.research?.id === r.id;
          btn.classList.toggle('busy', busy);
          if (busy) btn.querySelector('.act-cost')!.textContent = `Researching… ${Math.floor((b.research!.t / r.time) * 100)}%`;
        });
        rrow.append(btn);
      }
      this.panel.append(rrow);
      this.panel.append(h('div', 'locked', '🔒 Bronze Age — coming in a future update'));
    }
  }

  private progressBar(get: () => number, label: () => string) {
    const wrap = h('div', 'bar');
    const fill = h('div', 'bar-fill');
    const txt = h('div', 'bar-text');
    wrap.append(fill, txt);
    this.dyn.push(() => { fill.style.width = `${get() * 100}%`; txt.textContent = label(); });
    return wrap;
  }

  // ---------------- goals & toasts ----------------
  renderGoals() {
    const next = GOALS.filter((x) => !this.game.goalsDone.has(x.id)).slice(0, 3);
    this.goals.innerHTML = '<div class="goals-title">⭐ Goals</div>';
    if (!next.length) this.goals.innerHTML += '<div class="goal">All goals done! 🎉</div>';
    for (const gl of next) {
      const row = h('div', 'goal');
      row.append(speakable(gl.text));
      row.append(h('div', 'goal-reward', `Reward: ${costText(gl.reward)}`));
      this.goals.append(row);
    }
  }

  goalDone(text: string, reward: Cost) {
    this.toast(`⭐ Goal done: ${text}! You got ${costText(reward)}`, false, 'gold');
    say('Goal done! Great work!');
    this.renderGoals();
  }

  toast(msg: string, speak = false, kind = '') {
    const t = h('div', `toast ${kind}`);
    t.textContent = msg;
    this.toasts.append(t);
    if (speak) say(msg.replace(/[^\p{L}\p{N}\s.,!?'-]/gu, ''));
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
  }

  // ---------------- the question card ----------------
  ask(q: Question, title: string, cost: Cost): Promise<boolean> {
    (window as unknown as { __q: Question }).__q = q; // lets automated tests see the current question
    return new Promise((resolve) => {
      const modal = h('div', 'modal');
      const card = h('div', 'q-card');
      modal.append(card);
      card.append(h('div', 'q-title', title));
      card.append(h('div', 'q-badges', `<span class="badge">${SUBJECT_BADGE[q.skill === 'spelling' ? 'reading' : q.skill]}${q.skill === 'spelling' ? ' · Spelling' : ''}</span><span class="badge cost">This try used ${costText(cost)}</span>`));
      if (q.passage) {
        const p = h('div', 'q-passage');
        p.append(speakable(q.passage));
        card.append(p);
      }
      const prompt = h('div', 'q-prompt');
      prompt.append(speakable(q.prompt));
      if (q.readAloud) {
        const sp = h('button', 'speak-btn', '🔊');
        sp.title = 'Read it to me';
        sp.addEventListener('click', () => say(q.prompt));
        prompt.append(sp);
      }
      if (q.sayWord) {
        const sp = h('button', 'speak-btn big', '🔊 Hear it');
        sp.addEventListener('click', () => say(q.sayWord!, 0.75));
        prompt.append(sp);
        setTimeout(() => say(q.sayWord!, 0.75), 350);
      }
      card.append(prompt);

      const body = h('div', 'q-body');
      card.append(body);
      const feedback = h('div', 'q-feedback');
      card.append(feedback);
      const check = h('button', 'big-btn', 'Check ✔');
      check.disabled = true;
      card.append(check);

      let getAnswer: () => string = () => '';
      let onKey: (e: KeyboardEvent) => void = () => {};

      if (q.kind === 'mc') {
        const choicesRow = h('div', 'choices');
        let chosen = '';
        const btns: HTMLButtonElement[] = [];
        q.choices!.forEach((c, k) => {
          const btn = h('button', 'choice');
          btn.append(h('span', 'choice-num', String(k + 1)));
          btn.append(document.createTextNode(c));
          btn.addEventListener('click', () => {
            if (done) return;
            if (!q.sayWord) say(c, 0.85); // hearing the choice helps; not for "pick the word you hear"
            chosen = c;
            btns.forEach((x) => x.classList.toggle('picked', x === btn));
            check.disabled = false;
          });
          btns.push(btn);
          choicesRow.append(btn);
        });
        body.append(choicesRow);
        getAnswer = () => chosen;
        onKey = (e) => { const n = parseInt(e.key); if (n >= 1 && n <= btns.length) btns[n - 1].click(); };
      } else if (q.kind === 'number') {
        const display = h('div', 'num-display', '&nbsp;');
        let val = '';
        const set = (v: string) => { val = v.slice(0, 3); display.textContent = val || ' '; check.disabled = !val; };
        const pad = h('div', 'numpad');
        for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0']) {
          const btn = h('button', 'num', k);
          btn.addEventListener('click', () => set(k === '⌫' ? val.slice(0, -1) : val + k));
          pad.append(btn);
        }
        body.append(display, pad);
        getAnswer = () => val;
        onKey = (e) => {
          if (/^[0-9]$/.test(e.key)) set(val + e.key);
          if (e.key === 'Backspace') set(val.slice(0, -1));
        };
      } else {
        // spelling with letter tiles
        const word = q.answer;
        const slots = h('div', 'slots');
        let typed = '';
        const draw = () => {
          slots.innerHTML = '';
          for (let k = 0; k < word.length; k++) slots.append(h('span', 'slot' + (typed[k] ? ' filled' : ''), typed[k] ? typed[k].toUpperCase() : ''));
          check.disabled = typed.length !== word.length;
        };
        const extras = 'abcdefghijklmnoprstuw'.split('').filter((c) => !word.includes(c));
        const letters = shuffle([...word.split(''), ...shuffle(extras).slice(0, 3)]);
        const tiles = h('div', 'tiles');
        for (const L of letters) {
          const t = h('button', 'tile', L.toUpperCase());
          t.addEventListener('click', () => { if (typed.length < word.length) { typed += L; draw(); } });
          tiles.append(t);
        }
        const back = h('button', 'tile back', '⌫');
        back.addEventListener('click', () => { typed = typed.slice(0, -1); draw(); });
        tiles.append(back);
        body.append(slots, tiles);
        draw();
        getAnswer = () => typed;
        onKey = (e) => {
          if (/^[a-zA-Z]$/.test(e.key) && typed.length < word.length) { typed += e.key.toLowerCase(); draw(); }
          if (e.key === 'Backspace') { typed = typed.slice(0, -1); draw(); }
        };
      }

      let done = false;
      const finish = () => {
        window.removeEventListener('keydown', keyHandler, true);
        modal.remove();
        resolve(answeredRight);
      };
      let answeredRight = false;
      const keyHandler = (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          if (done) finish();
          else if (!check.disabled) check.click();
          return;
        }
        if (!done) onKey(e);
      };
      window.addEventListener('keydown', keyHandler, true);

      check.addEventListener('click', () => {
        if (done) { finish(); return; }
        done = true;
        const a = getAnswer().trim().toLowerCase();
        answeredRight = a === q.answer.toLowerCase();
        body.classList.add('locked');
        if (answeredRight) {
          feedback.className = 'q-feedback good';
          feedback.innerHTML = `<div class="fb-big">🎉 Great job!</div>`;
          say(['Great job!', 'You got it!', 'Awesome!', 'Way to go!'][Math.floor(Math.random() * 4)]);
          card.classList.add('celebrate');
          check.textContent = 'Keep going ➜';
        } else {
          feedback.className = 'q-feedback bad';
          feedback.innerHTML = `<div class="fb-big">Not quite!</div><div>The answer is <b>${q.answer}</b>.</div>`;
          const why = h('div', 'why');
          why.append(speakable(q.explain));
          feedback.append(why);
          feedback.append(h('div', 'fb-cost', `Your ${costText(cost)} got used up. Gather more and try again. Take your time!`));
          say(`Not quite. The answer is ${q.answer}. ${q.explain}`);
          check.textContent = 'OK';
        }
        if (q.kind === 'mc') {
          body.querySelectorAll('.choice').forEach((el) => {
            const txt = (el.textContent ?? '').replace(/^\d/, '');
            if (txt === q.answer) el.classList.add('right');
            else if (el.classList.contains('picked')) el.classList.add('wrong');
          });
        }
      });

      this.root.append(modal);
    });
  }

  // ---------------- menus ----------------
  private simpleModal(titleHtml: string, build: (card: HTMLElement, close: () => void) => void) {
    const modal = h('div', 'modal');
    const card = h('div', 'q-card menu-card');
    card.append(h('div', 'q-title', titleHtml));
    const close = () => modal.remove();
    build(card, close);
    modal.append(card);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    this.root.append(modal);
  }

  openMenu() {
    const g = this.game;
    this.simpleModal('⚙️ Menu', (card, close) => {
      const acc = g.stats.answered ? Math.round((g.stats.correct / g.stats.answered) * 100) : 0;
      card.append(h('div', 'stats', `Questions answered: <b>${g.stats.answered}</b> · Right: <b>${acc}%</b><br>Play time: <b>${Math.floor(g.playTime / 60)} min</b><br>
        Levels — Math ${g.skills.math.level}, Reading ${g.skills.reading.level}, Spelling ${g.skills.spelling.level}, Science ${g.skills.science.level}`));
      const voices = englishVoices();
      if (voices.length) {
        const row = h('div', 'voice-row', '<label>Read-aloud voice </label>');
        const sel = h('select');
        for (const v of voices) {
          const o = h('option');
          o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
          if (v.name === currentVoiceName()) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener('change', () => { setVoice(sel.value); say('Hi! I will read words to you.'); });
        row.append(sel);
        card.append(row);
      }
      const save = h('button', 'big-btn', '💾 Save game');
      save.addEventListener('click', () => { g.save(); this.toast('Game saved!'); close(); });
      const reset = h('button', 'big-btn danger', '🔄 Start a new town');
      reset.addEventListener('click', () => {
        if (confirm('Start over with a brand new town? Your current town will be erased.')) {
          g.deleteSave(); g.newGame(); g.save(); this.renderGoals(); this.refreshSelection(); close();
        }
      });
      const back = h('button', 'big-btn alt', 'Back to the game');
      back.addEventListener('click', close);
      card.append(save, reset, back);
    });
  }

  showHelp() {
    this.simpleModal('❓ How to play', (card, close) => {
      const lines = [
        'Click a villager to pick them. Drag a box to pick a lot of villagers.',
        'Then click a tree, a berry bush, a rock, gold, or a deer to send them to work.',
        'Click the Town Center to train new villagers.',
        'You answer a question to build or train. Every try uses up resources, so think before you answer!',
        'Villagers eat food. Keep gathering food so they stay strong.',
        'Scroll to zoom. Use W A S D, the arrow keys, or drag with the right mouse button to look around. Q and E turn the view.',
      ];
      const list = h('ul', 'help');
      for (const l of lines) { const li = h('li'); li.append(speakable(l)); list.append(li); }
      card.append(list);
      const ok = h('button', 'big-btn', "Let's play!");
      ok.addEventListener('click', close);
      card.append(ok);
    });
  }

  showStart(hasSave: boolean, onContinue: () => void, onNew: () => void) {
    const modal = h('div', 'modal start');
    const card = h('div', 'q-card start-card');
    card.innerHTML = `<div class="logo">🏰</div><h1>City Building</h1><p>Build a town, gather resources, and grow your village through the ages!</p>`;
    const go = h('button', 'big-btn', hasSave ? '▶ Keep playing' : '▶ Start a new town');
    go.addEventListener('click', () => { modal.remove(); say(hasSave ? 'Welcome back!' : 'Welcome to City Building!'); hasSave ? onContinue() : onNew(); });
    card.append(go);
    if (hasSave) {
      const fresh = h('button', 'big-btn alt', 'Start a new town');
      fresh.addEventListener('click', () => {
        if (confirm('Start over with a brand new town? Your current town will be erased.')) { modal.remove(); onNew(); }
      });
      card.append(fresh);
    }
    modal.append(card);
    this.root.append(modal);
  }
}
