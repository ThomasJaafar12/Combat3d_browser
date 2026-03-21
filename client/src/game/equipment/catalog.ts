import { prototypeCatalog } from "@/game/content";
import type { CharacterPresentationId, EquipmentId } from "@/game/defs";
import {
  createPose,
  type AttachmentProfileDefinition,
  type CharacterRigProfileDefinition,
  type EquipmentItemDefinition,
  type RetargetProfileDefinition,
  type RigProfileId,
  type SocketId,
  type StanceProfileDefinition,
  type StanceFamilyId,
} from "@/game/equipment/schema";

const presentions: CharacterPresentationId[] = [
  "leader",
  "companion_paladin",
  "companion_ranged",
  "companion_support",
  "enemy_melee",
  "enemy_ranged",
  "enemy_tank",
];

export const retargetProfiles: RetargetProfileDefinition[] = [
  {
    id: "mixamo_compatible_v1",
    sourceFamily: "mixamo",
    notes: "Shared browser-safe retarget family for the current curated humanoid packs.",
    knownLimitations: [
      "Prop contact still depends on family-specific stance coverage.",
      "Two-hand precision is intentionally deferred until corrective hooks are added.",
    ],
  },
];

export const rigProfiles: CharacterRigProfileDefinition[] = [
  {
    id: "mixamo_humanoid_v1",
    runtimeAssetForward: "+Z",
    scaleMetersPerUnit: 1,
    retargetProfileId: "mixamo_compatible_v1",
    compatiblePresentationIds: presentions,
    boneMap: {
      root: "mixamorigHips",
      spine_lower: "mixamorigSpine",
      spine_upper: "mixamorigSpine2",
      hand_r: "mixamorigRightHand",
      hand_l: "mixamorigLeftHand",
      forearm_l: "mixamorigLeftForeArm",
      pelvis: "mixamorigHips",
    },
    requiredBones: ["root", "spine_upper", "hand_r", "hand_l", "pelvis"],
    sockets: {
      hand_r_weapon: {
        parentBoneId: "hand_r",
        localPose: createPose(),
        usage: "active_main_hand",
      },
      hand_l_offhand: {
        parentBoneId: "forearm_l",
        localPose: createPose(),
        usage: "active_off_hand",
      },
      hand_l_bow: {
        parentBoneId: "hand_l",
        localPose: createPose(),
        usage: "active_bow",
      },
      back_weapon: {
        parentBoneId: "spine_upper",
        localPose: createPose(
          { x: -0.12, y: 0.08, z: -0.18 },
          { x: 0.349066, y: 0, z: 2.356194 },
        ),
        usage: "storage_back",
      },
      hip_l_weapon: {
        parentBoneId: "pelvis",
        localPose: createPose(
          { x: -0.14, y: -0.02, z: 0 },
          { x: 0, y: 0, z: 1.570796 },
        ),
        usage: "storage_hip_left",
      },
      hip_r_weapon: {
        parentBoneId: "pelvis",
        localPose: createPose(
          { x: 0.14, y: -0.02, z: 0 },
          { x: 0, y: 0, z: -1.570796 },
        ),
        usage: "storage_hip_right",
      },
    },
  },
];

