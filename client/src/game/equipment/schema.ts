import type { CharacterPresentationId, EquipmentId, EquipmentSlotId, Vec3, WeaponKind } from "@/game/defs";

export type StorageSlotId = "back" | "hip_left" | "hip_right";
export type EquipmentLocationSlotId = EquipmentSlotId | StorageSlotId;
export type RigProfileId = "mixamo_humanoid_v1";
export type RetargetProfileId = "mixamo_compatible_v1";
export type RigBoneId = "root" | "spine_lower" | "spine_upper" | "hand_r" | "hand_l" | "forearm_l" | "pelvis";
export type SocketId =
  | "hand_r_weapon"
  | "hand_l_offhand"
  | "hand_l_bow"
  | "back_weapon"
  | "hip_l_weapon"
  | "hip_r_weapon";
export type SocketUsage =
  | "active_main_hand"
  | "active_off_hand"
  | "active_bow"
  | "storage_back"
  | "storage_hip_left"
  | "storage_hip_right";
export type EquipmentMarkerId =
  | "grip_primary"
  | "grip_secondary"
  | "storage_back"
  | "storage_hip"
  | "trail_start"
  | "trail_end"
  | "aim_pivot";
export type StanceFamilyId = "unarmed" | "one_hand" | "one_hand_shield" | "bow" | "focus";
export type EquipmentFamilyId = "sword_1h" | "shield" | "bow" | "polearm_2h" | "axe_1h" | "maul_1h" | "focus";
export type DominantHand = "left" | "right" | "either";

export interface TransformPose {
  position: Vec3;
  rotation: Vec3;
  scale: number;
}

export interface CharacterRigSocketDefinition {
  parentBoneId: RigBoneId;
  helperNodeName?: string;
  localPose: TransformPose;
  usage: SocketUsage;
}

export interface CharacterRigProfileDefinition {
  id: RigProfileId;
  runtimeAssetForward: "+Z";
  scaleMetersPerUnit: number;
  retargetProfileId: RetargetProfileId;
  compatiblePresentationIds: CharacterPresentationId[];
  boneMap: Record<RigBoneId, string>;
  requiredBones: RigBoneId[];
  sockets: Record<SocketId, CharacterRigSocketDefinition>;
}

export interface RetargetProfileDefinition {
  id: RetargetProfileId;
  sourceFamily: "mixamo";
  notes: string;
  knownLimitations: string[];
}

export interface EquipmentMarkerDefinition {
  kind: "node" | "synthetic";
  nodeName?: string;
  pose?: TransformPose;
}

export interface EquipmentAnimationRequirements {
  stanceFamily: StanceFamilyId;
  requiredClipTags: string[];
  supportsOffHandShield: boolean;
}

export interface EquipmentHandednessDefinition {
  dominantHand: DominantHand;
  supportHand: DominantHand | null;
  mirrorAllowed: boolean;
}

export interface EquipmentCorrectiveHooksDefinition {
  offHandTargetMarkerId: EquipmentMarkerId | null;
  aimPivotMarkerId: EquipmentMarkerId | null;
}

export interface EquipmentItemDefinition {
  id: EquipmentId;
  name: string;
  family: EquipmentFamilyId;
  class: "weapon" | "shield" | "focus";
  slotId: EquipmentSlotId;
  modelUrl: string;
  handedness: EquipmentHandednessDefinition;
  markers: Partial<Record<EquipmentMarkerId, EquipmentMarkerDefinition | null>>;
  storagePreferences: StorageSlotId[];
  animationRequirements: EquipmentAnimationRequirements;
  correctiveHooks: EquipmentCorrectiveHooksDefinition;
}

export interface AttachmentProfileDefinition {
  id: string;
  rigProfileId: RigProfileId;
  itemId: EquipmentId;
  socketId: SocketId;
  stanceFamily: StanceFamilyId | "storage";
  sourceMarkerId: EquipmentMarkerId;
  poseOffset: TransformPose;
  notes?: string;
}

export interface StanceProfileDefinition {
  id: StanceFamilyId;
  supportedWeaponKinds: WeaponKind[];
  requiredClips: string[];
  activeSocketMap: Partial<Record<EquipmentSlotId, SocketId>>;
  offHandRule: {
    mode: "none" | "future_ik_target";
    markerId: EquipmentMarkerId | null;
  };
  storageRule: {
    primarySlot: StorageSlotId | null;
  };
}

export interface EquipmentTransferState {
  itemId: EquipmentId;
  fromSlot: EquipmentLocationSlotId;
  toSlot: EquipmentLocationSlotId;
  startedAtMs: number;
}

export interface EquipmentState {
  equipState: "ready" | "stowed";
  activeSlots: Partial<Record<EquipmentSlotId, EquipmentId>>;
  storageSlots: Partial<Record<StorageSlotId, EquipmentId>>;
  pendingTransfer: EquipmentTransferState | null;
}

export interface VisibleEquipmentBinding {
  itemId: EquipmentId;
  sourceSlot: EquipmentLocationSlotId;
  socketId: SocketId;
  stanceFamily: StanceFamilyId | "storage";
  profileId: string;
  sourceMarkerId: EquipmentMarkerId;
}

export interface AttachmentDebugBindingReport {
  itemId: EquipmentId;
  sourceSlot: EquipmentLocationSlotId;
  socketId: SocketId;
  stanceFamily: StanceFamilyId | "storage";
  profileId: string;
  sourceMarkerId: EquipmentMarkerId;
}

export interface AttachmentDebugReport {
  unitId: string;
  unitName: string;
  rigProfileId: RigProfileId;
  stanceFamily: StanceFamilyId;
  resolvedBones: Partial<Record<RigBoneId, string>>;
  resolvedSockets: Partial<Record<SocketId, string>>;
  visibleBindings: AttachmentDebugBindingReport[];
}

export interface AttachmentProfileOverrideMap {
  [profileId: string]: TransformPose | undefined;
}

export const createPose = (
  position: Vec3 = { x: 0, y: 0, z: 0 },
  rotation: Vec3 = { x: 0, y: 0, z: 0 },
  scale = 1,
): TransformPose => ({
  position,
  rotation,
  scale,
});

export const clonePose = (pose: TransformPose): TransformPose =>
  createPose({ ...pose.position }, { ...pose.rotation }, pose.scale);

export const identityPose = () => createPose();
