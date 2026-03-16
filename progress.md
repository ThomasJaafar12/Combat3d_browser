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
- Added `client/src/game/assets/loader.ts` to cache FBX/GLTF presentation assets, normalize them to runtime scale, and clone scene instances without touching simulation logic.
- Moved arena data into `client/src/game/environment/arena.ts`, added a real ground asset, and swapped the scene from primitive capsules/boxes to curated character/environment models with lightweight animation selection.
- Added `client/src/game/input/orderTargeting.ts` and wired `Q` / `H` / `T` plus setup buttons to click-to-place `defend_area`, `hold_position`, and `retreat` anchors.
- Reworked the viewport UI into `client/src/components/HUD/CombatHUD.tsx`, adding a leader panel, companion panel, target panel, reward panel, and a clearer action bar while leaving authority state ownership unchanged.
- Fixed one curated prop asset bug by removing broken texture references from `assets/game/environment/arena_outdoor/props/env_prop_fence_metal_01.gltf`.
- Added a battlefield-aware camera pass that biases framing toward the engagement point, widens default zoom/pitch, and applies lightweight obstacle avoidance instead of only looking a few meters in front of the leader.
- Verified the new slice with repeated `npm.cmd run build` runs and Playwright screenshot/state captures against `http://127.0.0.1:4173`.
- Current validation status: curated models, HUD, and the improved camera render in-browser, but the automated mobile-sized capture still favors the center lane and one GLTF texture warning may still be cached by the running dev server.

## TODO
- Add the audio event bridge/system and wire positional/UI playback without coupling it to simulation logic.
- Expand smoke coverage to recruit companions, place an area order, cast, revive, and clear the wave from Playwright instead of only starting battle.
- Add the debug/stability overlay and the remaining combat-feedback polish (status indicators, hit reactions, lighter-weight VFX).
