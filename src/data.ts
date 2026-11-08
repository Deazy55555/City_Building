export type Res = 'food' | 'wood' | 'stone' | 'gold';
export type Cost = Partial<Record<Res, number>>;
export type Subject = 'math' | 'reading' | 'science' | 'mixed';
export type BType = 'towncenter' | 'house' | 'farm' | 'storehouse' | 'barracks' | 'tower';

export const RES: Res[] = ['food', 'wood', 'stone', 'gold'];
export const RES_ICON: Record<Res, string> = { food: '🍓', wood: '🪵', stone: '🪨', gold: '🪙' };
export const RES_NAME: Record<Res, string> = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' };

export interface BuildingDef {
  type: BType;
  name: string;
  emoji: string;
  size: number;
  cost: Cost;
  buildTime: number; // seconds of play
  subject: Subject;
  hp: number;
  pop?: number;
  storage?: number;
  dropsite?: boolean;
  blocks: boolean; // can villagers walk through it?
  desc: string;
}

export const BUILDINGS: Record<BType, BuildingDef> = {
  towncenter: {
    type: 'towncenter', name: 'Town Center', emoji: '🏰', size: 3, cost: {}, buildTime: 0, subject: 'reading',
    hp: 2000, pop: 5, storage: 300, dropsite: true, blocks: true,
    desc: 'The heart of your town. Trains villagers. General Sam lives here.',
  },
  house: {
    type: 'house', name: 'House', emoji: '🏠', size: 2, cost: { wood: 30 }, buildTime: 30, subject: 'math',
    hp: 300, pop: 5, blocks: true, desc: 'Room for 5 more people.',
  },
  farm: {
    type: 'farm', name: 'Farm', emoji: '🌾', size: 3, cost: { wood: 60 }, buildTime: 35, subject: 'math',
    hp: 200, blocks: false, desc: 'Food that never runs out. One villager works each farm.',
  },
  storehouse: {
    type: 'storehouse', name: 'Storehouse', emoji: '📦', size: 2, cost: { wood: 80 }, buildTime: 45, subject: 'math',
    hp: 400, storage: 200, dropsite: true, blocks: true,
    desc: 'Villagers can drop off here. Holds 200 more of everything.',
  },
  barracks: {
    type: 'barracks', name: 'Barracks', emoji: '⚔️', size: 2, cost: { wood: 120, stone: 40 }, buildTime: 50, subject: 'math',
    hp: 800, blocks: true, desc: 'Trains soldiers to protect your town.',
  },
  tower: {
    type: 'tower', name: 'Watch Tower', emoji: '🗼', size: 2, cost: { wood: 40, stone: 80 }, buildTime: 45, subject: 'math',
    hp: 700, blocks: true, desc: 'Shoots arrows at raiders who come close.',
  },
};

export const BUILD_MENU: BType[] = ['house', 'farm', 'storehouse', 'barracks', 'tower'];

export const SOLDIER_COST: Cost = { food: 40, gold: 20 };
export const SOLDIER_TIME = 35;
export const SCOUT_COST: Cost = { food: 60 };
export const SCOUT_TIME = 30;
/** Cost to upgrade General Sam from level L to L+1 */
export function samUpgradeCost(level: number): Cost {
  return { food: 60 * level, gold: 50 * level };
}
export const SAM_MAX_LEVEL = 5;
/** Repairs cost a bit of what the building cost */
export function repairCost(t: BType): Cost {
  const c = BUILDINGS[t].cost;
  const out: Cost = {};
  for (const r of Object.keys(c) as Res[]) out[r] = Math.max(10, Math.ceil((c[r] ?? 0) * 0.35));
  if (t === 'towncenter') return { wood: 60, stone: 40 };
  return out;
}

export const VILLAGER_COST: Cost = { food: 50 };
export const VILLAGER_TIME = 30;
export const MAX_POP = 60;

export interface ResearchDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  cost: Cost;
  time: number;
}

export const RESEARCH: ResearchDef[] = [
  { id: 'axes', name: 'Sharp Axes', emoji: '🪓', desc: 'Chop wood 25% faster.', cost: { food: 60, wood: 40 }, time: 60 },
  { id: 'spears', name: 'Hunting Spears', emoji: '🍖', desc: 'Gather food 25% faster.', cost: { wood: 60, stone: 30 }, time: 60 },
  { id: 'baskets', name: 'Big Baskets', emoji: '🧺', desc: 'Villagers carry 5 more.', cost: { food: 80, wood: 60 }, time: 75 },
  { id: 'picks', name: 'Stone Picks', emoji: '⛏️', desc: 'Mine stone and gold 25% faster.', cost: { food: 60, wood: 60 }, time: 75 },
];

// Gather rate per second, by source kind
export const GATHER_RATE = { tree: 0.55, berry: 0.6, carcass: 0.9, farm: 0.45, stone: 0.4, gold: 0.4 } as const;
export const BASE_CARRY = 10;
export const VILLAGER_SPEED = 2.1; // tiles per second
export const FOOD_UPKEEP_EVERY = 40; // seconds; each villager eats 1 food

export function costText(c: Cost) {
  return (Object.keys(c) as Res[]).filter((r) => c[r]).map((r) => `${c[r]} ${RES_ICON[r]}`).join('  ');
}

export interface GoalDef {
  id: string;
  text: string;
  reward: Cost;
}

export const GOALS: GoalDef[] = [
  { id: 'gather_wood', text: 'Send a villager to chop a tree', reward: { food: 20 } },
  { id: 'train', text: 'Train a new villager at the Town Center', reward: { wood: 30 } },
  { id: 'house', text: 'Build a House', reward: { food: 40 } },
  { id: 'hunt', text: 'Hunt a deer for food', reward: { wood: 30 } },
  { id: 'pop8', text: 'Have 8 villagers', reward: { food: 60, wood: 40 } },
  { id: 'farm', text: 'Build a Farm', reward: { wood: 50 } },
  { id: 'stone', text: 'Collect 100 stone', reward: { food: 50 } },
  { id: 'research', text: 'Research something at the Town Center', reward: { gold: 30 } },
  { id: 'storehouse', text: 'Build a Storehouse', reward: { food: 60 } },
  { id: 'barracks', text: 'Build a Barracks', reward: { gold: 40 } },
  { id: 'soldier', text: 'Train a soldier', reward: { food: 50 } },
  { id: 'defend', text: 'Defend your town from raiders', reward: { gold: 50 } },
  { id: 'tower', text: 'Build a Watch Tower', reward: { wood: 60 } },
  { id: 'scout', text: 'Train a scout to explore', reward: { food: 50 } },
  { id: 'sam', text: 'Make General Sam stronger', reward: { gold: 60 } },
  { id: 'explore', text: 'Explore half of the map', reward: { gold: 80 } },
  { id: 'gold', text: 'Collect 100 gold', reward: { wood: 80 } },
  { id: 'pop15', text: 'Have 15 villagers', reward: { food: 100, gold: 50 } },
  { id: 'allresearch', text: 'Finish all 4 Town Center research', reward: { stone: 100 } },
];
