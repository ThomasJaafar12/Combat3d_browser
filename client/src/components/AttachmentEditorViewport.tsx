import { OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CharacterAnimator } from "@/game/animation/CharacterAnimator";
import type { PresentationAnimationId } from "@/game/animation/types";
import { useCharacterModel, useEquipmentModel } from "@/game/assets/loader";
import { AttachmentSystem } from "@/game/character/AttachmentSystem";
import { CharacterRig } from "@/game/character/CharacterRig";
import type { CharacterPresentationId } from "@/game/defs";
import { equipmentItemsById } from "@/game/equipment/catalog";
import type { ResolvedAttachmentProfile } from "@/game/equipment/system";
import type { AttachmentDebugBindingReport, TransformPose } from "@/game/equipment/schema";

interface AttachmentEditorViewportProps {
  binding: AttachmentDebugBindingReport | null;
  profile: ResolvedAttachmentProfile | null;
  presentationId: CharacterPresentationId | null;
  unitName: string | null;
  showSockets: boolean;
  showMarkers: boolean;
  showSkeleton: boolean;
  onPoseChange: (pose: TransformPose) => void;
}

type TransformMode = "translate" | "rotate";
type TransformSpace = "local" | "world";
type CameraViewPreset = "iso" | "front" | "back" | "left" | "right";

interface EditorPerformanceSample {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

const CAMERA_TARGET = new THREE.Vector3(0, 1.2, 0);
const CAMERA_PRESET_OFFSETS: Record<CameraViewPreset, [number, number, number]> = {
  iso: [2.45, 1.75, 3.05],
  front: [0, 1.45, 3.5],
  back: [0, 1.45, -3.5],
  left: [-3.45, 1.35, 0],
  right: [3.45, 1.35, 0],
};

const poseApproximatelyEqual = (left: TransformPose, right: TransformPose, epsilon = 0.0001) =>
  Math.abs(left.position.x - right.position.x) <= epsilon &&
  Math.abs(left.position.y - right.position.y) <= epsilon &&
  Math.abs(left.position.z - right.position.z) <= epsilon &&
  Math.abs(left.rotation.x - right.rotation.x) <= epsilon &&
  Math.abs(left.rotation.y - right.rotation.y) <= epsilon &&
  Math.abs(left.rotation.z - right.rotation.z) <= epsilon &&
  Math.abs(left.scale - right.scale) <= epsilon;

const clampPlaybackTime = (timeSec: number, durationSec: number) => {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  return THREE.MathUtils.clamp(timeSec, 0, durationSec);
};

const wrapPlaybackTime = (timeSec: number, durationSec: number) => {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  return ((timeSec % durationSec) + durationSec) % durationSec;
};

const formatPlaybackTime = (timeSec: number) => `${timeSec.toFixed(2)}s`;

function ToolbarIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="attachment-toolbar-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" focusable="false">
        {children}
      </svg>
    </span>
  );
}

function PlayIcon() {
  return <path d="M6.2 4.8v10.4L14.8 10 6.2 4.8z" fill="currentColor" />;
}

function PauseIcon() {
  return (
    <>
      <rect x="5.2" y="4.5" width="3.2" height="11" rx="0.9" fill="currentColor" />
      <rect x="11.6" y="4.5" width="3.2" height="11" rx="0.9" fill="currentColor" />
    </>
  );
}

function PrevFrameIcon() {
  return (
    <>
      <rect x="4.3" y="4.8" width="1.8" height="10.4" rx="0.8" fill="currentColor" />
      <path d="M13.6 4.8L7.2 10l6.4 5.2V4.8z" fill="currentColor" />
    </>
  );
}

function NextFrameIcon() {
  return (
    <>
      <path d="M6.4 4.8L12.8 10l-6.4 5.2V4.8z" fill="currentColor" />
      <rect x="13.9" y="4.8" width="1.8" height="10.4" rx="0.8" fill="currentColor" />
    </>
  );
}

