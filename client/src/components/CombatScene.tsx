import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Line, Text } from "@react-three/drei";
import type { CombatSnapshot } from "@/game/runtime";
import type { SpellId, Vec3 } from "@/game/defs";
import { prototypeCatalog } from "@/game/content";
import { assetUrls } from "@/game/assets";
import { useCharacterModel, useEquipmentModel, useModelAsset } from "@/game/assets/loader";
import { equipmentItemsById, getRigProfileIdForPresentation } from "@/game/equipment/catalog";
import {
  buildAttachmentDebugReport,
  CharacterRigAdapter,
  bindEquipmentModelToSocket,
  reportAttachmentIssue,
} from "@/game/equipment/runtime";
import type { AttachmentDebugReport, AttachmentProfileOverrideMap, SocketId } from "@/game/equipment/schema";
import { resolveVisibleEquipmentView } from "@/game/equipment/system";
import * as THREE from "three";

export interface CameraOrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface GroundPreviewState {
  kind: "spell" | "order";
  point: Vec3;
  radius?: number;
  spellId?: SpellId;
}

export interface ScenePerformanceSample {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  units: number;
  projectiles: number;
  floatingTexts: number;
}

export interface AttachmentDebugOptions {
  inspectUnitId: string | null;
  showSockets: boolean;
  showMarkers: boolean;
  showSkeleton: boolean;
  overrides: AttachmentProfileOverrideMap;
}

interface CombatSceneProps {
  snapshot: CombatSnapshot;
  cameraOrbit: CameraOrbitState;
  onGroundClick: (point: Vec3) => void;
  onGroundHover: (point: Vec3 | null) => void;
  onUnitClick: (unitId: string) => void;
  groundPreview: GroundPreviewState | null;
  reviveIndicatorUnitId: string | null;
  onPerformanceSample?: (sample: ScenePerformanceSample) => void;
  attachmentDebug?: AttachmentDebugOptions;
  onAttachmentDebugReport?: (unitId: string, report: AttachmentDebugReport | null) => void;
}

type PresentationAnimationId =
  | "idle"
  | "run"
  | "runLeft"
  | "runRight"
  | "runBack"
  | "walkLeft"
  | "walkRight"
  | "walkBack"
  | "attack"
  | "cast"
  | "hit"
  | "death"
  | "block"
  | "draw"
  | "release"
  | "guard";

const LOOPING_LOCOMOTION_ANIMATIONS: PresentationAnimationId[] = [
  "idle",
  "run",
  "runLeft",
  "runRight",
  "runBack",
  "walkLeft",
  "walkRight",
  "walkBack",
];

const SOCKET_DEBUG_IDS: SocketId[] = [
  "hand_r_weapon",
  "hand_l_offhand",
  "hand_l_bow",
  "back_weapon",
  "hip_l_weapon",
  "hip_r_weapon",
];

const useCharacterRigAdapter = (root: THREE.Object3D | null, presentationId: CombatSnapshot["units"][number]["definitionId"]) => {
  const [adapter, setAdapter] = useState<CharacterRigAdapter | null>(null);

  useEffect(() => {
    if (!root) {
      setAdapter(null);
      return;
    }

    const unitDefinition = prototypeCatalog.units[presentationId];
    const rigProfileId = getRigProfileIdForPresentation(unitDefinition.presentationId);
    const nextAdapter = new CharacterRigAdapter(root, rigProfileId);
    setAdapter(nextAdapter);

    return () => {
      nextAdapter.dispose();
      setAdapter(null);
    };
  }, [presentationId, root]);

  return adapter;
};

function NodeAxesHelper({
  parent,
  size,
}: {
  parent: THREE.Object3D | null;
  size: number;
}) {
  useEffect(() => {
    if (!parent) {
      return;
    }

    const axes = new THREE.AxesHelper(size);
    parent.add(axes);
    return () => {
      parent.remove(axes);
    };
  }, [parent, size]);

  return null;
}

function SkeletonDebugHelper({
  root,
  enabled,
}: {
  root: THREE.Object3D | null;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!root || !enabled) {
      return;
    }

    const helper = new THREE.SkeletonHelper(root);
    helper.name = "ATTACHMENT_SKELETON_DEBUG";
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    materials.forEach((material) => {
      material.depthTest = false;
      material.transparent = true;
      material.opacity = 0.9;
    });
    root.parent?.add(helper);

    return () => {
      helper.parent?.remove(helper);
    };
  }, [enabled, root]);

  return null;
}

const texturePromiseCache = new Map<string, Promise<THREE.Texture>>();

const loadTexture = (url: string) => {
  const cached = texturePromiseCache.get(url);
  if (cached) {
    return cached;
  }

  const textureLoader = new THREE.TextureLoader();
  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
  texturePromiseCache.set(url, promise);
  return promise;
};