export const equipmentItems: EquipmentItemDefinition[] = [
  {
    id: "leader_sword",
    name: prototypeCatalog.equipment.leader_sword.name,
    family: "sword_1h",
    class: "weapon",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.leader_sword.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "right",
      supportHand: null,
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      storage_hip: {
        kind: "synthetic",
        pose: createPose(),
      },
      trail_start: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.12, z: 0 }),
      },
      trail_end: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.84, z: 0 }),
      },
    },
    storagePreferences: ["hip_left", "back"],
    animationRequirements: {
      stanceFamily: "one_hand",
      requiredClipTags: ["idle", "locomotion", "attack"],
      supportsOffHandShield: true,
    },
    correctiveHooks: {
      offHandTargetMarkerId: null,
      aimPivotMarkerId: null,
    },
  },
  {
    id: "leader_shield",
    name: prototypeCatalog.equipment.leader_shield.name,
    family: "shield",
    class: "shield",
    slotId: "off_hand",
    modelUrl: prototypeCatalog.equipment.leader_shield.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "left",
      supportHand: null,
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      storage_back: {
        kind: "synthetic",
        pose: createPose(),
      },
    },
    storagePreferences: ["back", "hip_right"],
    animationRequirements: {
      stanceFamily: "one_hand_shield",
      requiredClipTags: ["idle", "locomotion", "attack", "guard", "block"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: null,
      aimPivotMarkerId: null,
    },
  },
  {
    id: "ranger_bow",
    name: prototypeCatalog.equipment.ranger_bow.name,
    family: "bow",
    class: "weapon",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.ranger_bow.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "left",
      supportHand: "right",
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      grip_secondary: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.58, z: 0 }),
      },
      storage_back: {
        kind: "synthetic",
        pose: createPose(),
      },
      aim_pivot: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.65, z: 0 }),
      },
    },
    storagePreferences: ["back"],
    animationRequirements: {
      stanceFamily: "bow",
      requiredClipTags: ["idle", "locomotion", "draw", "release"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: "grip_secondary",
      aimPivotMarkerId: "aim_pivot",
    },
  },
  {
    id: "vanguard_halberd_equip",
    name: prototypeCatalog.equipment.vanguard_halberd_equip.name,
    family: "polearm_2h",
    class: "weapon",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.vanguard_halberd_equip.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "right",
      supportHand: "left",
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      grip_secondary: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.58, z: 0 }),
      },
      storage_back: {
        kind: "synthetic",
        pose: createPose(),
      },
      trail_start: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.28, z: 0 }),
      },
      trail_end: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 1.12, z: 0 }),
      },
    },
    storagePreferences: ["back", "hip_left"],
    animationRequirements: {
      stanceFamily: "one_hand",
      requiredClipTags: ["idle", "locomotion", "attack"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: "grip_secondary",
      aimPivotMarkerId: null,
    },
  },
  {
    id: "mender_staff_equip",
    name: prototypeCatalog.equipment.mender_staff_equip.name,
    family: "focus",
    class: "focus",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.mender_staff_equip.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "right",
      supportHand: null,
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      storage_hip: {
        kind: "synthetic",
        pose: createPose(),
      },
      aim_pivot: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.68, z: 0 }),
      },
    },
    storagePreferences: ["hip_right", "back"],
    animationRequirements: {
      stanceFamily: "focus",
      requiredClipTags: ["idle", "locomotion", "cast", "attack"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: null,
      aimPivotMarkerId: "aim_pivot",
    },
  },
  {
    id: "hexcaster_staff_equip",
    name: prototypeCatalog.equipment.hexcaster_staff_equip.name,
    family: "focus",
    class: "focus",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.hexcaster_staff_equip.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "right",
      supportHand: null,
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      storage_hip: {
        kind: "synthetic",
        pose: createPose(),
      },
      aim_pivot: {
        kind: "synthetic",
        pose: createPose({ x: 0, y: 0.72, z: 0 }),
      },
    },
    storagePreferences: ["hip_right", "back"],
    animationRequirements: {
      stanceFamily: "focus",
      requiredClipTags: ["idle", "locomotion", "cast", "attack"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: null,
      aimPivotMarkerId: "aim_pivot",
    },
  },
  {
    id: "raider_axe_equip",
    name: prototypeCatalog.equipment.raider_axe_equip.name,
    family: "axe_1h",
    class: "weapon",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.raider_axe_equip.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "right",
      supportHand: null,
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      storage_hip: {
        kind: "synthetic",
        pose: createPose(),
      },
    },
    storagePreferences: ["hip_left", "back"],
    animationRequirements: {
      stanceFamily: "one_hand",
      requiredClipTags: ["idle", "locomotion", "attack"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: null,
      aimPivotMarkerId: null,
    },
  },
  {
    id: "bulwark_maul_equip",
    name: prototypeCatalog.equipment.bulwark_maul_equip.name,
    family: "maul_1h",
    class: "weapon",
    slotId: "main_hand",
    modelUrl: prototypeCatalog.equipment.bulwark_maul_equip.asset.modelUrl ?? "",
    handedness: {
      dominantHand: "right",
      supportHand: null,
      mirrorAllowed: false,
    },
    markers: {
      grip_primary: {
        kind: "synthetic",
        pose: createPose(),
      },
      storage_hip: {
        kind: "synthetic",
        pose: createPose(),
      },
    },
    storagePreferences: ["hip_right", "back"],
    animationRequirements: {
      stanceFamily: "one_hand",
      requiredClipTags: ["idle", "locomotion", "attack"],
      supportsOffHandShield: false,
    },
    correctiveHooks: {
      offHandTargetMarkerId: null,
      aimPivotMarkerId: null,
    },
  },
];

