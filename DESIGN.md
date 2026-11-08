# City Building — Design Doc

An educational city-builder for a 6-year-old (kindergarten, reading/math at about a 1st-grade level).
It blends Age of Empires (live map, walking villagers, armies that attack) with Forge of Empires (nice-looking buildings, advancing through the ages, timers).
It's played on a laptop in a web browser with a mouse and keyboard.

## Core rules
- **He can't lose.** Attacks never destroy the town. The Town Center (TC) can be damaged but never breaks and always stays working.
- **Questions decide what he gets. Timers decide how fast.**
- **Every attempt costs resources, right or wrong.** Resources are spent when he submits an answer. A wrong answer shows the correct one with a short "here's why," but the resources are gone. He has to gather more before trying again, so guessing over and over doesn't pay; taking his time does.
- **Time only passes while he's playing.** The game saves when he stops and nothing happens in the background. The game also pauses when the tab is hidden.
- **Safety net:** the TC always keeps a few villagers, and running out of food makes villagers work slower but never kills them. A bad raid can't leave him stuck.

## What each subject unlocks
| Subject | Unlocks |
|---|---|
| Math | Soldiers and towers (Phase 1: also buildings) |
| Reading, spelling, comprehension | Villagers (trained at the TC) |
| Science | Research and advancing to the next age |
| Mixed | Repairs (plus resources and workers) |
| "Boss" questions (harder) | General Sam's upgrades and the rocket parts |

Reading: all words are at about a 1st-grade level, and passages run 1–3 sentences up to a short paragraph. Any word can be clicked to hear it read aloud. For spelling, he hears the word and builds it from letter tiles.
Difficulty adapts within each age based on his accuracy.

## Economy
- Resources: food, wood, stone and gold. Food comes from berry bushes, farms and hunting animals.
- Villagers walk to resources, gather them, and carry them back to the TC or a Storehouse.
- Villagers eat food. With no food they work at half speed, and they never die from it.
- Storage caps stop stockpiling, and Storehouses raise the cap.
- Houses raise the population limit.
- Fog of war covers the map. Scouts explore it, and later-age resources appear farther out.
- Later: a second settlement, with trade carts or ships running between towns.

## Attacks & General Sam
- Enemy armies arrive on a schedule (only while he's playing). They fight towers, soldiers and buildings, or go straight for the TC.
- Villagers and soldiers can die. Damaged buildings stop working until they're repaired, which takes a question, resources and workers.
- When the TC's health is nearly gone, **General Sam** (the name can be changed) charges out and fights a short battle scene with the attackers. He always wins. Upgrades from boss questions give him new armor and bigger moves, so he wins faster.

## Ages and difficulty
The game starts at about a mid-Iron-Age level and gets harder from there. Each age takes about 4–5 hours of play (about a week).

| # | Age | Math | Reading | Science |
|---|---|---|---|---|
| 1 | Stone | Add/subtract within 20 | Sight words, 2-sentence stories, CVC spelling | Plants & animals |
| 2 | Bronze | Add/subtract within 20, missing numbers | 2–3 sentences, blends | Rocks & materials |
| 3 | Iron | Tens to 100, skip count by 2, 5, 10 | 3 sentences, digraphs | Magnets |
| 4 | Medieval | 2-digit add/subtract, no regrouping | Short paragraphs | Weather |
| 5 | Age of Sail | Multiplying as equal groups (2s, 5s, 10s) | Paragraphs, long vowels | Floating & sinking |
| 6 | Industrial | 2-digit with regrouping | Paragraph + "why" questions | Pushes, pulls, machines |
| 7 | Modern | Times tables to 5, 3-digit add | Longer paragraphs | Electricity & sound |
| 8 | Space | Times tables to 12, 3-digit add/subtract | Full-paragraph comprehension | Sun, moon, planets |

## The ending
In the Space Age he builds a launch pad and **five rocket parts**. Each part takes resources plus one boss question, one for each subject.
When the rocket is finished, a countdown starts and the biggest army of the game attacks. His army holds them off, or General Sam does, until the countdown ends.
Then the rocket lifts off, his civilization becomes **interplanetary**, and he sees his victory stats. The empire stays open so he can keep playing. A "Moon Colony" add-on could come later.

### Phase 2 numbers (tuning)
- First raid after 8 minutes of play, then every 7–9 minutes. Warning 45 seconds before. Raid size grows each wave (2, 4, 5, 6 …, max 14).
- Raiders attack defenders and villagers near them, then buildings, then the Town Center. A raid that lasts over 100 seconds also brings Sam.
- General Sam comes out when the Town Center drops to 30% health. He can't be hurt. Levels 1–5 (boss questions) make him faster and stronger and change his look.
- Soldier: 40 food + 20 gold, math question. Scout: 60 food, reading question. Barracks: 120 wood + 40 stone. Watch Tower: 40 wood + 80 stone.
- Broken buildings stop working until repaired (about 35% of their cost + a mixed question + villagers to do the work).
- The bell hides villagers in the Town Center, where they heal. The town always keeps at least 3 villagers.
- Fog of war: the area around the Town Center starts explored; villagers, soldiers and scouts uncover more.

## Parent screen (PIN)
His accuracy by skill, a difficulty adjustment, timer speed, an optional daily play limit (off by default), and the read-aloud voice.

## Tech
- Vite + TypeScript + Three.js (3D, fixed angled camera, scroll to zoom, drag or WASD to pan).
- Models: KayKit (CC0) animated characters, buildings, trees, rocks and scenery. Deer and berry bushes are still built in code.
- Graphics: day/night cycle (10 minutes of play), drifting clouds, birds, jumping fish, animated water with shore foam,
  textured ground with dirt paths that wear in where villagers walk, swaying trees and grass, chimney smoke, falling trees,
  dust and confetti. High / Medium / Low setting (auto steps down if slow).
- Saves are kept in the browser's localStorage on that laptop.
- Read-aloud uses the browser's speech voices, and the game picks the most natural-sounding English voice available.
- Hosted on GitHub Pages.

## Build phases
1. ✅ **Playable Stone Age:** map, villagers gathering, hunting, TC, houses, farms, storehouse, timers, the question engine, and the resources-per-attempt rule. Save and load.
2. ✅ Attacks, towers, soldiers, General Sam, damage and repairs, fog of war and scouts.
3. Ages 2–4, science research, advancing ages, and the content bank.
4. Ages 5–8, the rocket finale, the parent screen, second settlements and trade, sound and polish.
