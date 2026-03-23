export interface InputIntentConfig {
  deadZone: number;
}

export interface LocomotionResolverConfig {
  movementSpeed: number;
  sprintSpeed: number;
  aimSpeedMultiplier: number;
  strafeSpeedMultiplier: number;
  backpedalSpeedMultiplier: number;
  sprintForwardBias: number;
  strafeDeadZone: number;
  backpedalDeadZone: number;
  turnInPlaceYawThreshold: number;
  turnInPlaceExitThreshold: number;
}

export interface CharacterMotorConfig {
  acceleration: number;
  deceleration: number;
  sprintAcceleration: number;
}

export interface FacingControllerConfig {
  rotateSpeed: number;
  rotateSpeedAiming: number;
  snapThreshold: number;
}

export interface LocomotionV2Config {
  input: InputIntentConfig;
  resolver: LocomotionResolverConfig;
  motor: CharacterMotorConfig;
  facing: FacingControllerConfig;
}

export const locomotionV2Config: LocomotionV2Config = {
  input: {
    deadZone: 0.18,
  },
  resolver: {
    movementSpeed: 4.4,
    sprintSpeed: 6.6,
    aimSpeedMultiplier: 0.78,
    strafeSpeedMultiplier: 0.9,
    backpedalSpeedMultiplier: 0.72,
    sprintForwardBias: 0.65,
    strafeDeadZone: 0.22,
    backpedalDeadZone: -0.28,
    turnInPlaceYawThreshold: Math.PI * 0.18,
    turnInPlaceExitThreshold: Math.PI * 0.08,
  },
  motor: {
    acceleration: 22,
    deceleration: 28,
    sprintAcceleration: 26,
  },
  facing: {
    rotateSpeed: Math.PI * 5,
    rotateSpeedAiming: Math.PI * 7,
    snapThreshold: Math.PI * 0.006,
  },
};