const attachmentProfileId = (
  rigProfileId: RigProfileId,
  itemId: EquipmentId,
  socketId: SocketId,
  stanceFamily: StanceFamilyId | "storage",
) => `${rigProfileId}.${itemId}.${socketId}.${stanceFamily}`;

const makeAttachmentProfile = (
  rigProfileId: RigProfileId,
  itemId: EquipmentId,
  socketId: SocketId,
  stanceFamily: StanceFamilyId | "storage",
  poseOffset: AttachmentProfileDefinition["poseOffset"],
  sourceMarkerId: AttachmentProfileDefinition["sourceMarkerId"] = "grip_primary",
  notes?: string,
): AttachmentProfileDefinition => ({
  id: attachmentProfileId(rigProfileId, itemId, socketId, stanceFamily),
  rigProfileId,
  itemId,
  socketId,
  stanceFamily,
  sourceMarkerId,
  poseOffset,
  notes,
});

export const attachmentProfiles: AttachmentProfileDefinition[] = [
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "leader_sword",
    "hand_r_weapon",
    "one_hand",
    createPose({ x: 0, y: 0.04, z: 0 }, { x: 0, y: 0, z: 0 }, 0.7),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "leader_sword",
    "hand_r_weapon",
    "one_hand_shield",
    createPose({ x: 0, y: 0.04, z: 0 }, { x: 0, y: 0, z: 0 }, 0.7),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "leader_sword",
    "hip_l_weapon",
    "storage",
    createPose({ x: 0, y: 0.03, z: -0.02 }, { x: 0, y: 0, z: 0 }, 0.7),
    "storage_hip",
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "leader_shield",
    "hand_l_offhand",
    "one_hand_shield",
    createPose({ x: 0, y: 0.1, z: 0 }, { x: 0, y: 0, z: 0 }, 0.65),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "leader_shield",
    "back_weapon",
    "storage",
    createPose({ x: 0.02, y: 0.02, z: 0 }, { x: 0, y: 1.570796, z: 0 }, 0.58),
    "storage_back",
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "ranger_bow",
    "hand_l_bow",
    "bow",
    createPose({ x: 0, y: 0.04, z: 0 }, { x: 0, y: 0, z: 0 }, 0.7),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "ranger_bow",
    "back_weapon",
    "storage",
    createPose({ x: 0.02, y: -0.1, z: 0.02 }, { x: 0, y: 1.570796, z: 0.2 }, 0.7),
    "storage_back",
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "vanguard_halberd_equip",
    "hand_r_weapon",
    "one_hand",
    createPose({ x: 0, y: 0.05, z: 0 }, { x: 0, y: 0, z: 0 }, 0.74),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "vanguard_halberd_equip",
    "back_weapon",
    "storage",
    createPose({ x: 0.04, y: -0.04, z: 0.04 }, { x: 0.12, y: 1.570796, z: 0.2 }, 0.74),
    "storage_back",
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "mender_staff_equip",
    "hand_r_weapon",
    "focus",
    createPose({ x: 0, y: 0.05, z: 0 }, { x: 0, y: 0, z: 0 }, 0.72),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "mender_staff_equip",
    "hip_r_weapon",
    "storage",
    createPose({ x: 0, y: 0.03, z: -0.02 }, { x: 0, y: 0, z: 0 }, 0.72),
    "storage_hip",
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "hexcaster_staff_equip",
    "hand_r_weapon",
    "focus",
    createPose({ x: 0, y: 0.05, z: 0 }, { x: 0, y: 0, z: 0 }, 0.72),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "hexcaster_staff_equip",
    "hip_r_weapon",
    "storage",
    createPose({ x: 0, y: 0.03, z: -0.02 }, { x: 0, y: 0, z: 0 }, 0.72),
    "storage_hip",
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "raider_axe_equip",
    "hand_r_weapon",
    "one_hand",
    createPose({ x: 0, y: 0.04, z: 0 }, { x: 0, y: 0, z: 0 }, 0.7),
  ),
  makeAttachmentProfile(
    "mixamo_humanoid_v1",
    "bulwark_maul_equip",
    "hand_r_weapon",
    "one_hand",
    createPose({ x: 0, y: 0.04, z: 0 }, { x: 0, y: 0, z: 0 }, 0.75),
  ),
];

