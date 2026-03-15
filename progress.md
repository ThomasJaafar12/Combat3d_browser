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

## TODO
- Build shared combat schemas and content definitions.
- Implement the authoritative combat engine core before presentation features.
- Replace the placeholder scene with the actual encounter map and third-person controller.