const useWorldTexture = (url: string | null) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    loadTexture(url)
      .then((nextTexture) => {
        if (!cancelled) {
          setTexture(nextTexture);
        }
      })
      .catch((error) => {
        console.error("Indicator texture failed to load", error);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return texture;
};

function SocketDebugHelpers({
  adapter,
  enabled,
}: {
  adapter: CharacterRigAdapter | null;
  enabled: boolean;
}) {
  if (!adapter || !enabled) {
    return null;
  }

  return (
    <>
      {SOCKET_DEBUG_IDS.map((socketId) => (
        <NodeAxesHelper key={socketId} parent={adapter.getSocketNode(socketId)} size={0.18} />
      ))}
    </>
  );
}

function EquipmentAttachmentBinding({
  adapter,
  unit,
  binding,
  showMarkerDebug,
}: {
  adapter: CharacterRigAdapter | null;
  unit: CombatSnapshot["units"][number];
  binding: ReturnType<typeof resolveVisibleEquipmentView>["bindings"][number];
  showMarkerDebug: boolean;
}) {
  const itemDefinition = equipmentItemsById[binding.itemId];
  const model = useEquipmentModel(itemDefinition.modelUrl);
  const [bindingRoot, setBindingRoot] = useState<THREE.Object3D | null>(null);
  const handleRef = useRef<ReturnType<typeof bindEquipmentModelToSocket> | null>(null);

  useEffect(() => {
    setBindingRoot(null);
    handleRef.current = null;
    if (!adapter || !model) {
      return;
    }

    const handle = bindEquipmentModelToSocket({
      adapter,
      characterId: unit.id,
      characterName: unit.name,
      itemId: binding.itemId,
      socketId: binding.socketId,
      stanceFamily: binding.stanceFamily,
      itemScene: model.scene,
      poseOffset: binding.profile.resolvedPoseOffset,
      sourceMarkerId: binding.sourceMarkerId,
    });

    if (!handle) {
      reportAttachmentIssue({
        characterId: unit.id,
        characterName: unit.name,
        rigProfileId: adapter.getRigProfileId(),
        itemId: binding.itemId,
        socketId: binding.socketId,
        stanceFamily: binding.stanceFamily,
        reason: "Attachment bind failed",
      });
      return;
    }

    handleRef.current = handle;
    setBindingRoot(handle.bindingRoot);
    return () => {
      handleRef.current = null;
      handle.detach();
      setBindingRoot(null);
    };
  }, [
    adapter,
    binding.itemId,
    binding.profile.id,
    binding.socketId,
    binding.sourceMarkerId,
    binding.stanceFamily,
    model,
    unit.id,
    unit.name,
  ]);

  useEffect(() => {
    handleRef.current?.applyPose(binding.profile.resolvedPoseOffset);
  }, [
    binding.profile.resolvedPoseOffset.position.x,
    binding.profile.resolvedPoseOffset.position.y,
    binding.profile.resolvedPoseOffset.position.z,
    binding.profile.resolvedPoseOffset.rotation.x,
    binding.profile.resolvedPoseOffset.rotation.y,
    binding.profile.resolvedPoseOffset.rotation.z,
    binding.profile.resolvedPoseOffset.scale,
  ]);

  return showMarkerDebug && bindingRoot ? <NodeAxesHelper parent={bindingRoot} size={0.14} /> : null;
}

function CameraRig({ snapshot, cameraOrbit }: { snapshot: CombatSnapshot; cameraOrbit: CameraOrbitState }) {
  const cameraTarget = useRef(new THREE.Vector3());
  const cameraPosition = useRef(new THREE.Vector3());
  const initializedRef = useRef(false);
  const forwardRef = useRef(new THREE.Vector3());
  const orbitOffsetRef = useRef(new THREE.Vector3());
  const anchorRef = useRef(new THREE.Vector3());
  const desiredPositionRef = useRef(new THREE.Vector3());
  const desiredTargetRef = useRef(new THREE.Vector3());
  const targetBiasRef = useRef(new THREE.Vector3());
  const rayDirectionRef = useRef(new THREE.Vector3());
  const rayRef = useRef(new THREE.Ray());
  const hitPointRef = useRef(new THREE.Vector3());
  const obstacleBounds = useMemo(
    () =>
      snapshot.arena.obstacles
        .filter((obstacle) => obstacle.blocksMovement)
        .map((obstacle) => {
          const halfExtents = new THREE.Vector3(
            obstacle.size.x / 2 + 0.45,
            obstacle.size.y / 2 + 0.65,
            obstacle.size.z / 2 + 0.45,
          );
          const center = new THREE.Vector3(
            obstacle.position.x,
            obstacle.position.y + obstacle.size.y / 2,
            obstacle.position.z,
          );
          return new THREE.Box3(center.clone().sub(halfExtents), center.clone().add(halfExtents));
        }),
    [snapshot.arena.obstacles],
  );

  useFrame(({ camera }) => {
    const leader = snapshot.units.find((unit) => unit.id === snapshot.leaderId);
    if (!leader) {
      return;
    }

    const selectedTarget = snapshot.selectedTargetId
      ? snapshot.units.find((unit) => unit.id === snapshot.selectedTargetId) ?? null
      : null;
    if (!initializedRef.current) {
      cameraOrbit.yaw = leader.facingYaw;
    }

    const effectivePitch = THREE.MathUtils.clamp(cameraOrbit.pitch, 0.22, 0.68);
    const desiredDistance = THREE.MathUtils.clamp(cameraOrbit.distance, 5.8, 10.5);
    forwardRef.current.set(Math.sin(cameraOrbit.yaw), 0, Math.cos(cameraOrbit.yaw)).normalize();
    const anchor = anchorRef.current.set(leader.position.x, leader.position.y + 1.55, leader.position.z);
    const horizontalDistance = desiredDistance * Math.cos(effectivePitch);
    const verticalDistance = desiredDistance * Math.sin(effectivePitch);
    const orbitOffset = orbitOffsetRef.current.set(
      -Math.sin(cameraOrbit.yaw) * horizontalDistance,
      verticalDistance,
      -Math.cos(cameraOrbit.yaw) * horizontalDistance,
    );

    const desiredPosition = desiredPositionRef.current.copy(anchor).add(orbitOffset);
    const desiredTarget = desiredTargetRef.current
      .copy(anchor)
      .add(new THREE.Vector3(0, 0.55, 0));

    if (selectedTarget) {
      const targetBias = targetBiasRef.current.set(
        selectedTarget.position.x,
        selectedTarget.position.y + 1.1,
        selectedTarget.position.z,
      );
      desiredTarget.lerp(targetBias, 0.1);
    }

    const rayDirection = rayDirectionRef.current.copy(desiredPosition).sub(anchor).normalize();
    const ray = rayRef.current;
    ray.origin.copy(anchor);
    ray.direction.copy(rayDirection);
    const desiredLength = desiredPosition.distanceTo(anchor);
    let nearestHitDistance = desiredLength;

    obstacleBounds.forEach((bounds) => {
      const hitPoint = ray.intersectBox(bounds, hitPointRef.current);
      if (!hitPoint) {
        return;
      }
      const hitDistance = hitPoint.distanceTo(anchor);
      if (hitDistance > 0 && hitDistance < nearestHitDistance) {
        nearestHitDistance = hitDistance;
      }
    });

    if (nearestHitDistance < desiredLength) {
      desiredPosition.copy(anchor).addScaledVector(rayDirection, Math.max(2.8, nearestHitDistance - 0.55));
    }

    if (!initializedRef.current) {
      cameraTarget.current.copy(desiredTarget);
      cameraPosition.current.copy(desiredPosition);
      initializedRef.current = true;
    } else {
      cameraTarget.current.lerp(desiredTarget, 0.18);
      cameraPosition.current.lerp(desiredPosition, 0.16);
    }

    camera.position.copy(cameraPosition.current);
    camera.lookAt(cameraTarget.current);
  });

  return null;
}

function LiveOpsProbe({
  units,
  projectiles,
  floatingTexts,
  onSample,
}: {
  units: number;
  projectiles: number;
  floatingTexts: number;
  onSample?: (sample: ScenePerformanceSample) => void;
}) {
  const accumulatorRef = useRef({
    elapsed: 0,
    frames: 0,
    frameMs: 0,
  });

  useFrame(({ gl }, delta) => {
    if (!onSample) {
      return;
    }

    const accumulator = accumulatorRef.current;
    accumulator.elapsed += delta;
    accumulator.frames += 1;
    accumulator.frameMs += delta * 1000;

    if (accumulator.elapsed < 0.2) {
      return;
    }

    onSample({
      fps: accumulator.frames / accumulator.elapsed,
      frameMs: accumulator.frameMs / accumulator.frames,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      units,
      projectiles,
      floatingTexts,
    });

    accumulator.elapsed = 0;
    accumulator.frames = 0;
    accumulator.frameMs = 0;
  });

  return null;
}

function GroundIndicator({
  textureUrl,
  point,
  size,
  tint = "#ffffff",
  opacity = 0.96,
}: {
  textureUrl: string;
  point: Vec3;
  size: number;
  tint?: string;
  opacity?: number;
}) {
  const texture = useWorldTexture(textureUrl);

  if (!texture) {
    return null;
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[point.x, 0.05, point.z]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        alphaTest={0.12}
        opacity={opacity}
        color={tint}
      />
    </mesh>
  );
}

function BillboardIndicator({
  textureUrl,
  point,
  size,
  tint = "#ffffff",
}: {
  textureUrl: string;
  point: Vec3;
  size: number;
  tint?: string;
}) {
  const texture = useWorldTexture(textureUrl);

  if (!texture) {
    return null;
  }

  return (
    <sprite scale={[size, size, 1]} position={[point.x, point.y, point.z]}>
      <spriteMaterial map={texture} transparent depthWrite={false} color={tint} />
    </sprite>
  );
}

function HealthBar({ unit }: { unit: CombatSnapshot["units"][number] }) {
  const ratio = Math.max(0.06, Math.min(1, unit.currentHp / prototypeCatalog.units[unit.definitionId].stats.maxHp));
  const fillColor = unit.isDead ? "#5f5149" : unit.isDowned ? "#d5b076" : unit.faction === "enemy" ? "#d46f67" : "#78cb8d";

  return (
    <group position={[0, 2.55, 0]}>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[1.28, 0.12]} />
        <meshBasicMaterial color="#231813" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh position={[-0.64 + ratio * 0.64, 0, 0.01]}>
        <planeGeometry args={[1.28 * ratio, 0.08]} />
        <meshBasicMaterial color={fillColor} depthWrite={false} />
      </mesh>
    </group>
  );
}

