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
- Curated arena GLTFs used by the prototype were simplified to remove broken external material texture references, and a clean dev-server validation no longer emits the previous environment texture warnings.
- A presentation-layer audio bridge now lives in `client/src/game/audio/audioSystem.ts`; it preloads cues, follows the listener/camera, and plays fail-soft UI/combat audio without altering combat rules.
- The authority now exposes transient presentation events for combat/UI feedback, allowing audio and lightweight visual polish to subscribe without coupling rendering back into the simulation.
- Automated smoke coverage now includes companion recruiting, battle start, placed area orders, ground spell casting, revive flow, wave clear, and reward selection through `tests/combat.smoke.ts`.
- The debug/live-ops pass now includes runtime toggles for god mode, cooldown bypass, AI labels, fast-forward, debug spawning, forced downed allies, and wave clearing.
- Combat feedback polish now includes status icons, lightweight floating-hit/reward sprites, and in-scene AI state labels behind the existing debug flag.
- Required documentation initialized.

## Incomplete systems
- Third-person camera readability still needs another pass around close-quarters obstacle occlusion and tighter framing near large props.
- The build currently ships as one large client chunk; code-splitting has not been tackled yet.

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
- Run `npm.cmd run smoke -- http://127.0.0.1:5173` in `client/` for the end-to-end smoke path, or run the Playwright client against a Vite dev instance such as `http://127.0.0.1:5173` with `#start-battle` as the click selector for screenshot/state validation.

## Setup / run
- `cd client`
- `npm.cmd install`
- `npm.cmd run dev`
- Open `http://127.0.0.1:5173`

## Next recommended steps
- Improve third-person camera occlusion handling so large props like the archway do not dominate the frame during close movement.
- Split the heaviest client bundle paths now that the runtime systems are stable enough to profile loading cost separately from simulation cost.
- Expand the smoke path further with direct assertions on audio/debug toggle side effects and companion autonomy during a full live wave.
- Add richer but still lightweight hit/VFX responses only after the camera visibility pass is done.

## Known issues
- Close-range camera framing can still be partially blocked by large arena props during certain movements.
- The production build still triggers Vite's large-chunk warning and should eventually be split for better load behavior.

## Commit notes
- Commit 1: audited the repo, confirmed the assets-only branch state, mapped the curated asset set, scaffolded the client runtime, added feature flags, and initialized the required docs.
- Commit 2: defined the shared combat catalog for V0 content, centralized curated asset references, and verified the catalog summary through the browser test hooks.
- Commit 3: introduced the authoritative combat runtime, arena layout data, and a debug shell that reads and mutates live combat state.
- Commit 4+: expanded the prototype into a playable scene with player movement, targeting, spell arming, scoped orders, behavior editing, and replayable reward application.
- Current slice after Commit 4+: added the presentation asset loader, data-driven environment module, curated scene assets, area-order targeting mode, dedicated viewport HUD, and a battlefield-aware camera pass.
- Current runtime slice: corrected third-person controls/orientation, fixed-step local simulation, live-ops diagnostics, and the first round of CPU/GPU/compositing optimizations.
- Current polish slice: cleaned active arena asset warnings, added a presentation-only audio/event bridge, expanded smoke coverage, added compact debug tools, and improved lightweight status/hit feedback.