export const stanceProfiles: StanceProfileDefinition[] = [
  {
    id: "unarmed",
    supportedWeaponKinds: ["melee", "ranged", "focus"],
    requiredClips: ["idle", "run", "hit", "death"],
    activeSocketMap: {},
    offHandRule: { mode: "none", markerId: null },
    storageRule: { primarySlot: null },
  },
  {
    id: "one_hand",
    supportedWeaponKinds: ["melee", "focus"],
    requiredClips: ["idle", "run", "attack", "hit", "death"],
    activeSocketMap: { main_hand: "hand_r_weapon" },
    offHandRule: { mode: "none", markerId: null },
    storageRule: { primarySlot: "hip_left" },
  },
  {
    id: "one_hand_shield",
    supportedWeaponKinds: ["melee"],
    requiredClips: ["idle", "run", "attack", "guard", "block", "hit", "death"],
    activeSocketMap: { main_hand: "hand_r_weapon", off_hand: "hand_l_offhand" },
    offHandRule: { mode: "none", markerId: null },
    storageRule: { primarySlot: "hip_left" },
  },
  {
    id: "bow",
    supportedWeaponKinds: ["ranged"],
    requiredClips: ["idle", "run", "draw", "release", "hit", "death"],
    activeSocketMap: { main_hand: "hand_l_bow" },
    offHandRule: { mode: "future_ik_target", markerId: "grip_secondary" },
    storageRule: { primarySlot: "back" },
  },
  {
    id: "focus",
    supportedWeaponKinds: ["focus"],
    requiredClips: ["idle", "run", "cast", "attack", "hit", "death"],
    activeSocketMap: { main_hand: "hand_r_weapon" },
    offHandRule: { mode: "none", markerId: null },
    storageRule: { primarySlot: "hip_right" },
  },
];

export const rigProfilesById = Object.fromEntries(rigProfiles.map((profile) => [profile.id, profile])) as Record<
  RigProfileId,
  CharacterRigProfileDefinition
>;
export const retargetProfilesById = Object.fromEntries(
  retargetProfiles.map((profile) => [profile.id, profile]),
) as Record<RetargetProfileDefinition["id"], RetargetProfileDefinition>;
export const equipmentItemsById = Object.fromEntries(equipmentItems.map((item) => [item.id, item])) as Record<
  EquipmentId,
  EquipmentItemDefinition
>;
export const stanceProfilesById = Object.fromEntries(stanceProfiles.map((profile) => [profile.id, profile])) as Record<
  StanceProfileDefinition["id"],
  StanceProfileDefinition
>;
export const attachmentProfilesById = Object.fromEntries(
  attachmentProfiles.map((profile) => [profile.id, profile]),
) as Record<string, AttachmentProfileDefinition>;

const rigProfileIdByPresentationId = presentions.reduce<Record<CharacterPresentationId, RigProfileId>>((map, presentationId) => {
  map[presentationId] = "mixamo_humanoid_v1";
  return map;
}, {} as Record<CharacterPresentationId, RigProfileId>);

export const getRigProfileIdForPresentation = (presentationId: CharacterPresentationId) =>
  rigProfileIdByPresentationId[presentationId];