const MemoHealthBar = memo(
  HealthBar,
  (previous, next) =>
    previous.unit.currentHp === next.unit.currentHp &&
    previous.unit.isDead === next.unit.isDead &&
    previous.unit.isDowned === next.unit.isDowned &&
    previous.unit.definitionId === next.unit.definitionId &&
    previous.unit.faction === next.unit.faction,
);

function UnitLabel({
  unit,
  showAiState,
}: {
  unit: CombatSnapshot["units"][number];
  showAiState: boolean;
}) {
  const statusLine = unit.isDead ? "Defeated" : unit.isDowned ? "Downed" : prototypeCatalog.units[unit.definitionId].group;

  return (
    <>
      <Text
        color="#21150e"
        fontSize={0.22}
        outlineColor="#f7ecda"
        outlineWidth={0.025}
        anchorX="center"
        anchorY="middle"
        position={[0, 2.95, 0]}
      >
        {unit.name}
      </Text>
      <Text
        color="#4a3628"
        fontSize={0.17}
        outlineColor="#f5ecde"
        outlineWidth={0.02}
        anchorX="center"
        anchorY="middle"
        position={[0, 2.68, 0]}
      >
        {statusLine}
      </Text>
      {showAiState && unit.controller === "ai" ? (
        <Text
          color="#6f553f"
          fontSize={0.13}
          outlineColor="#f5ecde"
          outlineWidth={0.014}
          anchorX="center"
          anchorY="middle"
          position={[0, 2.42, 0]}
        >
          {unit.aiState.stateLabel}
        </Text>
      ) : null}
    </>
  );
}

