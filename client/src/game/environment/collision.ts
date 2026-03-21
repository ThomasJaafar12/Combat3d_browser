import type { Vec3 } from "@/game/defs";
import type { ArenaDefinition, ArenaObstacle, ArenaSupportSurface } from "@/game/runtime";
import { clamp, lerp, vec3 } from "@/game/math";

const UNIT_SURFACE_CLEARANCE_Y = 0.035;
const COLLISION_PASSES = 3;
const MAX_STEP_HEIGHT = 0.85;

const rotateIntoLocal = (point: Vec3, obstacle: ArenaObstacle) => {
  const dx = point.x - obstacle.position.x;
  const dz = point.z - obstacle.position.z;
  const cos = Math.cos(-obstacle.rotationY);
  const sin = Math.sin(-obstacle.rotationY);
  return vec3(dx * cos - dz * sin, point.y, dx * sin + dz * cos);
};

const rotateIntoWorld = (local: Vec3, obstacle: ArenaObstacle) => {
  const cos = Math.cos(obstacle.rotationY);
  const sin = Math.sin(obstacle.rotationY);
  return vec3(
    obstacle.position.x + local.x * cos - local.z * sin,
    local.y,
    obstacle.position.z + local.x * sin + local.z * cos,
  );
};

const pushOutOfObstacle = (position: Vec3, obstacle: ArenaObstacle, radius: number) => {
  const local = rotateIntoLocal(position, obstacle);
  const halfX = obstacle.size.x / 2 + radius;
  const halfZ = obstacle.size.z / 2 + radius;
  if (Math.abs(local.x) >= halfX || Math.abs(local.z) >= halfZ) {
    return position;
  }

  const pushX = halfX - Math.abs(local.x);
  const pushZ = halfZ - Math.abs(local.z);
  const resolvedLocal =
    pushX < pushZ
      ? vec3(Math.sign(local.x || 1) * halfX, local.y, local.z)
      : vec3(local.x, local.y, Math.sign(local.z || 1) * halfZ);
  const resolvedWorld = rotateIntoWorld(resolvedLocal, obstacle);
  return vec3(resolvedWorld.x, position.y, resolvedWorld.z);
};

const rotatePointIntoSurfaceLocal = (point: Vec3, surface: ArenaSupportSurface) => {
  const dx = point.x - surface.position.x;
  const dz = point.z - surface.position.z;
  const cos = Math.cos(-surface.rotationY);
  const sin = Math.sin(-surface.rotationY);
  return vec3(dx * cos - dz * sin, point.y, dx * sin + dz * cos);
};

const containsSurfacePoint = (localPoint: Vec3, surface: ArenaSupportSurface) =>
  Math.abs(localPoint.x) <= surface.size.x / 2 && Math.abs(localPoint.z) <= surface.size.z / 2;

const sampleSurfaceSupportY = (surface: ArenaSupportSurface, localPoint: Vec3) => {
  if (surface.kind === "flat" || surface.endSupportY === undefined || !surface.rampAxis) {
    return surface.supportY;
  }

  const axisSpan = surface.rampAxis === "x" ? surface.size.x : surface.size.z;
  const axisOffset = surface.rampAxis === "x" ? localPoint.x : localPoint.z;
  const normalized = clamp(axisOffset / Math.max(axisSpan / 2, 0.001) * 0.5 + 0.5, 0, 1);
  return lerp(surface.supportY, surface.endSupportY, normalized);
};

export const sampleArenaSupportY = (arena: ArenaDefinition, position: Vec3) => {
  const referenceSupportY = position.y - UNIT_SURFACE_CLEARANCE_Y;
  const supportedHeights = arena.supportSurfaces
    .map((surface) => {
      const localPoint = rotatePointIntoSurfaceLocal(position, surface);
      if (!containsSurfacePoint(localPoint, surface)) {
        return null;
      }
      return sampleSurfaceSupportY(surface, localPoint);
    })
    .filter((supportY): supportY is number => supportY !== null)
    .filter((supportY) => supportY <= referenceSupportY + MAX_STEP_HEIGHT);

  const bestSupportY = supportedHeights.length ? Math.max(...supportedHeights) : 0;
  return bestSupportY + UNIT_SURFACE_CLEARANCE_Y;
};

export const resolveArenaPosition = (arena: ArenaDefinition, rawPosition: Vec3, radius: number) => {
  const halfWidth = arena.bounds.width / 2 - radius;
  const halfDepth = arena.bounds.depth / 2 - radius;
  let position = vec3(
    clamp(rawPosition.x, -halfWidth, halfWidth),
    sampleArenaSupportY(arena, rawPosition),
    clamp(rawPosition.z, -halfDepth, halfDepth),
  );

  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    arena.obstacles
      .filter((obstacle) => obstacle.blocksMovement)
      .forEach((obstacle) => {
        position = pushOutOfObstacle(position, obstacle, radius);
      });

    position = vec3(
      clamp(position.x, -halfWidth, halfWidth),
      sampleArenaSupportY(arena, position),
      clamp(position.z, -halfDepth, halfDepth),
    );
  }

  return position;
};

export const getUnitSurfaceClearanceY = () => UNIT_SURFACE_CLEARANCE_Y;
