# Prototype V0 Architecture

## Module layout
- `client/`: React + Three.js browser runtime.
- `client/src/config`: feature flags and environment toggles.
- `client/src/game`: curated asset bindings, shared combat definitions, authority runtime, math helpers, and arena data.
- `client/src/components`: scene rendering and camera presentation driven by authority snapshots.
- `docs/`: V0 implementation status and architecture notes.

## Combat state ownership
- V0 will keep gameplay state in one authoritative simulation module.
- React components will render snapshots and submit intents only.
- This preserves a clean handoff to a future network transport or SpacetimeDB-backed server.
  The current implementation lives in `client/src/game/engine.ts` and exposes subscribe/getSnapshot/mutation APIs.

## Spell pipeline overview
- Planned path: input intent -> validation -> target resolution -> shared effect application -> feedback event emission.
- Current runtime path: hotkey/click intent -> `commandLeaderSpell` -> authority validation -> cast state -> projectile/area/line resolution -> shared damage/heal/shield/status application -> floating-text feedback.

## Order system overview
- Orders will change AI goals and priority weights rather than manually steering units every frame.
- Targeting scopes will support all companions, archetype groups, and custom groups.
- Current implementation supports all companions, archetype scopes, and custom `alpha`/`bravo` scopes through `issueScopedOrder`.

## AI behavior overview
- V0 AI will use stance plus compact priority rules and a fallback rotation chain.
- Companion and enemy logic will share the same combat action evaluation code where possible.
- Current behavior editing changes profile, custom group, and heal/retreat thresholds on live companion AI.

## Data definition structure
- Implemented definitions: `UnitDefinition`, `WeaponDefinition`, `SpellDefinition`, `EffectDefinition`, `OrderDefinition`, `RewardDefinition`, `BehaviorProfileDefinition`, and `SpellLoadoutDefinition`.
- V0 content is already declared as data first and will be consumed by shared resolution code.

## Future extension notes
- Replace the local authority transport with a real server adapter when the Rust/SpacetimeDB toolchain is available.
- Move definitions into a shared package once the client and server both compile in this repo.
- Swap primitive scene rendering for curated FBX/GLTF presentation while keeping the authority/data layers unchanged.