const MemoUnitLabel = memo(
  UnitLabel,
  (previous, next) =>
    previous.unit.name === next.unit.name &&
    previous.unit.definitionId === next.unit.definitionId &&
    previous.unit.isDead === next.unit.isDead &&
    previous.unit.isDowned === next.unit.isDowned &&
    previous.showAiState === next.showAiState &&
    previous.unit.aiState.stateLabel === next.unit.aiState.stateLabel,
);

function StatusIndicators({ unit }: { unit: CombatSnapshot["units"][number] }) {
  const visibleStatuses = unit.statuses.slice(0, 3);

  return (
    <>
      {visibleStatuses.map((status, index) => {
        const statusDefinition = prototypeCatalog.statuses[status.id];
        if (!statusDefinition.asset.vfxUrl) {
          return null;
        }

        return (
          <BillboardIndicator
            key={status.id}
            textureUrl={statusDefinition.asset.vfxUrl}
            point={{ x: -0.42 + index * 0.42, y: 3.22, z: 0 }}
            size={0.32}
            tint={status.id === "shielded" ? "#dff3ff" : status.id === "marked" ? "#ffd9b5" : "#fff6d2"}
          />
        );
      })}
    </>
  );
}

function UnitModel({
  unit,
  isSelected,
  showAiState,
  onClick,
  attachmentDebug,
  onAttachmentDebugReport,
}: {
  unit: CombatSnapshot["units"][number];
  isSelected: boolean;
  showAiState: boolean;
  onClick: (unitId: string) => void;
  attachmentDebug?: AttachmentDebugOptions;
  onAttachmentDebugReport?: (unitId: string, report: AttachmentDebugReport | null) => void;
}) {
  const definition = prototypeCatalog.units[unit.definitionId];
  const model = useCharacterModel(definition.presentationId);
  const adapter = useCharacterRigAdapter(model?.scene ?? null, unit.definitionId);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<PresentationAnimationId, THREE.AnimationAction>>>({});
  const activeAnimationRef = useRef<PresentationAnimationId | null>(null);

  const weapon = prototypeCatalog.weapons[unit.weaponId];
  const rigProfileId = getRigProfileIdForPresentation(definition.presentationId);
  const equipmentView = useMemo(
    () => resolveVisibleEquipmentView(unit.equipmentState, rigProfileId, weapon.kind, attachmentDebug?.overrides ?? {}),
    [attachmentDebug?.overrides, rigProfileId, unit.equipmentState, weapon.kind],
  );
  const stanceFamily = equipmentView.stanceFamily;
  const inspectThisUnit = attachmentDebug?.inspectUnitId === unit.id;
  const moveAmount = Math.hypot(unit.velocity.x, unit.velocity.z);
  const attackWindowMs = Math.min(260, weapon.cooldownMs * 0.24);
  const forwardX = Math.sin(unit.facingYaw);
  const forwardZ = Math.cos(unit.facingYaw);
  const localForward = unit.velocity.x * forwardX + unit.velocity.z * forwardZ;
  const localSide = unit.velocity.x * forwardZ - unit.velocity.z * forwardX;
  const localMoveIntent = unit.controller === "player" ? unit.moveIntent : null;
  const hasLocomotionIntent =
    unit.controller === "player"
      ? Math.hypot(localMoveIntent?.x ?? 0, localMoveIntent?.z ?? 0) > 0.05
      : moveAmount > 0.025;

  let desiredAnimation: PresentationAnimationId = "idle";
  if (unit.isDead) {
    desiredAnimation = "death";
  } else if (unit.isDowned) {
    desiredAnimation = "hit";
  } else if (unit.castState) {
    desiredAnimation = "cast";
  } else if (unit.basicCooldownMs >= weapon.cooldownMs - attackWindowMs) {
    desiredAnimation = "attack";
  } else if (hasLocomotionIntent) {
    const pureSideStrafe =
      !!localMoveIntent && Math.abs(localMoveIntent.z) <= 0.05 && Math.abs(localMoveIntent.x) > 0.05;
    const pureBackpedal = !!localMoveIntent && Math.abs(localMoveIntent.x) <= 0.05 && localMoveIntent.z < -0.05;

    if (pureSideStrafe) {
      desiredAnimation = localMoveIntent.x > 0 ? "walkLeft" : "walkRight";
    } else if (pureBackpedal) {
      desiredAnimation = "walkBack";
    } else if (localForward < -0.025 && Math.abs(localForward) > Math.abs(localSide) * 0.75) {
      desiredAnimation = "runBack";
    } else if (localSide > 0.025 && Math.abs(localSide) > Math.abs(localForward) * 0.75) {
      desiredAnimation = "runLeft";
    } else if (localSide < -0.025 && Math.abs(localSide) > Math.abs(localForward) * 0.75) {
      desiredAnimation = "runRight";
    } else {
      desiredAnimation = "run";
    }
  }

  const pickAnimation = (animationId: PresentationAnimationId) => {
    if (!model) {
      return null;
    }
    const candidates: PresentationAnimationId[] = [animationId];
    if (animationId === "cast") {
      if (stanceFamily === "bow") {
        candidates.push("draw", "release");
      } else if (stanceFamily === "one_hand_shield") {
        candidates.push("block", "guard", "attack");
      } else {
        candidates.push("draw", "block", "attack");
      }
    }
    if (animationId === "walkLeft") {
      candidates.push("runLeft", "run");
    }
    if (animationId === "walkRight") {
      candidates.push("runRight", "run");
    }
    if (animationId === "walkBack") {
      candidates.push("runBack", "run");
    }
    if (animationId === "runLeft" || animationId === "runRight" || animationId === "runBack") {
      candidates.push("run");
    }
    if (animationId === "attack") {
      if (stanceFamily === "bow") {
        candidates.push("release");
      }
      if (stanceFamily === "one_hand_shield") {
        candidates.push("guard", "block");
      }
      candidates.push("release", "guard");
    }
    if (animationId === "hit") {
      if (stanceFamily === "one_hand_shield") {
        candidates.push("block", "guard");
      }
      candidates.push("guard", "idle");
    }
    if (animationId === "death") {
      candidates.push("hit", "guard");
    }
    candidates.push("idle");
    return candidates.find((candidate) => model.animations[candidate]) ?? null;
  };

  useEffect(() => {
    if (!model) {
      mixerRef.current = null;
      actionsRef.current = {};
      activeAnimationRef.current = null;
      return;
    }

    const mixer = new THREE.AnimationMixer(model.scene);
    const actions: Partial<Record<PresentationAnimationId, THREE.AnimationAction>> = {};
    Object.entries(model.animations).forEach(([animationId, clip]) => {
      if (!clip) {
        return;
      }
      const action = mixer.clipAction(clip, model.scene);
      const isLoopingLocomotion = LOOPING_LOCOMOTION_ANIMATIONS.includes(animationId as PresentationAnimationId);
      action.clampWhenFinished = !isLoopingLocomotion;
      action.loop = isLoopingLocomotion ? THREE.LoopRepeat : THREE.LoopOnce;
      actions[animationId as PresentationAnimationId] = action;
    });

    mixerRef.current = mixer;
    actionsRef.current = actions;
    activeAnimationRef.current = null;

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      actionsRef.current = {};
      activeAnimationRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    const nextAnimation = pickAnimation(desiredAnimation);
    if (!nextAnimation || nextAnimation === activeAnimationRef.current) {
      return;
    }

    const actions = actionsRef.current;
    const nextAction = actions[nextAnimation];
    if (!nextAction) {
      return;
    }

    if (activeAnimationRef.current && actions[activeAnimationRef.current]) {
      actions[activeAnimationRef.current]?.fadeOut(0.14);
    }

    nextAction.reset().fadeIn(0.14).play();
    activeAnimationRef.current = nextAnimation;
  }, [
    desiredAnimation,
    model,
    unit.basicCooldownMs,
    unit.castState,
    unit.isDead,
    unit.isDowned,
    unit.velocity.x,
    unit.velocity.z,
    unit.moveIntent.x,
    unit.moveIntent.z,
  ]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  useEffect(() => {
    if (!onAttachmentDebugReport) {
      return;
    }

    if (!inspectThisUnit || !adapter) {
      onAttachmentDebugReport(unit.id, null);
      return;
    }

    onAttachmentDebugReport(
      unit.id,
      buildAttachmentDebugReport({
        unitId: unit.id,
        unitName: unit.name,
        adapter,
        equipmentView,
      }),
    );

    return () => {
      onAttachmentDebugReport(unit.id, null);
    };
  }, [adapter, equipmentView, inspectThisUnit, onAttachmentDebugReport, unit.id, unit.name]);

  const selectedMarkerUrl =
    unit.faction === "enemy" ? assetUrls.ui.targetEnemy : assetUrls.ui.targetAlly;

  return (
    <group
      position={[unit.position.x, unit.position.y, unit.position.z]}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onClick(unit.id);
      }}
    >
      <group rotation={[0, unit.facingYaw + (model?.rotationOffsetY ?? 0), 0]}>
        {model ? <primitive object={model.scene} /> : null}
        <SkeletonDebugHelper root={model?.scene ?? null} enabled={!!inspectThisUnit && !!attachmentDebug?.showSkeleton} />
        <SocketDebugHelpers adapter={adapter} enabled={!!inspectThisUnit && !!attachmentDebug?.showSockets} />
        {equipmentView.bindings.map((binding) => (
          <EquipmentAttachmentBinding
            key={`${unit.id}-${binding.sourceSlot}-${binding.itemId}-${binding.profileId}`}
            adapter={adapter}
            unit={unit}
            binding={binding}
            showMarkerDebug={!!inspectThisUnit && !!attachmentDebug?.showMarkers}
          />
        ))}
      </group>
      <Billboard follow>
        <MemoHealthBar unit={unit} />
        <MemoUnitLabel unit={unit} showAiState={showAiState} />
        <StatusIndicators unit={unit} />
      </Billboard>
      {isSelected ? (
        <>
          <GroundIndicator textureUrl={selectedMarkerUrl} point={{ x: 0, y: 0, z: 0 }} size={2.1} />
          <BillboardIndicator
            textureUrl={selectedMarkerUrl}
            point={{ x: 0, y: 3.45, z: 0 }}
            size={0.9}
            tint={unit.faction === "enemy" ? "#ffd9bc" : "#d2f0ff"}
          />
        </>
      ) : null}
    </group>
  );
}

