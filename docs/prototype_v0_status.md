# Prototype V0 Status

## Implemented systems
- Commit 1 scaffold completed.
- React + Vite client runtime created in `client/`.
- Feature flags added for the V0 combat slice.
- Asset audit completed for curated character, environment, UI, and audio anchors.
- Commit 2 shared content catalog completed.
- Shared schemas added for units, weapons, spells, orders, rewards, statuses, loadouts, and behavior profiles.
- Curated asset references centralized for runtime use.
- Commit 3 authority foundation completed.
- Authoritative runtime now owns combat phase, unit state, HP/resource/cooldowns, statuses, downed/death handling, XP, and reward gating.
- Debug shell is subscribed to live authority snapshots.
- Playable scene pass completed.
- Third-person scene renders live units, obstacles, floating combat feedback, world indicators, and a follow camera.
- Leader movement, basic-attack targeting, spell hotkeys, scoped party orders, and companion behavior editing are wired into the authority layer.
- Reward selection now applies run bonuses and returns to loadout so the encounter can be replayed.
- Curated FBX/GLTF presentation is now wired through `client/src/game/assets/loader.ts` and `client/src/game/environment/arena.ts`.
- Scene rendering now instantiates curated character/environment assets instead of primitive capsules/boxes.
- A dedicated viewport HUD now shows leader resources, companion state, selected target info, reward choices, and clearer spell slot state.
- Ground-target area orders are now placeable through the UI and `Q` / `H` / `T` hotkeys for defend / hold / retreat targeting.
- Third-person controls and orientation are now corrected: movement is camera-relative, `W/A/S/D` map to forward/left/back/right, the character faces the direction of travel/action, and zoom is disabled for now.
- Runtime stepping and diagnostics are now optimized for smoother local play: the client drives the authority with a fixed-step simulation loop, the authority throttles snapshot publication, and the viewport shows a live-ops FPS/frame-time/render-cost panel.
- Movement-time render cost is reduced through lighter canvas settings, scene memoization, and opaque HUD surfaces instead of blur-heavy compositing.
- Required documentation initialized.

## Incomplete systems
- Audio hooks are still not wired to combat/UI events.
- Automated smoke coverage still stops at battle start instead of running the recruit/order/cast/revive/clear loop.
- Debug/stability tooling and the remaining combat-feedback polish are still pending.

## Temporary shortcuts
- The repository branch did not contain the referenced starter runtime, only curated assets.
- Local Rust and SpacetimeDB tooling are unavailable in this environment, so V0 will use a local authoritative simulation boundary first and keep the transport seam ready for later server replacement.

## Blockers
- None for the browser-playable V0 slice.
- Full SpacetimeDB parity is blocked by missing local toolchain until Rust and `spacetime` are installed.

## Test instructions
- Install dependencies in `client/`.
- Start the Vite dev server with `npm.cmd run dev`.
- Use the left-side shell to recruit companions, edit the 3-slot loadout, start the battle, change order scope, and adjust companion behavior.
- In the scene, use `WASD` or arrow keys to move, right-drag to orbit the camera, left-click enemies to select/basic-attack, press `1-3` to arm spells, press `Q` / `H` / `T` to place defend / hold / retreat orders, and press `R` to revive a downed companion in range.
- Run the Playwright client against a Vite dev instance such as `http://127.0.0.1:4173` with `#start-battle` as the click selector for the current automated smoke path.

## Setup / run
- `cd client`
- `npm.cmd install`
- `npm.cmd run dev`
- Open `http://127.0.0.1:5173`

## Next recommended steps
- Remove the remaining GLTF `../materials/` warning so startup/movement-time hitches are narrowed to real scene cost instead of failed asset fetches.
- Add the audio system and bridge combat/UI events into it without pushing presentation logic into the authority.
- Expand automated smoke coverage to recruit companions and exercise placed orders, casting, revive flow, and wave clear.
- Add the remaining compact debug tooling and lightweight combat-feedback polish now that the live-ops overlay is in place.

## Known issues
- One curated environment prop (`env_prop_fence_metal_01.gltf`) had broken texture references in the source curation; the file was patched locally, but an already-running dev server may still cache the old warning until it is restarted.
- Movement-time FPS drops are improved, but any remaining hitching is now more likely tied to asset-loading/startup issues than to normal scene geometry cost.
- The current automated smoke path starts the battle and advances time, but it does not yet automate companion recruiting or placed-order changes through the side panel.

## Commit notes
- Commit 1: audited the repo, confirmed the assets-only branch state, mapped the curated asset set, scaffolded the client runtime, added feature flags, and initialized the required docs.
- Commit 2: defined the shared combat catalog for V0 content, centralized curated asset references, and verified the catalog summary through the browser test hooks.
- Commit 3: introduced the authoritative combat runtime, arena layout data, and a debug shell that reads and mutates live combat state.
- Commit 4+: expanded the prototype into a playable scene with player movement, targeting, spell arming, scoped orders, behavior editing, and replayable reward application.
- Current slice after Commit 4+: added the presentation asset loader, data-driven environment module, curated scene assets, area-order targeting mode, dedicated viewport HUD, and a battlefield-aware camera pass.
- Current runtime slice: corrected third-person controls/orientation, fixed-step local simulation, live-ops diagnostics, and the first round of CPU/GPU/compositing optimizations.
