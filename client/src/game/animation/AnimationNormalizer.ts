import * as THREE from "three";
import type {
  AnimationNormalizationPolicy,
  NormalizedClipReport,
  PresentationAnimationId,
} from "@/game/animation/types";

const ROOT_NAME_PATTERNS = ["root", "armature", "rootnode"];
const PELVIS_NAME_PATTERNS = ["hips", "pelvis", "mixamorighips"];

const getTrackNodeName = (trackName: string) => trackName.toLowerCase().replace(/\.(position|quaternion)$/, "");

const isRootNode = (trackName: string) => ROOT_NAME_PATTERNS.some((pattern) => getTrackNodeName(trackName).includes(pattern));
const isPelvisNode = (trackName: string) => PELVIS_NAME_PATTERNS.some((pattern) => getTrackNodeName(trackName).includes(pattern));

const neutralizePelvisYawTrack = (track: THREE.QuaternionKeyframeTrack) => {
  const values = track.values.slice();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  quaternion.fromArray(values, 0);
  euler.setFromQuaternion(quaternion, "YXZ");
  const baseYaw = euler.y;

  for (let index = 0; index < values.length; index += 4) {
    quaternion.fromArray(values, index);
    euler.setFromQuaternion(quaternion, "YXZ");
    euler.y = baseYaw;
    quaternion.setFromEuler(euler);
    quaternion.toArray(values, index);
  }

  return new THREE.QuaternionKeyframeTrack(track.name, track.times, values, track.getInterpolation());
};

const neutralizePelvisTranslationTrack = (track: THREE.VectorKeyframeTrack) => {
  const values = track.values.slice();
  const baseX = values[0] ?? 0;
  const baseZ = values[2] ?? 0;
  for (let index = 0; index < values.length; index += 3) {
    values[index] = baseX;
    values[index + 2] = baseZ;
  }
  return new THREE.VectorKeyframeTrack(track.name, track.times, values, track.getInterpolation());
};

export class AnimationNormalizer {
  normalizeClip(
    clipId: PresentationAnimationId,
    clip: THREE.AnimationClip,
    policy: AnimationNormalizationPolicy,
  ): { clip: THREE.AnimationClip; report: NormalizedClipReport } {
    const normalizedClip = clip.clone().resetDuration().trim();
    const removedTracks: string[] = [];
    const normalizedTracks: string[] = [];

    if (policy === "preserve" || policy === "rootMotion") {
      normalizedClip.optimize();
      normalizedClip.name = clipId;
      return {
        clip: normalizedClip,
        report: {
          clipId,
          policy,
          removedTracks,
          normalizedTracks,
          rootMotionStripped: false,
          summary: ["preserved"],
        },
      };
    }

    normalizedClip.tracks = normalizedClip.tracks.flatMap((track) => {
      const isPosition = track instanceof THREE.VectorKeyframeTrack && track.name.toLowerCase().endsWith(".position");
      const isRotation = track instanceof THREE.QuaternionKeyframeTrack && track.name.toLowerCase().endsWith(".quaternion");

      if (!isPosition && !isRotation) {
        return [track];
      }

      if (isRootNode(track.name)) {
        removedTracks.push(track.name);
        return [];
      }

      if (isPelvisNode(track.name) && isPosition) {
        normalizedTracks.push(`${track.name}:lock_xz`);
        return [neutralizePelvisTranslationTrack(track)];
      }

      if (isPelvisNode(track.name) && isRotation) {
        normalizedTracks.push(`${track.name}:lock_yaw`);
        return [neutralizePelvisYawTrack(track)];
      }

      return [track];
    });

    normalizedClip.optimize();
    normalizedClip.name = clipId;
    return {
      clip: normalizedClip,
      report: {
        clipId,
        policy,
        removedTracks,
        normalizedTracks,
        rootMotionStripped: removedTracks.length > 0 || normalizedTracks.length > 0,
        summary: [
          removedTracks.length > 0 ? `removed:${removedTracks.length}` : "removed:0",
          normalizedTracks.length > 0 ? `normalized:${normalizedTracks.length}` : "normalized:0",
        ],
      },
    };
  }
}