const MemoUnitModel = memo(
  UnitModel,
  (previous, next) =>
    previous.isSelected === next.isSelected &&
    previous.unit.id === next.unit.id &&
    previous.unit.definitionId === next.unit.definitionId &&
    previous.unit.position.x === next.unit.position.x &&
    previous.unit.position.y === next.unit.position.y &&
    previous.unit.position.z === next.unit.position.z &&
    previous.unit.facingYaw === next.unit.facingYaw &&
    previous.unit.velocity.x === next.unit.velocity.x &&
    previous.unit.velocity.z === next.unit.velocity.z &&
    previous.unit.moveIntent.x === next.unit.moveIntent.x &&
    previous.unit.moveIntent.z === next.unit.moveIntent.z &&
    previous.unit.equipmentState.equipState === next.unit.equipmentState.equipState &&
    previous.unit.equipmentState.activeSlots.main_hand === next.unit.equipmentState.activeSlots.main_hand &&
    previous.unit.equipmentState.activeSlots.off_hand === next.unit.equipmentState.activeSlots.off_hand &&
    previous.unit.equipmentState.storageSlots.back === next.unit.equipmentState.storageSlots.back &&
    previous.unit.equipmentState.storageSlots.hip_left === next.unit.equipmentState.storageSlots.hip_left &&
    previous.unit.equipmentState.storageSlots.hip_right === next.unit.equipmentState.storageSlots.hip_right &&
    previous.unit.currentHp === next.unit.currentHp &&
    previous.unit.basicCooldownMs === next.unit.basicCooldownMs &&
    previous.unit.isDead === next.unit.isDead &&
    previous.unit.isDowned === next.unit.isDowned &&
    previous.unit.castState?.spellId === next.unit.castState?.spellId &&
    previous.showAiState === next.showAiState &&
    previous.attachmentDebug?.inspectUnitId === next.attachmentDebug?.inspectUnitId &&
    previous.attachmentDebug?.showSockets === next.attachmentDebug?.showSockets &&
    previous.attachmentDebug?.showMarkers === next.attachmentDebug?.showMarkers &&
    previous.attachmentDebug?.showSkeleton === next.attachmentDebug?.showSkeleton &&
    previous.attachmentDebug?.overrides === next.attachmentDebug?.overrides &&
    previous.unit.aiState.stateLabel === next.unit.aiState.stateLabel &&
    previous.unit.statuses.map((status) => status.id).join(",") === next.unit.statuses.map((status) => status.id).join(","),
);

