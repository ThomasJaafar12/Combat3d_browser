import type { CharacterPresentationId } from "@/game/defs";
import type { CharacterClipDescriptor, CharacterClipRegistry, ClipRegistration } from "@/game/animation/types";

const buildCapabilities = (descriptors: Partial<Record<string, CharacterClipDescriptor>>) => ({
  hasLocomotionDirections: Boolean(descriptors.runLeft && descriptors.runRight),
  hasStrafeWalk: Boolean(descriptors.walkLeft && descriptors.walkRight),
  hasBackpedal: Boolean(descriptors.walkBack || descriptors.runBack),
});

export class ClipRegistry {
  registerClipSet(
    presentationId: CharacterPresentationId,
    descriptors: CharacterClipDescriptor[],
  ): CharacterClipRegistry {
    const descriptorMap = Object.fromEntries(
      descriptors.map((descriptor) => [descriptor.registration.id, descriptor]),
    ) as Partial<Record<ClipRegistration["id"], CharacterClipDescriptor>>;

    return {
      presentationId,
      descriptors: descriptorMap,
      diagnostics: Object.fromEntries(
        descriptors.map((descriptor) => [descriptor.registration.id, descriptor.report]),
      ) as CharacterClipRegistry["diagnostics"],
      capabilities: buildCapabilities(descriptorMap),
    };
  }
}
