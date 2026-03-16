Original prompt: Build a 3D in-browser RPG combat prototype with a leader, three-slot spell loadout, autonomous companions, group orders, shared authoritative combat systems, reward flow, required docs, and disciplined commit slices.

## Progress log
- Audited the repo: this branch contains curated assets only, not the referenced starter runtime.
- Cloned the referenced starter into `starter_reference/` for architecture reference only; it is not part of the target deliverable.
- Confirmed local Node is available, but Rust and SpacetimeDB are not installed in this environment.
- Decided on a V0 path: React/R3F client plus a clean authoritative simulation boundary that can later be swapped to the intended server layer.
- Commit 1 target: scaffold `client/`, add feature flags, initialize docs, and record the asset map before combat implementation begins.
- Verified Commit 1 with `npm.cmd run build`.
- Started the Vite dev server and ran the required Playwright verification loop against `http://127.0.0.1:5173`.
- Added `window.render_game_to_text` and `window.advanceTime` hooks so later combat work stays testable.
- Fixed an initial camera/framing issue after the first screenshot came back visually blank; the latest screenshot now shows the scaffold geometry and label correctly.
- Added shared schema definitions for factions, units, weapons, spells, statuses, orders, rewards, loadouts, and behavior profiles.
- Added centralized curated asset URL bindings so the upcoming runtime can consume existing assets without duplicating them.
- Added the first V0 content catalog: 7 units, 7 weapons, 9 spells, 7 statuses, 6 orders, 6 rewards, and 3 behavior profiles.
- Updated `render_game_to_text` to expose the shared catalog summary for browser verification.
- Added runtime math helpers, arena/map data, and the first authoritative combat engine class.
- The app shell now subscribes to live authority snapshots instead of rendering only static scaffold text.
- Engine foundation covers encounter reset, recruit/start-battle flows, HP/resource/cooldown ticking, shield/status upkeep, downed/death transitions, XP gain, and reward choice gating.
- Replaced the static canvas with a live combat scene that renders units, obstacles, zones, projectiles, floating text, and a third-person follow camera.
- Added leader input plumbing: WASD/arrow movement, right-drag camera, click-to-select/basic attack, spell arming on `1-3`, and revive on `R`.
- Added scoped companion orders (`all`, archetype groups, custom groups) and a functional behavior editor for stance/profile, custom group, and heal/retreat thresholds.
- Reward choices now apply persistent run bonuses and return the player to loadout for replay instead of acting as dead-end UI.

## TODO
- Tighten scene readability and replace primitive runtime meshes with curated FBX/GLTF presentation where practical.
- Add richer HUD/audio feedback and verify the full recruit/companion/order loop with broader automated coverage.