function ArenaGround({ snapshot }: { snapshot: CombatSnapshot }) {
  const ground = useModelAsset(snapshot.arena.groundModelUrl, {
    x: snapshot.arena.bounds.width,
    y: 0.45,
    z: snapshot.arena.bounds.depth,
  });
  const groundOffsetY = useMemo(() => {
    if (!ground) {
      return 0;
    }
    const bounds = new THREE.Box3().setFromObject(ground.scene);
    return -bounds.max.y;
  }, [ground]);

  if (!ground) {
    return (
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[snapshot.arena.bounds.width, snapshot.arena.bounds.depth]} />
        <meshStandardMaterial color="#ceb38b" />
      </mesh>
    );
  }

  return <primitive object={ground.scene} position={[0, groundOffsetY, 0]} />;
}

const MemoArenaGround = memo(
  ArenaGround,
  (previous, next) =>
    previous.snapshot.arena.groundModelUrl === next.snapshot.arena.groundModelUrl &&
    previous.snapshot.arena.bounds.width === next.snapshot.arena.bounds.width &&
    previous.snapshot.arena.bounds.depth === next.snapshot.arena.bounds.depth,
);

function ArenaObstacles({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.arena.obstacles.map((obstacle) => (
        <ArenaObstacleModel key={obstacle.id} obstacle={obstacle} />
      ))}
    </>
  );
}

