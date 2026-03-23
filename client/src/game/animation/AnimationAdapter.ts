import type { AnimationAdapterInput, AnimatorFrame, CharacterClipRegistry, PresentationAnimationId } from "@/game/animation/types";

const buildFrame = (clipId: PresentationAnimationId | null, loopMode: AnimatorFrame["loopMode"], playbackRate = 1): AnimatorFrame => ({
  clipId,
  loopMode,
  fadeDuration: clipId === "attack" || clipId === "cast" ? 0.1 : 0.14,
  playbackRate,
});

export class AnimationAdapter {
  private pickClip(registry: CharacterClipRegistry, candidates: PresentationAnimationId[]) {
    return candidates.find((candidate) => registry.descriptors[candidate]) ?? null;
  }

  buildFrame(input: AnimationAdapterInput, registry: CharacterClipRegistry): AnimatorFrame {
    if (input.isDead) {
      return buildFrame(this.pickClip(registry, ["death", "hit", "idle"]), "once");
    }
    if (input.isDowned) {
      return buildFrame(this.pickClip(registry, ["hit", "guard", "idle"]), "loop");
    }
    if (input.isCasting) {
      return buildFrame(
        this.pickClip(
          registry,
          input.stanceFamily === "bow" ? ["draw", "cast", "release", "idle"] : ["cast", "block", "guard", "idle"],
        ),
        "once",
      );
    }
    if (input.isAttacking) {
      return buildFrame(this.pickClip(registry, ["attack", "release", "guard", "idle"]), "once");
    }

    const { locomotion } = input;
    switch (locomotion.locomotionMode) {
      case "sprint":
      case "move":
        return buildFrame(this.pickClip(registry, ["run", "idle"]), "loop", Math.max(0.85, locomotion.speedNormalized));
      case "strafe":
        return buildFrame(
          this.pickClip(
            registry,
            locomotion.desiredLocalMoveDirection.x >= 0 ? ["walkLeft", "runLeft", "run"] : ["walkRight", "runRight", "run"],
          ),
          "loop",
          Math.max(0.8, locomotion.speedNormalized),
        );
      case "backpedal":
        return buildFrame(
          this.pickClip(registry, ["walkBack", "runBack", "run"]),
          "loop",
          Math.max(0.8, locomotion.speedNormalized),
        );
      case "turnInPlace":
      case "idle":
      default:
        return buildFrame(this.pickClip(registry, ["idle", "guard"]), "loop");
    }
  }
}
