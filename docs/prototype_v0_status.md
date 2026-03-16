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
- Third-person scene renders live units, obstacles, floating combat feedback, target rings, and a follow camera.
- Leader movement, basic-attack targeting, spell hotkeys, scoped party orders, and companion behavior editing are wired into the authority layer.
- Reward selection now applies run bonuses and returns to loadout so the encounter can be replayed.
- Required documentation initialized.

## Incomplete systems
- Curated 3D assets are referenced centrally but the scene still uses primitive runtime meshes instead of loaded FBX/GLTF presentation.
- Order targeting currently uses the leader position as the default anchor instead of a dedicated click-to-place area order flow.
- Audio hooks and fuller HUD readability still need another pass.

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
- In the scene, use `WASD` or arrow keys to move, right-drag to orbit the camera, left-click enemies to select/basic-attack, press `1-3` to arm spells, and press `R` to revive a downed companion in range.
- Run the Playwright client against `http://127.0.0.1:5173` with `#start-battle` as the click selector for the current automated smoke path.

## Setup / run
- `cd client`
- `npm.cmd install`
- `npm.cmd run dev`
- Open `http://127.0.0.1:5173`

## Next recommended steps
- Replace primitive scene meshes with curated character/environment assets where practical.
- Add clearer HUD/readability for cooldowns, companion states, and applied rewards.
- Expand automated smoke coverage to recruit companions and exercise scoped orders/behavior changes before battle.

## Known issues
- The scene currently renders primitive meshes instead of the curated FBX/GLTF models, so presentation is functional rather than polished.
- Camera readability is improved but still needs another pass for obstacle-heavy angles and wider battlefield framing.
- The current automated smoke path starts the battle and advances time, but it does not yet automate companion recruiting or scoped-order changes through the side panel.

## Commit notes
- Commit 1: audited the repo, confirmed the assets-only branch state, mapped the curated asset set, scaffolded the client runtime, added feature flags, and initialized the required docs.
- Commit 2: defined the shared combat catalog for V0 content, centralized curated asset references, and verified the catalog summary through the browser test hooks.
- Commit 3: introduced the authoritative combat runtime, arena layout data, and a debug shell that reads and mutates live combat state.
- Commit 4+: expanded the prototype into a playable scene with player movement, targeting, spell arming, scoped orders, behavior editing, and replayable reward application.
