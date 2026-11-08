import type { Subject } from './data';
import { BLANKS, PASSAGES, RHYMES, SCIENCE, SCIENCE_BRONZE, SIGHT, SPELLING, type MCItem } from './content';
import { pick, randInt, shuffle } from './util';

export type Skill = 'math' | 'reading' | 'spelling' | 'science';

export interface Question {
  skill: Skill;
  kind: 'mc' | 'number' | 'spell';
  key: string; // used to avoid repeats
  passage?: string;
  prompt: string;
  readAloud: boolean; // show a speaker button for the whole prompt
  choices?: string[];
  answer: string;
  explain: string;
  sayWord?: string; // spelling: the word to hear
  speakChoices?: boolean;
}

export interface SkillStats {
  level: number; // 1..3 inside the current age
  streak: number;
  misses: number;
  right: number;
  total: number;
}

export function newSkills(): Record<Skill, SkillStats> {
  const s = (): SkillStats => ({ level: 1, streak: 0, misses: 0, right: 0, total: 0 });
  return { math: s(), reading: s(), spelling: s(), science: s() };
}

/** Adaptive difficulty: 4 right in a row moves up, 2 wrong in a row moves down. */
export function recordAnswer(stats: SkillStats, correct: boolean) {
  stats.total++;
  if (correct) {
    stats.right++;
    stats.streak++;
    stats.misses = 0;
    if (stats.streak >= 4 && stats.level < 3) {
      stats.level++;
      stats.streak = 0;
    }
  } else {
    stats.streak = 0;
    stats.misses++;
    if (stats.misses >= 2 && stats.level > 1) {
      stats.level--;
      stats.misses = 0;
    }
  }
}

const recent: string[] = [];
function fresh<T>(items: T[], keyOf: (t: T) => string): T {
  const notRecent = items.filter((t) => !recent.includes(keyOf(t)));
  const chosen = pick(notRecent.length ? notRecent : items);
  remember(keyOf(chosen));
  return chosen;
}
function remember(key: string) {
  recent.push(key);
  if (recent.length > 30) recent.shift();
}
function atLevel<T extends { level: number }>(items: T[], level: number) {
  // mostly current level, sometimes one below for confidence
  const want = Math.random() < 0.2 && level > 1 ? level - 1 : level;
  const pool = items.filter((i) => i.level === want);
  return pool.length ? pool : items.filter((i) => i.level <= level);
}

// ---------------- math ----------------
const NAMES = ['Sam', 'Mia', 'Leo', 'Ava', 'Max', 'Zoe', 'Ben', 'Lily'];

