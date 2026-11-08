# 🏰 City Building

An educational city-building game for a 6-year-old: gather resources, grow a village, and advance through the ages, answering math, reading, spelling and science questions along the way.

See [DESIGN.md](DESIGN.md) for the full game design and build phases.

## Play
- **Online:** https://deazy55555.github.io/City_Building/ (after GitHub Pages is turned on, see below)
- **On this computer:** `npm install`, then `npm run dev` and open the link it prints.

## Controls
| Action | How |
|---|---|
| Pick a villager | Click them (drag a box to pick many) |
| Give a job | Click a tree, berry bush, rock, gold or deer |
| Train villagers / research | Click the Town Center |
| Move the camera | W A S D, arrow keys, or drag with the right mouse button |
| Zoom / turn | Mouse wheel / Q and E |
| Find idle villagers | The 😴 button or the `.` key |

## Turning on GitHub Pages (one time)
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every push to `main` then rebuilds the game.

## Tech
Vite + TypeScript + Three.js. Saves are kept in the browser on that computer (localStorage).
