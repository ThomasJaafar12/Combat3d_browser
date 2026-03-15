# Prototype V0 Architecture

## Module layout
- `client/`: React + Three.js browser runtime.
- `client/src/config`: feature flags and environment toggles.
- `client/src/game`: curated asset bindings, shared combat definitions, and upcoming authority/scene systems.
- `docs/`: V0 implementation status and architecture notes.

## Combat state ownership
- V0 will keep gameplay state in one authoritative simulation module.
- React components will render snapshots and submit intents only.
- This preserves a clean handoff to a future network transport or SpacetimeDB-backed server.
  The current implementation lives in `client/src/game/engine.ts` and exposes subscribe/getSnapshot/mutation APIs.

## Spell pipeline overview
- Planned path: input intent -> validation -> target resolution -> shared effect application -> feedback event emission.

## Order system overview
- Orders will change AI goals and priority weights rather than manually steering units every frame.
- Targeting scopes will support all companions, archetype groups, and custom groups.

## AI behavior overview
- V0 AI will use stance plus compact priority rules and a fallback rotation chain.
- Companion and enemy logic will share the same combat action evaluation code where possible.

## Data definition structure
- Implemented definitions: `UnitDefinition`, `WeaponDefinition`, `SpellDefinition`, `EffectDefinition`, `OrderDefinition`, `RewardDefinition`, `BehaviorProfileDefinition`, and `SpellLoadoutDefinition`.
- V0 content is already declared as data first and will be consumed by shared resolution code.

## Future extension notes
- Replace the local authority transport with a real server adapter when the Rust/SpacetimeDB toolchain is available.
- Move definitions into a shared package once the client and server both compile in this repo.