function mathQ(level: number): Question {
  const r = Math.random();
  let prompt = '', answer = 0, explain = '';
  const mk = (p: string, a: number, e: string): Question => {
    const key = 'm:' + p;
    remember(key);
    return { skill: 'math', kind: 'number', key, prompt: p, readAloud: true, answer: String(a), explain: e };
  };

  if (level === 1) {
    // within 20, no crossing ten
    if (r < 0.5) {
      const a = randInt(10, 16), b = randInt(1, 19 - a);
      prompt = `${a} + ${b} = ?`; answer = a + b;
      explain = `${a} + ${b} = ${answer}. Start at ${a} and count up ${b}.`;
    } else if (r < 0.85) {
      const a = randInt(11, 19), b = randInt(1, a - 10);
      prompt = `${a} − ${b} = ?`; answer = a - b;
      explain = `${a} − ${b} = ${answer}. Start at ${a} and count back ${b}.`;
    } else {
      const a = randInt(2, 9), b = randInt(1, 9 - a + 1);
      const n = pick(NAMES);
      prompt = `${n} has ${a} berries. ${n} picks ${b} more. How many berries now?`; answer = a + b;
      explain = `${a} + ${b} = ${answer}.`;
    }
    return mk(prompt, answer, explain);
  }
  if (level === 2) {
    // crossing ten and missing numbers
    if (r < 0.35) {
      const a = randInt(6, 9), b = randInt(11 - a, 9);
      prompt = `${a} + ${b} = ?`; answer = a + b;
      explain = `${a} + ${b} = ${answer}. Make a ten: ${a} + ${10 - a} = 10, then add ${b - (10 - a)} more.`;
    } else if (r < 0.65) {
      const a = randInt(11, 18), b = randInt(a - 9, 9);
      prompt = `${a} − ${b} = ?`; answer = a - b;
      explain = `${a} − ${b} = ${answer}. Think: ${b} + ? = ${a}. ${b} + ${answer} = ${a}.`;
    } else if (r < 0.85) {
      const a = randInt(3, 9), sum = randInt(a + 3, 18);
      prompt = `${a} + ? = ${sum}`; answer = sum - a;
      explain = `${a} + ${answer} = ${sum}. Count up from ${a} to ${sum}.`;
    } else {
      const a = randInt(11, 18), b = randInt(3, 9);
      const n = pick(NAMES);
      prompt = `${n} had ${a} logs. ${n} used ${b} logs to build a house. How many logs are left?`; answer = a - b;
      explain = `${a} − ${b} = ${answer}.`;
    }
    return mk(prompt, answer, explain);
  }
  if (level >= 4) {
    // Bronze Age top: numbers to 100, tens and ones, skip counting
    if (r < 0.22) {
      const t = randInt(2, 8), o = randInt(1, 7), b = randInt(1, 9 - o);
      prompt = `${t * 10 + o} + ${b} = ?`; answer = t * 10 + o + b;
      explain = `${t * 10 + o} + ${b} = ${answer}. Add the ones: ${o} + ${b} = ${o + b}. The tens stay ${t * 10}.`;
    } else if (r < 0.42) {
      const t = randInt(2, 9), o = randInt(3, 9), b = randInt(1, o);
      prompt = `${t * 10 + o} − ${b} = ?`; answer = t * 10 + o - b;
      explain = `${t * 10 + o} − ${b} = ${answer}. Take away the ones: ${o} − ${b} = ${o - b}.`;
    } else if (r < 0.58) {
      const a = randInt(12, 58), t = randInt(1, Math.floor((99 - a) / 10)) * 10;
      prompt = `${a} + ${t} = ?`; answer = a + t;
      explain = `${a} + ${t} = ${answer}. Count up by tens: add ${t / 10} ten${t > 10 ? 's' : ''}.`;
    } else if (r < 0.72) {
      const t = randInt(2, 9), o = randInt(0, 9);
      prompt = `${t} tens and ${o} ones make what number?`; answer = t * 10 + o;
      explain = `${t} tens is ${t * 10}. ${t * 10} + ${o} = ${answer}.`;
    } else if (r < 0.86) {
      const step = pick([2, 5, 10]), start = step * randInt(1, 5);
      const seq = [start, start + step, start + step * 2, start + step * 3];
      prompt = `Count by ${step}s: ${seq.join(', ')}, ? What comes next?`; answer = start + step * 4;
      explain = `Each number is ${step} more. ${seq[3]} + ${step} = ${answer}.`;
    } else {
      const a = randInt(21, 45), b = randInt(2, 8);
      const n = pick(NAMES);
      prompt = `${n}'s town has ${a} logs. The villagers chop ${b} more. How many logs now?`; answer = a + b;
      explain = `${a} + ${b} = ${answer}.`;
    }
    return mk(prompt, answer, explain);
  }
  // level 3: three addends, tens, word problems
  if (r < 0.3) {
    const a = randInt(2, 7), b = randInt(2, 7), c = randInt(2, 6);
    prompt = `${a} + ${b} + ${c} = ?`; answer = a + b + c;
    explain = `${a} + ${b} = ${a + b}, then ${a + b} + ${c} = ${answer}.`;
  } else if (r < 0.55) {
    const a = randInt(1, 6) * 10, b = randInt(1, 9 - a / 10) * 10;
    if (Math.random() < 0.5) {
      prompt = `${a} + ${b} = ?`; answer = a + b;
      explain = `${a / 10} tens + ${b / 10} tens = ${answer / 10} tens, which is ${answer}.`;
    } else {
      const big = a + b;
      prompt = `${big} − ${b} = ?`; answer = a;
      explain = `${big / 10} tens − ${b / 10} tens = ${a / 10} tens, which is ${a}.`;
    }
  } else if (r < 0.8) {
    const a = randInt(12, 19), b = randInt(5, 9);
    const n = pick(NAMES);
    prompt = `${n} saw ${a} deer. Then ${b} deer ran away. How many deer are still there?`; answer = a - b;
    explain = `${a} − ${b} = ${answer}.`;
  } else {
    const a = randInt(4, 9);
    prompt = `Double ${a}. What is ${a} + ${a}?`; answer = a * 2;
    explain = `${a} + ${a} = ${answer}. Doubles are numbers added to themselves.`;
  }
  return mk(prompt, answer, explain);
}

