import * as THREE from "three";
import type { AnimatorFrame, CharacterClipRegistry, PresentationAnimationId } from "@/game/animation/types";

export interface CharacterAnimatorPreviewState {
  clipId: PresentationAnimationId | null;
  paused: boolean;
  timeSec: number;
}

const LOOPING_IDS = new Set<PresentationAnimationId>([
  "idle",
  "run",
  "runLeft",
  "runRight",
  "runBack",
  "walkLeft",
  "walkRight",
  "walkBack",
  "guard",
  "block",
]);

export class CharacterAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<PresentationAnimationId, THREE.AnimationAction>> = {};
  private activeClipId: PresentationAnimationId | null = null;

  constructor(
    root: THREE.Object3D,
    private readonly registry: CharacterClipRegistry,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    Object.values(this.registry.descriptors).forEach((descriptor) => {
      if (!descriptor) {
        return;
      }
      const action = this.mixer.clipAction(descriptor.clip, root);
      const isLooping = LOOPING_IDS.has(descriptor.registration.id);
      action.loop = isLooping ? THREE.LoopRepeat : THREE.LoopOnce;
      action.clampWhenFinished = !isLooping;
      this.actions[descriptor.registration.id] = action;
    });
  }

  dispose() {
    this.mixer.stopAllAction();
  }

  getActiveClipId() {
    return this.activeClipId;
  }

  getAvailableClipIds() {
    return Object.keys(this.actions) as PresentationAnimationId[];
  }

  getClipDuration(clipId: PresentationAnimationId | null) {
    if (!clipId) {
      return 0;
    }
    return this.actions[clipId]?.getClip().duration ?? 0;
  }

  getCurrentTime() {
    if (!this.activeClipId) {
      return 0;
    }
    return this.actions[this.activeClipId]?.time ?? 0;
  }

  applyFrame(frame: AnimatorFrame, deltaSeconds: number, enabled = true) {
    if (!enabled) {
      return;
    }

    if (frame.clipId && frame.clipId !== this.activeClipId) {
      const nextAction = this.actions[frame.clipId];
      if (nextAction) {
        if (this.activeClipId) {
          this.actions[this.activeClipId]?.fadeOut(frame.fadeDuration);
        }
        nextAction.reset();
        nextAction.setEffectiveTimeScale(frame.playbackRate);
        nextAction.fadeIn(frame.fadeDuration).play();
        this.activeClipId = frame.clipId;
      }
    }

    if (this.activeClipId) {
      this.actions[this.activeClipId]?.setEffectiveTimeScale(frame.playbackRate);
    }

    this.mixer.update(deltaSeconds);
  }

  applyPreviewState(state: CharacterAnimatorPreviewState) {
    Object.values(this.actions).forEach((action) => {
      if (!action) {
        return;
      }
      action.stop();
      action.enabled = false;
      action.paused = false;
    });

    if (!state.clipId) {
      this.activeClipId = null;
      return;
    }

    const action = this.actions[state.clipId];
    if (!action) {
      this.activeClipId = null;
      return;
    }

    action.enabled = true;
    action.reset();
    action.play();
    this.mixer.setTime(state.timeSec);
    action.paused = state.paused;
    this.activeClipId = state.clipId;
  }

  updatePreview(deltaSeconds: number) {
    const activeClipId = this.activeClipId;
    if (!activeClipId) {
      return 0;
    }
    const action = this.actions[activeClipId];
    if (!action || action.paused) {
      return action?.time ?? 0;
    }
    this.mixer.update(deltaSeconds);
    return action.time;
  }
}
