# Prototype V0 Architecture

## Module layout
- `client/`: React + Three.js browser runtime.
- `client/src/config`: feature flags and environment toggles.
- `client/src/game`: curated asset bindings, shared combat definitions, authority runtime, math helpers, arena data, asset loading, and input-targeting helpers.
- `client/src/components`: scene rendering and HUD presentation driven by authority snapshots.
- `docs/`: V0 implementation status and architecture notes.

## Presentation layer seams
- Curated model loading now lives in `client/src/game/assets/loader.ts`.
- That loader owns FBX/GLTF file handling, per-model caching, normalization, and per-instance cloning so the scene components do not need file-format knowledge.
- Arena layout data now lives in `client/src/game/environment/arena.ts`; rendering consumes the data-driven arena definition instead of hardcoding obstacle geometry in the scene.
- The HUD lives in `client/src/components/HUD/CombatHUD.tsx` and reads snapshots only; it does not mutate simulation state directly beyond invoking existing authority intents.
- The live-ops diagnostics panel is presentation-only: `CombatScene` samples renderer stats and reports them upward, while the viewport UI simply displays the metrics.

## Combat state ownership
- V0 will keep gameplay state in one authoritative simulation module.
- React components will render snapshots and submit intents only.
- This preserves a clean handoff to a future network transport or SpacetimeDB-backed server.
  The current implementation lives in `client/src/game/engine.ts` and exposes subscribe/getSnapshot/mutation APIs.
- The client loop now advances that authority with a fixed 60 Hz step instead of simulating directly from raw `requestAnimationFrame` delta so gameplay cost is bounded on high-refresh displays.
- Snapshot publication is intentionally throttled in the authority layer, and the large debug shell can lag slightly behind via deferred rendering without affecting the main gameplay/HUD path.

## Spell pipeline overview
- Planned path: input intent -> validation -> target resolution -> shared effect application -> feedback event emission.
- Current runtime path: hotkey/click intent -> `commandLeaderSpell` -> authority validation -> cast state -> projectile/area/line resolution -> shared damage/heal/shield/status application -> floating-text feedback.

## Order system overview
- Orders will change AI goals and priority weights rather than manually steering units every frame.
- Targeting scopes will support all companions, archetype groups, and custom groups.
- Current implementation supports all companions, archetype scopes, and custom `alpha`/`bravo` scopes through `issueScopedOrder`.
- Ground-target area orders now use `client/src/game/input/orderTargeting.ts` as a thin client-side state machine: enter targeting mode -> preview ground point -> confirm anchor -> submit the existing authority intent.

## AI behavior overview
- V0 AI will use stance plus compact priority rules and a fallback rotation chain.
- Companion and enemy logic will share the same combat action evaluation code where possible.
- Current behavior editing changes profile, custom group, and heal/retreat thresholds on live companion AI.

## Data definition structure
- Implemented definitions: `UnitDefinition`, `WeaponDefinition`, `SpellDefinition`, `EffectDefinition`, `OrderDefinition`, `RewardDefinition`, `BehaviorProfileDefinition`, and `SpellLoadoutDefinition`.
- `UnitDefinition` now carries a presentation identifier so role-based character visuals stay data-driven instead of being hardcoded in the scene.
- V0 content is already declared as data first and will be consumed by shared resolution code.

## Future extension notes
- Replace the local authority transport with a real server adapter when the Rust/SpacetimeDB toolchain is available.
- Move definitions into a shared package once the client and server both compile in this repo.
- Add an authority event stream or equivalent bridge for audio/feedback systems so UI polish remains presentation-only.
- Finish the audio/debug/test passes and the remaining combat-feedback work while keeping the authority/data layers unchanged.