const MemoArenaObstacles = memo(
  ArenaObstacles,
  (previous, next) => previous.snapshot.arena.obstacles === next.snapshot.arena.obstacles,
);

function ArenaObstacleModel({ obstacle }: { obstacle: CombatSnapshot["arena"]["obstacles"][number] }) {
  const model = useModelAsset(obstacle.modelUrl, obstacle.size);

  if (!model) {
    return (
      <mesh
        castShadow
        receiveShadow
        position={[obstacle.position.x, obstacle.size.y / 2, obstacle.position.z]}
        rotation={[0, obstacle.rotationY, 0]}
      >
        <boxGeometry args={[obstacle.size.x, obstacle.size.y, obstacle.size.z]} />
        <meshStandardMaterial color="#8a7b69" roughness={0.8} />
      </mesh>
    );
  }

  return (
    <group position={[obstacle.position.x, 0, obstacle.position.z]} rotation={[0, obstacle.rotationY, 0]}>
      <primitive object={model.scene} />
    </group>
  );
}

function SpellPreview({ preview }: { preview: GroundPreviewState }) {
  const spell = preview.spellId ? prototypeCatalog.spells[preview.spellId] : null;
  const ringColor = preview.kind === "order" ? "#edd7a0" : "#9dc7ff";
  const markerUrl = preview.kind === "order" ? assetUrls.ui.orderMove : assetUrls.ui.targetAlly;

  return (
    <>
      <GroundIndicator textureUrl={markerUrl} point={preview.point} size={2.5} tint={ringColor} opacity={0.9} />
      {preview.radius && preview.radius > 0.1 ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[preview.point.x, 0.07, preview.point.z]}>
          <ringGeometry args={[Math.max(0.2, preview.radius * 0.72), preview.radius, 48]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.44} />
        </mesh>
      ) : null}
      {spell ? (
        <Text
          color="#1d1612"
          fontSize={0.24}
          outlineColor="#f8ead2"
          outlineWidth={0.02}
          anchorX="center"
          anchorY="middle"
          position={[preview.point.x, 0.18, preview.point.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {spell.name}
        </Text>
      ) : null}
    </>
  );
}

function Zones({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.zones.map((zone) => (
        <mesh key={zone.id} rotation={[-Math.PI / 2, 0, 0]} position={[zone.center.x, 0.04, zone.center.z]}>
          <ringGeometry args={[zone.radius * 0.58, zone.radius, 44]} />
          <meshBasicMaterial color="#7eb0d3" transparent opacity={0.34} />
        </mesh>
      ))}
    </>
  );
}

function Projectiles({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.projectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.position.x, 1.4, projectile.position.z]} castShadow>
          <sphereGeometry args={[projectile.spellId ? 0.2 : 0.15, 18, 18]} />
          <meshStandardMaterial
            color={projectile.spellId ? "#9cc7ff" : "#dbc59d"}
            emissive={projectile.spellId ? "#496f96" : "#6a4b2c"}
            emissiveIntensity={0.75}
          />
        </mesh>
      ))}
    </>
  );
}

