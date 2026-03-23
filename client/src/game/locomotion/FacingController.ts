import { rotateTowardAngle, shortestAngleDelta } from "@/game/math";
import type { FacingControllerConfig } from "@/game/locomotion/config";
import type { FacingControllerState, ResolvedLocomotionState } from "@/game/locomotion/types";

export class FacingController {
  constructor(private readonly config: FacingControllerConfig) {}

  createState(currentYaw: number): FacingControllerState {
    return {
      currentYaw,
      targetYaw: currentYaw,
      yawVelocity: 0,
      facingMode: "lockedFacing",
    };
  }

  snapYaw(state: FacingControllerState, yaw: number, facingMode = state.facingMode) {
    state.currentYaw = yaw;
    state.targetYaw = yaw;
    state.yawVelocity = 0;
    state.facingMode = facingMode;
  }

  step(state: FacingControllerState, resolved: ResolvedLocomotionState, dtSeconds: number, allowInterpolation = true) {
    const previousYaw = state.currentYaw;
    state.targetYaw = resolved.targetYaw;
    state.facingMode = resolved.desiredFacingMode;

    if (!resolved.shouldRotate) {
      state.yawVelocity = 0;
      return state;
    }

    const speed =
      resolved.desiredFacingMode === "faceAimDirection" ? this.config.rotateSpeedAiming : this.config.rotateSpeed;
    const maxDelta = allowInterpolation ? speed * dtSeconds : Number.POSITIVE_INFINITY;
    const nextYaw = rotateTowardAngle(state.currentYaw, state.targetYaw, maxDelta);
    const yawDelta = shortestAngleDelta(previousYaw, nextYaw);
    state.currentYaw = Math.abs(yawDelta) <= this.config.snapThreshold ? state.targetYaw : nextYaw;
    state.yawVelocity = dtSeconds > 0 ? yawDelta / dtSeconds : 0;
    return state;
  }
}
