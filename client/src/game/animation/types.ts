import type * as THREE from "three";
import type { StanceFamilyId } from "@/game/equipment/schema";
import type { CharacterPresentationId } from "@/game/defs";
import type { LocomotionMode, RuntimeLocomotionTelemetry, RuntimePresentationTelemetry } from "@/game/locomotion/types";

export type PresentationAnimationId =
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

export type AnimationClipTag =
  | "idle"
  | "locomotion"
  | "attack"
  | "cast"
  | "hit"
  | "death"
  | "guard"
  | "block"
  | "draw"
  | "release";

export type LocomotionDirection = "forward" | "left" | "right" | "backward" | "inPlace";
export type AnimationLoopMode = "loop" | "once";
export type AnimationNormalizationPolicy = "preserve" | "codeDrivenPresentation" | "rootMotion";

export interface NormalizedClipReport {
  clipId: PresentationAnimationId;
  policy: AnimationNormalizationPolicy;
  removedTracks: string[];
  normalizedTracks: string[];
  rootMotionStripped: boolean;
  summary: string[];
}

export interface ClipRegistration {
  id: PresentationAnimationId;
  url: string;
  tag: AnimationClipTag;
  direction?: LocomotionDirection;
  locomotionMode?: LocomotionMode;
  loopMode: AnimationLoopMode;
  normalizationPolicy: AnimationNormalizationPolicy;
}

export interface CharacterClipDescriptor {
  registration: ClipRegistration;
  clip: THREE.AnimationClip;
  report: NormalizedClipReport;
}

export interface ClipRegistryCapabilities {
  hasLocomotionDirections: boolean;
  hasStrafeWalk: boolean;
  hasBackpedal: boolean;
}

export interface CharacterClipRegistry {
  presentationId: CharacterPresentationId;
  descriptors: Partial<Record<PresentationAnimationId, CharacterClipDescriptor>>;
  capabilities: ClipRegistryCapabilities;
  diagnostics: Partial<Record<PresentationAnimationId, NormalizedClipReport>>;
}

export interface AnimationAdapterInput {
  locomotion: RuntimeLocomotionTelemetry;
  presentation: RuntimePresentationTelemetry;
  stanceFamily: StanceFamilyId;
  isDead: boolean;
  isDowned: boolean;
  isCasting: boolean;
  isAttacking: boolean;
}

export interface AnimatorFrame {
  clipId: PresentationAnimationId | null;
  loopMode: AnimationLoopMode;
  fadeDuration: number;
  playbackRate: number;
}