// ---------------- reading ----------------
function mcFrom(item: MCItem, skill: Skill, readAloud: boolean): Question {
  return {
    skill, kind: 'mc', key: item.q + (item.passage ?? ''), passage: item.passage, prompt: item.q, readAloud,
    choices: shuffle(item.choices), answer: item.choices[0], explain: item.why,
  };
}

function readingQ(level: number): Question {
  const r = Math.random();
  if (r < 0.45) {
    const item = fresh(atLevel(PASSAGES, level), (i) => i.q + i.passage);
    return mcFrom(item, 'reading', false);
  }
  if (r < 0.7) {
    const item = fresh(atLevel(BLANKS, level), (i) => i.q);
    return mcFrom({ ...item, q: `Pick the word that fits: ${item.q}` }, 'reading', false);
  }
  if (r < 0.85) {
    const item = fresh(atLevel(RHYMES, level), (i) => 'r' + i.word);
    return {
      skill: 'reading', kind: 'mc', key: 'r' + item.word, prompt: `Which word rhymes with "${item.word}"?`, readAloud: false,
      choices: shuffle([item.yes, ...item.no]), answer: item.yes,
      explain: `"${item.word}" and "${item.yes}" end with the same sound.`,
    };
  }
  const item = fresh(atLevel(SIGHT, level), (i) => 's' + i.word);
  return {
    skill: 'reading', kind: 'mc', key: 's' + item.word, prompt: `Listen, then pick the word you hear.`, readAloud: false,
    sayWord: item.word, choices: shuffle([item.word, ...item.lookalikes]), answer: item.word,
    explain: `The word was "${item.word}".`,
  };
}

function spellingQ(level: number): Question {
  const lv = Math.random() < 0.2 && level > 1 ? level - 1 : level;
  const word = fresh(SPELLING[lv], (w) => 'sp' + w);
  return {
    skill: 'spelling', kind: 'spell', key: 'sp' + word, prompt: 'Listen, then spell the word.', readAloud: false,
    sayWord: word, answer: word, explain: `"${word}" is spelled ${word.toUpperCase().split('').join('-')}.`,
  };
}

function scienceQ(level: number, age: number): Question {
  const bank = age >= 2 ? SCIENCE_BRONZE : SCIENCE;
  const item = fresh(atLevel(bank, Math.min(3, level)), (i) => i.q);
  return mcFrom(item, 'science', true);
}

/**
 * Questions get harder in each age: the level inside an age (1-3) is shifted up by the age,
 * so level 1 of the Bronze Age is as hard as level 2 of the Stone Age.
 */
export function makeQuestion(subject: Subject, skills: Record<Skill, SkillStats>, forceLevel?: number, age = 1): Question {
  let s: Skill;
  if (subject === 'math') s = 'math';
  else if (subject === 'science') s = 'science';
  else if (subject === 'reading') s = Math.random() < 0.3 ? 'spelling' : 'reading';
  else s = pick<Skill>(['math', 'reading', 'spelling', 'science']);
  const lv = forceLevel ?? skills[s].level;
  const shifted = Math.min(4, lv + age - 1);
  if (s === 'math') return mathQ(shifted);
  if (s === 'reading') return readingQ(shifted);
  if (s === 'spelling') return spellingQ(shifted);
  return scienceQ(lv, age);
}
