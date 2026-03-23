import type { Vec3 } from "@/game/defs";
import { addVec3, length2D, moveToward, normalize2D, scaleVec3, vec3 } from "@/game/math";
import type { CharacterMotorConfig } from "@/game/locomotion/config";
import type { CharacterMotorState, ResolvedLocomotionState } from "@/game/locomotion/types";

export interface CharacterMotorCollisionHooks {
  resolvePosition: (rawPosition: Vec3) => Vec3;
}

export class CharacterMotor {
  constructor(private readonly config: CharacterMotorConfig) {}

  createState(position: Vec3): CharacterMotorState {
    return {
      position: { ...position },
      velocity: vec3(),
      desiredVelocity: vec3(),
      lastNonZeroMoveDirection: vec3(0, 0, 1),
    };
  }

  teleport(state: CharacterMotorState, position: Vec3) {
    state.position = { ...position };
    state.velocity = vec3();
    state.desiredVelocity = vec3();
  }

  applyExternalDisplacement(state: CharacterMotorState, displacement: Vec3, hooks: CharacterMotorCollisionHooks, dtSeconds: number) {
    const resolvedPosition = hooks.resolvePosition(addVec3(state.position, displacement));
    state.velocity = dtSeconds > 0 ? scaleVec3(vec3(resolvedPosition.x - state.position.x, 0, resolvedPosition.z - state.position.z), 1 / dtSeconds) : vec3();
    state.position = resolvedPosition;
  }

  step(
    state: CharacterMotorState,
    resolved: ResolvedLocomotionState,
    dtSeconds: number,
    hooks: CharacterMotorCollisionHooks,
  ): CharacterMotorState {
    const desiredVelocity = resolved.shouldTranslate
      ? scaleVec3(normalize2D(resolved.desiredWorldMoveDirection), resolved.desiredSpeed)
      : vec3();
    const acceleration =
      resolved.locomotionMode === "sprint" ? this.config.sprintAcceleration : this.config.acceleration;
    const maxDelta = (length2D(desiredVelocity) > length2D(state.velocity) ? acceleration : this.config.deceleration) * dtSeconds;
    const nextVelocity = moveToward(state.velocity, desiredVelocity, maxDelta);
    const nextPosition = hooks.resolvePosition(addVec3(state.position, scaleVec3(nextVelocity, dtSeconds)));
    const resolvedVelocity =
      dtSeconds > 0
        ? scaleVec3(vec3(nextPosition.x - state.position.x, 0, nextPosition.z - state.position.z), 1 / dtSeconds)
        : vec3();

    state.position = nextPosition;
    state.velocity = resolvedVelocity;
    state.desiredVelocity = desiredVelocity;
    if (length2D(resolved.desiredWorldMoveDirection) > 0.0001) {
      state.lastNonZeroMoveDirection = normalize2D(resolved.desiredWorldMoveDirection);
    }
    return state;
  }
}
