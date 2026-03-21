# Attachment Pipeline V1

## Purpose

The browser combat prototype now uses an explicit attachment pipeline instead of direct scene-level bone parenting.

The core flow is:

1. `client/src/game/equipment/catalog.ts` defines rig profiles, item definitions, stance profiles, and attachment profiles.
2. `client/src/game/equipment/system.ts` owns pure equipment state, stance resolution, and visible binding resolution.
3. `client/src/game/equipment/runtime.ts` owns clone-safe rig adapters, socket creation, marker resolution, and scene binding.
4. `client/src/components/CombatScene.tsx` consumes those modules and never attaches equipment by raw bone-name search.

## Runtime contract

- `equipmentState.activeSlots` drives visible equipped items.
- `equipmentState.storageSlots` drives visible stowed items.
- `resolveVisibleEquipmentView(...)` is the only supported way to turn equipment state into socket bindings.
- `CharacterRigAdapter` is the only supported runtime API for raw bones and sockets.
- `bindEquipmentModelToSocket(...)` is the only supported runtime API for parenting item instances.

## Debug tooling

The battle debug panel now includes an attachment lab:

- inspect a live unit
- toggle socket axes, marker axes, and skeleton visualization
- inspect resolved rig/socket bindings
- edit attachment profile offsets live
- persist overrides in localStorage for iteration

## Guardrails

- Do not add new attachment transforms to `content.ts`, `engine.ts`, or arbitrary scene components.
- Do not attach meshes directly to bones outside `runtime.ts`.
- Do not add silent socket fallbacks.
- When a new item is introduced, add catalog data first, then validate it in the live attachment lab.