function SampleIcon() {
  return (
    <>
      <path
        d="M4.2 12.8a1.1 1.1 0 0 1 1.6 0l1 .95 2.75-3.3a1.1 1.1 0 0 1 1.68-.06l1.53 1.72 2.78-4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14.5" cy="7.7" r="1.25" fill="currentColor" />
    </>
  );
}

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
    axes.renderOrder = 4;
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
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    materials.forEach((material) => {
      material.depthTest = false;
      material.transparent = true;
      material.opacity = 0.88;
    });
    root.parent?.add(helper);

    return () => {
      helper.parent?.remove(helper);
    };
  }, [enabled, root]);

  return null;
}

function EditorPerformanceProbe({
  onSample,
}: {
  onSample: (sample: EditorPerformanceSample) => void;
}) {
  const accumulatorRef = useRef({
    elapsed: 0,
    frames: 0,
    frameMs: 0,
  });

  useFrame(({ gl }, delta) => {
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
    });

    accumulator.elapsed = 0;
    accumulator.frames = 0;
    accumulator.frameMs = 0;
  });

  return null;
}

function AttachmentEditorPreviewScene({
  binding,
  profile,
  presentationId,
  characterModel,
  itemModel,
  showSockets,
  showMarkers,
  showSkeleton,
  clipId,
  transformMode,
  transformSpace,
  orbitEnabled,
  cameraViewPreset,
  cameraViewRevision,
  playbackPaused,
  scrubTimeSec,
  playbackReportStepSec,
  onPoseChange,
  onDraggingChange,
  onPlaybackTimeChange,
}: {
  binding: AttachmentDebugBindingReport;
  profile: ResolvedAttachmentProfile;
  presentationId: CharacterPresentationId;
  characterModel: NonNullable<ReturnType<typeof useCharacterModel>>;
  itemModel: NonNullable<ReturnType<typeof useEquipmentModel>>;
  showSockets: boolean;
  showMarkers: boolean;
  showSkeleton: boolean;
  clipId: string | null;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  orbitEnabled: boolean;
  cameraViewPreset: CameraViewPreset;
  cameraViewRevision: number;
  playbackPaused: boolean;
  scrubTimeSec: number;
  playbackReportStepSec: number;
  onPoseChange: (pose: TransformPose) => void;
  onDraggingChange: (dragging: boolean) => void;
  onPlaybackTimeChange: (timeSec: number) => void;
}) {
  const [rig, setRig] = useState<CharacterRig | null>(null);
  const [attachmentSystem, setAttachmentSystem] = useState<AttachmentSystem | null>(null);
  const [bindingRoot, setBindingRoot] = useState<THREE.Object3D | null>(null);
  const handleRef = useRef<ReturnType<AttachmentSystem["bind"]> | null>(null);
  const transformControlsRef = useRef<any>(null);
  const orbitControlsRef = useRef<any>(null);
  const lastPoseRef = useRef(profile.resolvedPoseOffset);
  const lastCommittedPoseRef = useRef(profile.resolvedPoseOffset);
  const poseCommitTimeoutRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const animatorRef = useRef<CharacterAnimator | null>(null);
  const lastReportedTimeRef = useRef(0);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    lastPoseRef.current = profile.resolvedPoseOffset;
    lastCommittedPoseRef.current = profile.resolvedPoseOffset;
  }, [profile.resolvedPoseOffset]);

  useEffect(() => {
    return () => {
      if (poseCommitTimeoutRef.current !== null) {
        window.clearTimeout(poseCommitTimeoutRef.current);
        poseCommitTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextRig = new CharacterRig(characterModel, presentationId);
    nextRig.setActorTransform({ x: 0, y: 0, z: 0 }, 0);
    setRig(nextRig);

    return () => {
      nextRig.dispose();
      setRig(null);
    };
  }, [characterModel, presentationId]);

  useEffect(() => {
    if (!rig) {
      setAttachmentSystem(null);
      return;
    }

    const nextAttachmentSystem = new AttachmentSystem(rig);
    setAttachmentSystem(nextAttachmentSystem);
    return () => {
      nextAttachmentSystem.clear();
      setAttachmentSystem(null);
    };
  }, [rig]);

  useEffect(() => {
    if (!attachmentSystem) {
      setBindingRoot(null);
      handleRef.current = null;
      return;
    }

    const handle = attachmentSystem.bind("attachment_editor_binding", {
      characterId: "attachment_editor",
      characterName: "Attachment Editor",
      itemId: binding.itemId,
      socketId: binding.socketId,
      stanceFamily: binding.stanceFamily,
      itemScene: itemModel.scene,
      poseOffset: profile.resolvedPoseOffset,
      sourceMarkerId: profile.sourceMarkerId,
    });

    handleRef.current = handle;
    setBindingRoot(handle?.bindingRoot ?? null);

    return () => {
      handleRef.current = null;
      attachmentSystem.unbind("attachment_editor_binding");
      setBindingRoot(null);
    };
  }, [
    attachmentSystem,
    binding.itemId,
    binding.socketId,
    binding.stanceFamily,
    itemModel.scene,
    profile.id,
    profile.sourceMarkerId,
  ]);

  useEffect(() => {
    if (!attachmentSystem) {
      return;
    }

    attachmentSystem.updatePose("attachment_editor_binding", profile.resolvedPoseOffset);
    lastPoseRef.current = profile.resolvedPoseOffset;
  }, [attachmentSystem, profile.resolvedPoseOffset]);

  useEffect(() => {
    if (!rig) {
      animatorRef.current?.dispose();
      animatorRef.current = null;
      return;
    }

    const animator = new CharacterAnimator(rig.skeletonRoot, characterModel.clipRegistry);
    animatorRef.current = animator;

    return () => {
      animator.dispose();
      animatorRef.current = null;
    };
  }, [characterModel.clipRegistry, rig]);

  useEffect(() => {
    const controls = orbitControlsRef.current;
    const offset = CAMERA_PRESET_OFFSETS[cameraViewPreset];
    camera.position.set(
      CAMERA_TARGET.x + offset[0],
      CAMERA_TARGET.y + offset[1],
      CAMERA_TARGET.z + offset[2],
    );
    camera.lookAt(CAMERA_TARGET);
    if (controls) {
      controls.target.copy(CAMERA_TARGET);
      controls.update();
    }
    invalidate();
  }, [camera, cameraViewPreset, cameraViewRevision, invalidate]);

  useEffect(() => {
    const animator = animatorRef.current;
    const availableClipIds = animator?.getAvailableClipIds() ?? [];
    const nextClipId = (clipId && availableClipIds.includes(clipId as PresentationAnimationId) ? (clipId as PresentationAnimationId) : null) ?? (availableClipIds.includes("idle") ? "idle" : availableClipIds[0] ?? null);

    if (!animator || !nextClipId) {
      onPlaybackTimeChange(0);
      invalidate();
      return;
    }

    const nextTime = clampPlaybackTime(scrubTimeSec, animator.getClipDuration(nextClipId));
    animator.applyPreviewState({
      clipId: nextClipId,
      paused: playbackPaused,
      timeSec: nextTime,
    });
    lastReportedTimeRef.current = nextTime;
    onPlaybackTimeChange(nextTime);
    invalidate();
  }, [clipId, invalidate, onPlaybackTimeChange, playbackPaused, scrubTimeSec]);

  useEffect(() => {
    const animator = animatorRef.current;
    const activeClipId = animator?.getActiveClipId() ?? null;
    if (!animator || !activeClipId) {
      return;
    }

    if (!playbackPaused) {
      return;
    }

    const nextTime = clampPlaybackTime(scrubTimeSec, animator.getClipDuration(activeClipId));
    animator.applyPreviewState({
      clipId: activeClipId,
      paused: true,
      timeSec: nextTime,
    });
    lastReportedTimeRef.current = nextTime;
    onPlaybackTimeChange(nextTime);
    invalidate();
  }, [invalidate, onPlaybackTimeChange, playbackPaused, scrubTimeSec]);

  useEffect(() => {
    const controls = transformControlsRef.current;
    if (!controls || !bindingRoot || !handleRef.current) {
      return;
    }

    const commitPose = (nextPose: TransformPose, immediate = false) => {
      const flush = () => {
        poseCommitTimeoutRef.current = null;
        if (poseApproximatelyEqual(lastCommittedPoseRef.current, nextPose)) {
          return;
        }
        lastCommittedPoseRef.current = nextPose;
        onPoseChange(nextPose);
      };

      if (immediate || !isDraggingRef.current) {
        if (poseCommitTimeoutRef.current !== null) {
          window.clearTimeout(poseCommitTimeoutRef.current);
          poseCommitTimeoutRef.current = null;
        }
        flush();
        return;
      }

      if (poseCommitTimeoutRef.current !== null) {
        return;
      }

      poseCommitTimeoutRef.current = window.setTimeout(flush, 90);
    };

    const handleObjectChange = () => {
      const nextPose = handleRef.current?.readPose();
      if (!nextPose || poseApproximatelyEqual(lastPoseRef.current, nextPose)) {
        return;
      }

      lastPoseRef.current = nextPose;
      commitPose(nextPose);
    };

    const handleDraggingChanged = (event: { value: boolean }) => {
      const dragging = Boolean(event.value);
      isDraggingRef.current = dragging;
      onDraggingChange(dragging);
      if (!dragging) {
        const nextPose = handleRef.current?.readPose();
        if (nextPose) {
          lastPoseRef.current = nextPose;
          commitPose(nextPose, true);
        }
      }
    };

    controls.addEventListener("objectChange", handleObjectChange);
    controls.addEventListener("dragging-changed", handleDraggingChanged);

    return () => {
      controls.removeEventListener("objectChange", handleObjectChange);
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
      if (poseCommitTimeoutRef.current !== null) {
        window.clearTimeout(poseCommitTimeoutRef.current);
        poseCommitTimeoutRef.current = null;
      }
      isDraggingRef.current = false;
      onDraggingChange(false);
    };
  }, [bindingRoot, onDraggingChange, onPoseChange]);

  useFrame((_, delta) => {
    const animator = animatorRef.current;
    const activeClipId = animator?.getActiveClipId() ?? null;
    if (!animator || !activeClipId || playbackPaused) {
      return;
    }

    const nextTime = wrapPlaybackTime(animator.updatePreview(delta), animator.getClipDuration(activeClipId));
    if (Math.abs(nextTime - lastReportedTimeRef.current) >= playbackReportStepSec * 0.5) {
      lastReportedTimeRef.current = nextTime;
      onPlaybackTimeChange(nextTime);
    }
  });

  const visibleSocketIds = rig ? [binding.socketId] : [];
  const activeMarkerNode = useMemo(() => {
    const itemDefinition = equipmentItemsById[binding.itemId];
    const markerDefinition = itemDefinition.markers[profile.sourceMarkerId];
    if (!bindingRoot || !markerDefinition || markerDefinition.kind !== "node" || !markerDefinition.nodeName) {
      return null;
    }
    return bindingRoot.getObjectByName(markerDefinition.nodeName);
  }, [binding.itemId, bindingRoot, profile.sourceMarkerId]);

  return (
    <>
      <color attach="background" args={["#f3ead8"]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight intensity={0.68} groundColor="#8f744d" color="#fff3df" />
      <directionalLight intensity={1.55} position={[4, 8, 5]} />
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enabled={orbitEnabled}
        enablePan={false}
        target={CAMERA_TARGET}
        minDistance={1.4}
        maxDistance={7.5}
        minPolarAngle={0.18}
        maxPolarAngle={Math.PI - 0.18}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
      <gridHelper args={[6, 12, "#c8b393", "#ddcfbc"]} position={[0, 0.001, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.4, 48]} />
        <meshStandardMaterial color="#ece0cb" />
      </mesh>
      {rig ? <primitive object={rig.actorRoot} /> : null}
      <SkeletonDebugHelper root={rig?.skeletonRoot ?? null} enabled={showSkeleton} />
        {showSockets
          ? visibleSocketIds.map((socketId) => (
              <NodeAxesHelper key={socketId} parent={rig?.getSocketNode(socketId) ?? null} size={0.18} />
            ))
          : null}
      {showMarkers && bindingRoot ? <NodeAxesHelper parent={bindingRoot} size={0.15} /> : null}
      {showMarkers && activeMarkerNode ? <NodeAxesHelper parent={activeMarkerNode} size={0.12} /> : null}
      {bindingRoot ? (
        <TransformControls
          ref={transformControlsRef}
          object={bindingRoot}
          mode={transformMode}
          space={transformSpace}
          showZ
          showY
          showX
          size={0.72}
        />
      ) : null}
    </>
  );
}

export function AttachmentEditorViewport({
  binding,
  profile,
  presentationId,
  unitName,
  showSockets,
  showMarkers,
  showSkeleton,
  onPoseChange,
}: AttachmentEditorViewportProps) {
  const [clipId, setClipId] = useState<string | null>("idle");
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [transformSpace, setTransformSpace] = useState<TransformSpace>("local");
  const [isDragging, setIsDragging] = useState(false);
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [playbackPaused, setPlaybackPaused] = useState(true);
  const [scrubTimeSec, setScrubTimeSec] = useState(0);
  const [sampleFps, setSampleFps] = useState(30);
  const [cameraViewPreset, setCameraViewPreset] = useState<CameraViewPreset>("iso");
  const [cameraViewRevision, setCameraViewRevision] = useState(0);
  const [performanceSample, setPerformanceSample] = useState<EditorPerformanceSample>({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
  });
  const fallbackItemModelUrl = Object.values(equipmentItemsById)[0]?.modelUrl ?? "";
  const characterModel = useCharacterModel(presentationId ?? "leader");
  const itemDefinition = binding ? equipmentItemsById[binding.itemId] : null;
  const itemModel = useEquipmentModel(itemDefinition?.modelUrl ?? fallbackItemModelUrl);
  const availableClipIds = useMemo(() => (characterModel ? Object.keys(characterModel.animations) : []), [characterModel]);
  const animationMap = characterModel?.animations as Record<string, THREE.AnimationClip | undefined> | undefined;
  const selectedClip = clipId && animationMap ? animationMap[clipId] ?? null : null;
  const clipDurationSec = selectedClip?.duration ?? 0;
  const frameStepSec = sampleFps > 0 ? 1 / sampleFps : 1 / 30;
  const currentFrame = clipDurationSec > 0 ? Math.round(clampPlaybackTime(scrubTimeSec, clipDurationSec) * sampleFps) : 0;
  const maxFrame = clipDurationSec > 0 ? Math.max(1, Math.round(clipDurationSec * sampleFps)) : 1;

  useEffect(() => {
    if (!availableClipIds.length) {
      if (clipId !== null) {
        setClipId(null);
      }
      return;
    }

    if (clipId && availableClipIds.includes(clipId)) {
      return;
    }

    setClipId(availableClipIds.includes("idle") ? "idle" : availableClipIds[0]);
  }, [availableClipIds, clipId]);

  useEffect(() => {
    setScrubTimeSec(0);
    setPlaybackPaused(true);
  }, [clipId]);

  useEffect(() => {
    if (clipDurationSec <= 0) {
      if (scrubTimeSec !== 0) {
        setScrubTimeSec(0);
      }
      return;
    }

    if (scrubTimeSec > clipDurationSec) {
      setScrubTimeSec(clipDurationSec);
    }
  }, [clipDurationSec, scrubTimeSec]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setOrbitLocked((current) => !current);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  if (!binding || !profile || !presentationId) {
    return <p className="hud-empty">Select a live visible binding to open the attachment editor.</p>;
  }

  return (
    <div className="attachment-editor-viewport-shell">
      <div className="attachment-editor-toolbar">
        <div className="attachment-editor-toolbar-group">
          <span>{unitName ?? "Unit"}</span>
          <strong>{itemDefinition?.name ?? binding.itemId}</strong>
        </div>
        <div className="attachment-editor-toolbar-group">
          <span>Socket</span>
          <strong>{binding.socketId}</strong>
        </div>
        <div className="attachment-editor-toolbar-group attachment-editor-toolbar-group--stats">
          <span>Editor</span>
          <strong>{performanceSample.drawCalls} calls</strong>
          <small>
            {performanceSample.fps.toFixed(0)} FPS · {performanceSample.frameMs.toFixed(1)} ms ·{" "}
            {performanceSample.triangles.toLocaleString()} tris
          </small>
        </div>
      </div>
      <div className="attachment-editor-toolbar attachment-editor-toolbar--compact">
        <label className="attachment-editor-select">
          <span>Clip</span>
          <select
            value={clipId ?? ""}
            onChange={(event) => {
              setClipId(event.target.value || null);
            }}
          >
            {availableClipIds.length > 0 ? (
              availableClipIds.map((availableClipId) => (
                <option key={availableClipId} value={availableClipId}>
                  {availableClipId}
                </option>
              ))
            ) : (
              <option value="">Loading</option>
            )}
          </select>
        </label>
        <div className="attachment-editor-chip-row attachment-editor-chip-row--transport">
          <button
            className={`debug-chip-button attachment-toolbar-button${!playbackPaused ? " is-active" : ""}`}
            disabled={!clipDurationSec}
            onClick={() => {
              setPlaybackPaused((current) => !current);
            }}
            type="button"
          >
            <ToolbarIcon>
              {playbackPaused ? <PlayIcon /> : <PauseIcon />}
            </ToolbarIcon>
            <span>{playbackPaused ? "Play" : "Pause"}</span>
          </button>
          <button
            className="debug-chip-button attachment-toolbar-button"
            disabled={!clipDurationSec}
            onClick={() => {
              setPlaybackPaused(true);
              setScrubTimeSec((current) => Math.max(0, current - frameStepSec));
            }}
            type="button"
          >
            <ToolbarIcon>
              <PrevFrameIcon />
            </ToolbarIcon>
            <span>Prev</span>
          </button>
          <button
            className="debug-chip-button attachment-toolbar-button"
            disabled={!clipDurationSec}
            onClick={() => {
              setPlaybackPaused(true);
              setScrubTimeSec((current) => clampPlaybackTime(current + frameStepSec, clipDurationSec));
            }}
            type="button"
          >
            <ToolbarIcon>
              <NextFrameIcon />
            </ToolbarIcon>
            <span>Next</span>
          </button>
        </div>
        <label className="attachment-editor-select attachment-editor-select--compact attachment-editor-select--with-icon">
          <span>Sample</span>
          <div className="attachment-editor-select-shell">
            <ToolbarIcon>
              <SampleIcon />
            </ToolbarIcon>
            <select
              value={sampleFps}
              onChange={(event) => {
                setSampleFps(Number(event.target.value));
              }}
            >
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>
        </label>
      </div>
      <div className="attachment-editor-timeline">
        <input
          className="attachment-editor-range"
          type="range"
          min={0}
          max={clipDurationSec || 0}
          step={frameStepSec}
          value={clipDurationSec ? clampPlaybackTime(scrubTimeSec, clipDurationSec) : 0}
          onChange={(event) => {
            setPlaybackPaused(true);
            setScrubTimeSec(Number(event.target.value));
          }}
        />
      </div>
      <div className="attachment-editor-canvas">
        <div className="attachment-editor-view-overlay attachment-editor-view-overlay--left">
          <div className="attachment-editor-chip-row attachment-editor-chip-row--overlay-wide">
            <button
              className={`debug-chip-button${transformMode === "translate" ? " is-active" : ""}`}
              onClick={() => {
                setTransformMode("translate");
              }}
              type="button"
            >
              Move
            </button>
            <button
              className={`debug-chip-button${transformMode === "rotate" ? " is-active" : ""}`}
              onClick={() => {
                setTransformMode("rotate");
              }}
              type="button"
            >
              Rotate
            </button>
            <button
              className={`debug-chip-button${transformSpace === "local" ? " is-active" : ""}`}
              onClick={() => {
                setTransformSpace("local");
              }}
              type="button"
            >
              Local
            </button>
            <button
              className={`debug-chip-button${transformSpace === "world" ? " is-active" : ""}`}
              onClick={() => {
                setTransformSpace("world");
              }}
              type="button"
            >
              World
            </button>
          </div>
        </div>
        <div className="attachment-editor-view-overlay">
          <div className="attachment-editor-chip-row attachment-editor-chip-row--view attachment-editor-chip-row--view-overlay">
            {(["iso", "front", "left", "right", "back"] as CameraViewPreset[]).map((viewPreset) => (
              <button
                key={viewPreset}
                className={`debug-chip-button${cameraViewPreset === viewPreset ? " is-active" : ""}`}
                onClick={() => {
                  setCameraViewPreset(viewPreset);
                  setCameraViewRevision((current) => current + 1);
                }}
                type="button"
              >
                {viewPreset}
              </button>
            ))}
          </div>
        </div>
        {characterModel && itemModel ? (
          <Canvas
            camera={{ position: [2.45, 1.75, 3.05], fov: 34 }}
            frameloop={playbackPaused && !isDragging ? "demand" : "always"}
            shadows={false}
            dpr={[1, 1.5]}
            gl={{
              antialias: true,
              powerPreference: "high-performance",
            }}
          >
            <EditorPerformanceProbe onSample={setPerformanceSample} />
            <AttachmentEditorPreviewScene
              key={`${binding.profileId}-${binding.itemId}-${binding.socketId}`}
              binding={binding}
              profile={profile}
              presentationId={presentationId}
              characterModel={characterModel}
              itemModel={itemModel}
              showSockets={showSockets}
              showMarkers={showMarkers}
              showSkeleton={showSkeleton}
              clipId={clipId}
              transformMode={transformMode}
              transformSpace={transformSpace}
              orbitEnabled={!isDragging && !orbitLocked}
              cameraViewPreset={cameraViewPreset}
              cameraViewRevision={cameraViewRevision}
              playbackPaused={playbackPaused}
              scrubTimeSec={scrubTimeSec}
              playbackReportStepSec={frameStepSec}
              onPoseChange={onPoseChange}
              onDraggingChange={setIsDragging}
              onPlaybackTimeChange={(timeSec) => {
                setScrubTimeSec(timeSec);
              }}
            />
          </Canvas>
        ) : (
          <div className="attachment-editor-loading">Loading preview assets...</div>
        )}
      </div>
      <div className="attachment-editor-status attachment-editor-status--footer">
        <span>
          Frame {Math.min(maxFrame, currentFrame + 1)} / {maxFrame}
          {orbitLocked ? " · Orbit locked" : ""}
          {isDragging ? " · Editing live" : ""}
        </span>
        <strong>
          {formatPlaybackTime(scrubTimeSec)} / {formatPlaybackTime(clipDurationSec)}
        </strong>
      </div>
    </div>
  );
}
