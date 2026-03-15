import type { Vec3 } from "@/game/defs";

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const subVec3 = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scaleVec3 = (value: Vec3, scalar: number): Vec3 =>
  vec3(value.x * scalar, value.y * scalar, value.z * scalar);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const length2D = (value: Vec3) => Math.hypot(value.x, value.z);

export const distance2D = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

export const normalize2D = (value: Vec3): Vec3 => {
  const magnitude = length2D(value);
  if (magnitude <= 0.0001) {
    return vec3();
  }

  return vec3(value.x / magnitude, 0, value.z / magnitude);
};

export const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha;

export const yawToDirection = (yaw: number): Vec3 => vec3(Math.sin(yaw), 0, Math.cos(yaw));

export const directionToYaw = (direction: Vec3) => Math.atan2(direction.x, direction.z);

export const withY = (value: Vec3, y: number): Vec3 => vec3(value.x, y, value.z);

export const moveToward = (current: Vec3, target: Vec3, maxDistance: number): Vec3 => {
  const delta = subVec3(target, current);
  const magnitude = length2D(delta);
  if (magnitude <= maxDistance || magnitude <= 0.0001) {
    return { ...target };
  }

  const direction = scaleVec3(normalize2D(delta), maxDistance);
  return addVec3(current, direction);
};

export const roundVec3 = (value: Vec3, precision = 100) =>
  vec3(
    Math.round(value.x * precision) / precision,
    Math.round(value.y * precision) / precision,
    Math.round(value.z * precision) / precision,
  );
