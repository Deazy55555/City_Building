// Run with: npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
// CH and HX below point at local clones of the KayKit GitHub repos (Character Pack: Adventurers, Medieval Hexagon Pack).
// Converts the chosen KayKit (CC0) models into compact .glb files for the game.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
import fs from 'node:fs';
import path from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const squeeze = () => meshopt({ encoder: MeshoptEncoder, level: 'medium' });
const OUT = '/home/claude/city_building/public/models';
const CH = '/home/claude/assets/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures';
const HX = '/home/claude/assets/KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf';

const KEEP_ANIMS = ['Idle', 'Walking_A', 'Running_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '2H_Melee_Attack_Chop',
  'PickUp', 'Interact', 'Cheer', 'Use_Item', 'Hit_A', 'Death_A', 'Block', 'Spellcast_Raise', '2H_Melee_Idle', 'Unarmed_Idle'];
const WEAPON_NODES = ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', '1H_Axe_Offhand', '1H_Axe', '2H_Axe', 'Mug',
  '1H_Sword_Offhand', '1H_Sword', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', 'Barbarian_Round_Shield'];

fs.mkdirSync(OUT, { recursive: true });
function dropAnim(a) {
  for (const s of a.listSamplers()) s.dispose();
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

// characters: meshes only (animations live in one shared file)
for (const name of ['Rogue', 'Rogue_Hooded', 'Knight', 'Barbarian']) {
  const doc = await io.read(path.join(CH, 'Characters/gltf', name + '.glb'));
  const root = doc.getRoot();
  const removed = [];
  for (const n of root.listNodes()) if (WEAPON_NODES.includes(n.getName())) { removed.push(n.getName()); n.dispose(); }
  for (const a of root.listAnimations()) dropAnim(a);
  await doc.transform(prune(), dedup(), squeeze());
  await io.write(path.join(OUT, name.toLowerCase() + '.glb'), doc);
  console.log(name, 'removed', removed.join(','));
}
// shared animations from the Rogue rig
{
  const doc = await io.read(path.join(CH, 'Characters/gltf/Rogue.glb'));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP_ANIMS.includes(a.getName())) dropAnim(a);
  for (const m of root.listMeshes()) m.dispose();
  await doc.transform(prune({ keepLeaves: true }), dedup(), resample(), squeeze());
  await io.write(path.join(OUT, 'anims.glb'), doc);
}
// tools for villager hands
for (const t of ['axe_1handed', 'sword_1handed', 'shield_round_color', 'shield_badge_color']) {
  const doc = await io.read(path.join(CH, 'Assets/gltf', t + '.gltf'));
  await doc.transform(prune(), dedup(), squeeze());
  await io.write(path.join(OUT, t + '.glb'), doc);
}
// buildings, nature, props
const env = {
  'buildings/blue': ['building_castle_blue', 'building_home_A_blue', 'building_home_B_blue', 'building_lumbermill_blue', 'building_market_blue',
    'building_barracks_blue', 'building_tower_A_blue', 'building_well_blue', 'building_windmill_blue', 'building_blacksmith_blue', 'building_mine_blue',
    'building_tavern_blue', 'building_church_blue', 'building_watermill_blue', 'building_archeryrange_blue', 'building_tower_catapult_blue'],
  'buildings/neutral': ['building_scaffolding', 'building_stage_A', 'building_stage_B', 'building_stage_C', 'building_grain', 'building_dirt',
    'building_destroyed', 'fence_wood_straight', 'fence_wood_straight_gate', 'wall_straight', 'projectile_catapult'],
  'decoration/nature': ['tree_single_A', 'tree_single_B', 'tree_single_A_cut', 'tree_single_B_cut', 'trees_A_small', 'trees_A_medium', 'trees_A_large',
    'trees_B_small', 'trees_B_medium', 'trees_B_large', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E',
    'cloud_big', 'cloud_small', 'waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B', 'mountain_A_grass_trees', 'mountain_B_grass_trees',
    'mountain_C_grass_trees', 'hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'mountain_A', 'hills_A'],
  'decoration/props': ['barrel', 'crate_A_big', 'crate_A_small', 'crate_B_small', 'sack', 'wheelbarrow', 'resource_lumber', 'resource_stone',
    'flag_blue', 'flag_red', 'tent', 'bucket_water', 'pallet', 'crate_long_A', 'weaponrack', 'target', 'ladder'],
};
for (const [dir, names] of Object.entries(env)) {
  for (const n of names) {
    const f = path.join(HX, dir, n + '.gltf');
    if (!fs.existsSync(f)) { console.log('MISSING', f); continue; }
    const doc = await io.read(f);
    await doc.transform(dedup(), prune(), squeeze());
    await io.write(path.join(OUT, n.replace(/_blue$/, '') + '.glb'), doc);
  }
}
fs.copyFileSync(path.join(CH, 'LICENSE.txt'), path.join(OUT, 'LICENSE-KayKit-Adventurers.txt'));
fs.copyFileSync('/home/claude/assets/KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/LICENSE.txt', path.join(OUT, 'LICENSE-KayKit-Medieval-Hexagon.txt'));
console.log('done');