function FloatingFeedbackEntry({ entry }: { entry: CombatSnapshot["floatingTexts"][number] }) {
  const textureUrl =
    entry.kind === "damage"
      ? assetUrls.vfx.hitSlash
      : entry.kind === "heal"
        ? assetUrls.vfx.buff
        : entry.kind === "status"
          ? entry.text === "Revived"
            ? assetUrls.vfx.revive
            : assetUrls.vfx.warning
          : entry.kind === "reward"
            ? assetUrls.ui.star
            : null;
  const opacity = Math.max(0.18, Math.min(1, entry.remainingMs / (entry.kind === "reward" ? 2200 : 1200)));
  const size = entry.kind === "reward" ? 0.72 : 0.54;
  const texture = useWorldTexture(textureUrl);

  return (
    <>
      {texture ? (
        <sprite scale={[size, size, 1]} position={[entry.position.x, entry.position.y + 0.24, entry.position.z]}>
          <spriteMaterial
            map={texture}
            transparent
            depthWrite={false}
            opacity={opacity}
            color={
              entry.kind === "damage"
                ? "#f7c4b9"
                : entry.kind === "heal"
                  ? "#d6ffd3"
                  : entry.kind === "reward"
                    ? "#fff0b3"
                    : "#d7ebff"
            }
          />
        </sprite>
      ) : null}
      <Text
        color={
          entry.kind === "damage"
            ? "#9a2d2a"
            : entry.kind === "heal"
              ? "#2f7a38"
              : entry.kind === "reward"
                ? "#8f6514"
                : "#22465a"
        }
        outlineColor="#fff4e8"
        outlineWidth={0.03}
        fontSize={0.22}
        anchorX="center"
        anchorY="middle"
        position={[entry.position.x, entry.position.y, entry.position.z]}
      >
        {entry.text}
      </Text>
    </>
  );
}

function FloatingTexts({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.floatingTexts.map((entry) => (
        <FloatingFeedbackEntry key={entry.id} entry={entry} />
      ))}
    </>
  );
}

export function CombatScene({
  snapshot,
  cameraOrbit,
  onGroundClick,
  onGroundHover,
  onUnitClick,
  groundPreview,
  reviveIndicatorUnitId,
  onPerformanceSample,
  attachmentDebug,
  onAttachmentDebugReport,
}: CombatSceneProps) {
  const boundsPoints: [number, number, number][] = useMemo(
    () => [
      [-snapshot.arena.bounds.width / 2, 0, -snapshot.arena.bounds.depth / 2],
      [snapshot.arena.bounds.width / 2, 0, -snapshot.arena.bounds.depth / 2],
      [snapshot.arena.bounds.width / 2, 0, snapshot.arena.bounds.depth / 2],
      [-snapshot.arena.bounds.width / 2, 0, snapshot.arena.bounds.depth / 2],
      [-snapshot.arena.bounds.width / 2, 0, -snapshot.arena.bounds.depth / 2],
    ],
    [snapshot.arena.bounds.depth, snapshot.arena.bounds.width],
  );
  const reviveTarget =
    reviveIndicatorUnitId ? snapshot.units.find((unit) => unit.id === reviveIndicatorUnitId) ?? null : null;

  return (
    <>
      <CameraRig snapshot={snapshot} cameraOrbit={cameraOrbit} />
      <color attach="background" args={["#e7dbc4"]} />
      <fog attach="fog" args={["#e7dbc4", 20, 44]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight intensity={0.75} groundColor="#8f744d" color="#fff2d8" />
      <directionalLight intensity={1.8} position={[14, 20, 6]} />
      <LiveOpsProbe
        units={snapshot.units.length}
        projectiles={snapshot.projectiles.length}
        floatingTexts={snapshot.floatingTexts.length}
        onSample={onPerformanceSample}
      />

      <Line points={boundsPoints} color="#8f714b" lineWidth={1.5} />
      <group>
        <MemoArenaGround snapshot={snapshot} />
        <mesh
          receiveShadow
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={(event: ThreeEvent<PointerEvent>) => {
            onGroundHover({
              x: event.point.x,
              y: 0,
              z: event.point.z,
            });
          }}
          onPointerOut={() => {
            onGroundHover(null);
          }}
          onPointerDown={(event: ThreeEvent<PointerEvent>) => {
            onGroundClick({
              x: event.point.x,
              y: 0,
              z: event.point.z,
            });
          }}
        >
          <planeGeometry args={[snapshot.arena.bounds.width, snapshot.arena.bounds.depth]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      <MemoArenaObstacles snapshot={snapshot} />
      <Zones snapshot={snapshot} />
      <Projectiles snapshot={snapshot} />

      {snapshot.units.map((unit) => (
        <MemoUnitModel
          key={unit.id}
          unit={unit}
          isSelected={snapshot.selectedTargetId === unit.id}
          showAiState={snapshot.debugFlags.showAi}
          onClick={onUnitClick}
          attachmentDebug={attachmentDebug}
          onAttachmentDebugReport={onAttachmentDebugReport}
        />
      ))}

      {groundPreview ? <SpellPreview preview={groundPreview} /> : null}
      {reviveTarget ? (
        <>
          <GroundIndicator textureUrl={assetUrls.vfx.revive} point={reviveTarget.position} size={2.4} tint="#e9f8ff" />
          <BillboardIndicator
            textureUrl={assetUrls.ui.targetAlly}
            point={{ x: reviveTarget.position.x, y: 2.9, z: reviveTarget.position.z }}
            size={0.88}
            tint="#d8f4ff"
          />
        </>
      ) : null}

      <FloatingTexts snapshot={snapshot} />
    </>
  );
}
