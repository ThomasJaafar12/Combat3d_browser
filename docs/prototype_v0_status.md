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
- Required documentation initialized.

## Incomplete systems
- No playable encounter, spells, companions, orders, or rewards yet.

## Temporary shortcuts
- The repository branch did not contain the referenced starter runtime, only curated assets.
- Local Rust and SpacetimeDB tooling are unavailable in this environment, so V0 will use a local authoritative simulation boundary first and keep the transport seam ready for later server replacement.

## Blockers
- None for the browser-playable V0 slice.
- Full SpacetimeDB parity is blocked by missing local toolchain until Rust and `spacetime` are installed.

## Test instructions
- Install dependencies in `client/`.
- Start the Vite dev server with `npm.cmd run dev`.
- Confirm the scaffold scene and left-side audit panel render.

## Next recommended steps
- Build the authoritative combat engine before adding client presentation details.
- Replace the scaffold scene with the encounter map and third-person controller.
  The core engine now exists; the next work is hooking movement, attacks, casts, and scene interactions into it.

## Commit notes
- Commit 1: audited the repo, confirmed the assets-only branch state, mapped the curated asset set, scaffolded the client runtime, added feature flags, and initialized the required docs.
- Commit 2: defined the shared combat catalog for V0 content, centralized curated asset references, and verified the catalog summary through the browser test hooks.
- Commit 3: introduced the authoritative combat runtime, arena layout data, and a debug shell that reads and mutates live combat state.
