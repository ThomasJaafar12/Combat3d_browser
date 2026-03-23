import type { StanceFamilyId } from "@/game/equipment/schema";
import type { Vec3 } from "@/game/defs";

export type LocomotionMode = "idle" | "move" | "sprint" | "strafe" | "backpedal" | "turnInPlace";
export type FacingMode = "faceMoveDirection" | "faceAimDirection" | "lockedFacing";

export interface PlayerInputCommand {
  rawInputX: number;
  rawInputY: number;
  cameraYaw: number;
  isSprinting: boolean;
  isAiming: boolean;
  timestampMs: number;
}

export interface IntentSamplingOptions {
  cameraRelativeMovement: boolean;
}

export interface InputIntentState {
  rawInputX: number;
  rawInputY: number;
  moveIntentCameraSpace: Vec3;
  moveIntentWorldSpace: Vec3;
  desiredMagnitude: number;
  isSprinting: boolean;
  isAiming: boolean;
  hasMoveIntent: boolean;
  cameraYaw: number;
  timestampMs: number;
}

export interface ResolvedLocomotionState {
  locomotionMode: LocomotionMode;
  desiredFacingMode: FacingMode;
  desiredWorldMoveDirection: Vec3;
  desiredLocalMoveDirection: Vec3;
  desiredSpeed: number;
  shouldRotate: boolean;
  shouldTranslate: boolean;
  targetYaw: number;
}

export interface CharacterMotorState {
  position: Vec3;
  velocity: Vec3;
  desiredVelocity: Vec3;
  lastNonZeroMoveDirection: Vec3;
}

export interface FacingControllerState {
  currentYaw: number;
  targetYaw: number;
  yawVelocity: number;
  facingMode: FacingMode;
}

export interface RuntimeInputTelemetry {
  rawInputX: number;
  rawInputY: number;
  desiredMagnitude: number;
  moveIntentCameraSpace: Vec3;
  moveIntentWorldSpace: Vec3;
  timestampMs: number;
}

export interface RuntimeLocomotionTelemetry {
  locomotionMode: LocomotionMode;
  facingMode: FacingMode;
  desiredWorldMoveDirection: Vec3;
  desiredLocalMoveDirection: Vec3;
  currentYaw: number;
  targetYaw: number;
  yawDelta: number;
  desiredSpeed: number;
  actualLocalVelocity: Vec3;
  speedNormalized: number;
  isMoving: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  shouldRotate: boolean;
  shouldTranslate: boolean;
  input: RuntimeInputTelemetry;
}

export interface RuntimePresentationTelemetry {
  activeBaseClip: string | null;
  normalizedClipId: string | null;
  normalizationSummary: string[];
}

export interface RuntimeLocomotionStateSnapshot {
  stanceFamily: StanceFamilyId;
  input: InputIntentState;
  resolved: ResolvedLocomotionState;
  motor: CharacterMotorState;
  facing: FacingControllerState;
}
