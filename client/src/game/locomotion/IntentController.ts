import type { Vec3 } from "@/game/defs";
import { clamp, clamp01, length2D, rotateVectorByYaw, vec3 } from "@/game/math";
import type { InputIntentState, IntentSamplingOptions, PlayerInputCommand } from "@/game/locomotion/types";
import type { InputIntentConfig } from "@/game/locomotion/config";

const normalizeCommandAxis = (value: number) => clamp(value, -1, 1);

export class IntentController {
  constructor(private readonly config: InputIntentConfig) {}

  sample(command: PlayerInputCommand, _currentYaw: number, options: IntentSamplingOptions): InputIntentState {
    const rawInputX = normalizeCommandAxis(command.rawInputX);
    const rawInputY = normalizeCommandAxis(command.rawInputY);
    const rawMagnitude = Math.hypot(rawInputX, rawInputY);
    const hasMoveIntent = rawMagnitude > this.config.deadZone;
    const normalizedMagnitude = hasMoveIntent
      ? clamp01((rawMagnitude - this.config.deadZone) / Math.max(1 - this.config.deadZone, 0.0001))
      : 0;
    const cameraSpaceIntent = hasMoveIntent
      ? vec3(rawInputX / rawMagnitude, 0, rawInputY / rawMagnitude)
      : vec3();
    const moveIntentWorldSpace = options.cameraRelativeMovement
      ? rotateVectorByYaw(cameraSpaceIntent, command.cameraYaw)
      : ({ ...cameraSpaceIntent } as Vec3);

    return {
      rawInputX,
      rawInputY,
      moveIntentCameraSpace: cameraSpaceIntent,
      moveIntentWorldSpace,
      desiredMagnitude: normalizedMagnitude,
      isSprinting: command.isSprinting && normalizedMagnitude > 0,
      isAiming: command.isAiming,
      hasMoveIntent: hasMoveIntent && length2D(moveIntentWorldSpace) > 0.0001,
      cameraYaw: command.cameraYaw,
      timestampMs: command.timestampMs,
    };
  }
}
