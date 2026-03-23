import type { StanceFamilyId } from "@/game/equipment/schema";
import { directionToYaw, inverseRotateVectorByYaw, length2D, shortestAngleDelta, vec3 } from "@/game/math";
import type { LocomotionResolverConfig } from "@/game/locomotion/config";
import type { FacingMode, InputIntentState, LocomotionMode, ResolvedLocomotionState } from "@/game/locomotion/types";

export class LocomotionResolver {
  private lastMode: LocomotionMode = "idle";

  constructor(private readonly config: LocomotionResolverConfig) {}

  resolve(intent: InputIntentState, _stanceFamily: StanceFamilyId, currentYaw: number): ResolvedLocomotionState {
    const hasMoveIntent = intent.hasMoveIntent && intent.desiredMagnitude > 0;
    const desiredFacingMode: FacingMode = intent.isAiming
      ? "faceAimDirection"
      : hasMoveIntent
        ? "faceMoveDirection"
        : "lockedFacing";
    const targetYaw =
      desiredFacingMode === "faceAimDirection"
        ? intent.cameraYaw
        : desiredFacingMode === "faceMoveDirection" && hasMoveIntent
          ? directionToYaw(intent.moveIntentWorldSpace)
          : currentYaw;
    const desiredLocalMoveDirection = hasMoveIntent
      ? inverseRotateVectorByYaw(intent.moveIntentWorldSpace, targetYaw)
      : vec3();

    let locomotionMode: LocomotionMode = "idle";
    let desiredSpeed = 0;
    let shouldRotate = false;
    let shouldTranslate = hasMoveIntent;

    if (!hasMoveIntent) {
      const yawDelta = shortestAngleDelta(currentYaw, targetYaw);
      if (
        intent.isAiming &&
        (Math.abs(yawDelta) >= this.config.turnInPlaceYawThreshold ||
          (this.lastMode === "turnInPlace" && Math.abs(yawDelta) >= this.config.turnInPlaceExitThreshold))
      ) {
        locomotionMode = "turnInPlace";
        shouldRotate = true;
      }
    } else if (intent.isAiming) {
      shouldRotate = true;
      if (desiredLocalMoveDirection.z <= this.config.backpedalDeadZone) {
        locomotionMode = "backpedal";
        desiredSpeed = this.config.movementSpeed * this.config.backpedalSpeedMultiplier * intent.desiredMagnitude;
      } else if (Math.abs(desiredLocalMoveDirection.x) >= this.config.strafeDeadZone) {
        locomotionMode = "strafe";
        desiredSpeed = this.config.movementSpeed * this.config.strafeSpeedMultiplier * intent.desiredMagnitude;
      } else {
        locomotionMode = "move";
        desiredSpeed = this.config.movementSpeed * this.config.aimSpeedMultiplier * intent.desiredMagnitude;
      }
    } else {
      shouldRotate = true;
      const forwardDominant =
        desiredLocalMoveDirection.z >= this.config.sprintForwardBias &&
        desiredLocalMoveDirection.z >= Math.abs(desiredLocalMoveDirection.x);
      if (intent.isSprinting && forwardDominant) {
        locomotionMode = "sprint";
        desiredSpeed = this.config.sprintSpeed * intent.desiredMagnitude;
      } else {
        locomotionMode = "move";
        desiredSpeed = this.config.movementSpeed * intent.desiredMagnitude;
      }
    }

    if (locomotionMode === "turnInPlace") {
      shouldTranslate = false;
    }

    if (!shouldTranslate || length2D(intent.moveIntentWorldSpace) <= 0.0001) {
      desiredSpeed = 0;
    }

    this.lastMode = locomotionMode;

    return {
      locomotionMode,
      desiredFacingMode,
      desiredWorldMoveDirection: shouldTranslate ? intent.moveIntentWorldSpace : vec3(),
      desiredLocalMoveDirection,
      desiredSpeed,
      shouldRotate,
      shouldTranslate,
      targetYaw,
    };
  }
}
