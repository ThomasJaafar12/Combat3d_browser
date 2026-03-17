import { assetUrls } from "@/game/assets";
import type { Vec3 } from "@/game/defs";
import { vec3 } from "@/game/math";

export type AudioCueId =
  | "basicAttackHit"
  | "spellCast"
  | "spellImpact"
  | "unitDowned"
  | "revive"
  | "uiConfirm"
  | "levelUp";

interface AudioCueDefinition {
  url: string;
  baseVolume: number;
  playbackRate: number;
}

export interface AudioPlaybackRequest {
  cue: AudioCueId;
  position?: Vec3 | null;
  volume?: number;
  playbackRate?: number;
}

const cueDefinitions: Record<AudioCueId, AudioCueDefinition> = {
  basicAttackHit: {
    url: assetUrls.audio.hitBlade,
    baseVolume: 0.72,
    playbackRate: 1,
  },
  spellCast: {
    url: assetUrls.audio.uiConfirm,
    baseVolume: 0.48,
    playbackRate: 1.04,
  },
  spellImpact: {
    url: assetUrls.audio.spellImpact,
    baseVolume: 0.68,
    playbackRate: 1,
  },
  unitDowned: {
    url: assetUrls.audio.hitBody,
    baseVolume: 0.74,
    playbackRate: 0.92,
  },
  revive: {
    url: assetUrls.audio.uiLevelUp,
    baseVolume: 0.62,
    playbackRate: 1.08,
  },
  uiConfirm: {
    url: assetUrls.audio.uiConfirm,
    baseVolume: 0.42,
    playbackRate: 1,
  },
  levelUp: {
    url: assetUrls.audio.uiLevelUp,
    baseVolume: 0.76,
    playbackRate: 1,
  },
};

export class CombatAudioSystem {
  private context: AudioContext | null = null;
  private buffers = new Map<AudioCueId, AudioBuffer | null>();
  private failedCues = new Set<AudioCueId>();
  private preloadPromise: Promise<void> | null = null;
  private listenerPosition = vec3();
  private listenerYaw = 0;

  async preload() {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    const context = this.ensureContext();
    if (!context) {
      return;
    }

    this.preloadPromise = Promise.all(
      (Object.keys(cueDefinitions) as AudioCueId[]).map((cue) => this.loadCueBuffer(cue)),
    )
      .then(() => undefined)
      .catch(() => undefined);

    return this.preloadPromise;
  }

  async unlock() {
    const context = this.ensureContext();
    if (!context || context.state === "running") {
      return;
    }

    try {
      await context.resume();
    } catch {
      // Browser autoplay restrictions should not break gameplay.
    }
  }

  updateListener(position: Vec3, yaw: number) {
    this.listenerPosition = { ...position };
    this.listenerYaw = yaw;
  }

  play(request: AudioPlaybackRequest) {
    void this.playInternal(request);
  }

  private ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    const ContextCtor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextCtor) {
      return null;
    }

    if (!this.context) {
      this.context = new ContextCtor();
    }

    return this.context;
  }

  private async loadCueBuffer(cue: AudioCueId) {
    if (this.buffers.has(cue) || this.failedCues.has(cue)) {
      return this.buffers.get(cue) ?? null;
    }

    const context = this.ensureContext();
    if (!context) {
      return null;
    }

    try {
      const response = await fetch(cueDefinitions[cue].url);
      if (!response.ok) {
        throw new Error(`Audio request failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
      this.buffers.set(cue, audioBuffer);
      return audioBuffer;
    } catch (error) {
      this.failedCues.add(cue);
      console.warn(`Audio cue failed to load: ${cue}`, error);
      this.buffers.set(cue, null);
      return null;
    }
  }

  private async playInternal(request: AudioPlaybackRequest) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        return;
      }
    }

    const buffer = await this.loadCueBuffer(request.cue);
    if (!buffer) {
      return;
    }

    const definition = cueDefinitions[request.cue];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (request.playbackRate ?? 1) * definition.playbackRate;

    const gainNode = context.createGain();
    gainNode.gain.value = this.resolveGain(request, definition.baseVolume);

    source.connect(gainNode);

    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = this.resolvePan(request.position ?? null);
      gainNode.connect(panner);
      panner.connect(context.destination);
    } else {
      gainNode.connect(context.destination);
    }

    try {
      source.start(0);
    } catch {
      return;
    }

    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
  }

  private resolveGain(request: AudioPlaybackRequest, baseVolume: number) {
    const requestedVolume = request.volume ?? 1;
    if (!request.position) {
      return baseVolume * requestedVolume;
    }

    const dx = request.position.x - this.listenerPosition.x;
    const dz = request.position.z - this.listenerPosition.z;
    const distance = Math.hypot(dx, dz);
    const attenuation = Math.max(0.18, 1 - distance / 24);
    return baseVolume * requestedVolume * attenuation;
  }

  private resolvePan(position: Vec3 | null) {
    if (!position) {
      return 0;
    }

    const dx = position.x - this.listenerPosition.x;
    const dz = position.z - this.listenerPosition.z;
    const distance = Math.max(1, Math.hypot(dx, dz));
    const forwardX = Math.sin(this.listenerYaw);
    const forwardZ = Math.cos(this.listenerYaw);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    return Math.max(-1, Math.min(1, (dx * rightX + dz * rightZ) / distance));
  }
}

export const createCombatAudioSystem = () => new CombatAudioSystem();
