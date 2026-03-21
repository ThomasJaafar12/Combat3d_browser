import type { EquipmentId, EquipmentSlotId, WeaponKind } from "@/game/defs";
import {
  attachmentProfilesById,
  equipmentItemsById,
  rigProfilesById,
  stanceProfilesById,
} from "@/game/equipment/catalog";
import {
  clonePose,
  type AttachmentProfileDefinition,
  type AttachmentProfileOverrideMap,
  type EquipmentState,
  type RigProfileId,
  type SocketId,
  type StanceFamilyId,
  type StorageSlotId,
  type TransformPose,
  type VisibleEquipmentBinding,
} from "@/game/equipment/schema";

const STORAGE_SOCKET_BY_SLOT: Record<StorageSlotId, SocketId> = {
  back: "back_weapon",
  hip_left: "hip_l_weapon",
  hip_right: "hip_r_weapon",
};

const mergePoseOverride = (basePose: TransformPose, override: TransformPose | undefined): TransformPose => {
  if (!override) {
    return clonePose(basePose);
  }

  return {
    position: { ...override.position },
    rotation: { ...override.rotation },
    scale: override.scale,
  };
};

const attachmentProfileId = (
  rigProfileId: RigProfileId,
  itemId: EquipmentId,
  socketId: SocketId,
  stanceFamily: StanceFamilyId | "storage",
) => `${rigProfileId}.${itemId}.${socketId}.${stanceFamily}`;

const stanceFallbacks: Record<StanceFamilyId | "storage", Array<StanceFamilyId | "storage">> = {
  unarmed: [],
  one_hand: [],
  one_hand_shield: ["one_hand"],
  bow: [],
  focus: ["one_hand"],
  storage: [],
};

export interface ResolvedAttachmentProfile extends AttachmentProfileDefinition {
  resolvedPoseOffset: TransformPose;
}

export interface ResolvedEquipmentView {
  stanceFamily: StanceFamilyId;
  bindings: Array<
    VisibleEquipmentBinding & {
      profile: ResolvedAttachmentProfile;
    }
  >;
}

const cloneState = (state: EquipmentState): EquipmentState => ({
  equipState: state.equipState,
  activeSlots: { ...state.activeSlots },
  storageSlots: { ...state.storageSlots },
  pendingTransfer: state.pendingTransfer ? { ...state.pendingTransfer } : null,
});

const removeItemFromState = (state: EquipmentState, itemId: EquipmentId) => {
  (Object.keys(state.activeSlots) as EquipmentSlotId[]).forEach((slotId) => {
    if (state.activeSlots[slotId] === itemId) {
      delete state.activeSlots[slotId];
    }
  });
  (Object.keys(state.storageSlots) as StorageSlotId[]).forEach((slotId) => {
    if (state.storageSlots[slotId] === itemId) {
      delete state.storageSlots[slotId];
    }
  });
};

const pickStorageSlot = (itemId: EquipmentId, state: EquipmentState) => {
  const item = equipmentItemsById[itemId];
  return item.storagePreferences.find((slotId) => !state.storageSlots[slotId]) ?? null;
};

export class EquipmentSystem {
  createStateFromLoadout(loadout: Partial<Record<EquipmentSlotId, EquipmentId>>): EquipmentState {
    return {
      equipState: Object.values(loadout).some((itemId) => !!itemId) ? "ready" : "stowed",
      activeSlots: { ...loadout },
      storageSlots: {},
      pendingTransfer: null,
    };
  }

  toActiveLoadout(state: EquipmentState): Partial<Record<EquipmentSlotId, EquipmentId>> {
    return { ...state.activeSlots };
  }

  hasActiveEquipment(state: EquipmentState) {
    return Object.values(state.activeSlots).some((itemId) => !!itemId);
  }

  requestEquip(
    state: EquipmentState,
    itemId: EquipmentId,
    slotId: EquipmentSlotId,
    timeMs: number,
  ): EquipmentState {
    const nextState = cloneState(state);
    removeItemFromState(nextState, itemId);

    const displacedItem = nextState.activeSlots[slotId];
    if (displacedItem) {
      const displacedStorage = pickStorageSlot(displacedItem, nextState);
      if (displacedStorage) {
        nextState.storageSlots[displacedStorage] = displacedItem;
      }
    }

    nextState.activeSlots[slotId] = itemId;
    nextState.equipState = "ready";
    nextState.pendingTransfer = {
      itemId,
      fromSlot: pickStorageSlot(itemId, state) ?? slotId,
      toSlot: slotId,
      startedAtMs: timeMs,
    };
    return nextState;
  }

  requestUnequip(state: EquipmentState, slotId: EquipmentSlotId, timeMs: number): EquipmentState {
    const nextState = cloneState(state);
    const itemId = nextState.activeSlots[slotId];
    if (!itemId) {
      return nextState;
    }

    delete nextState.activeSlots[slotId];
    const storageSlot = pickStorageSlot(itemId, nextState);
    if (storageSlot) {
      nextState.storageSlots[storageSlot] = itemId;
      nextState.pendingTransfer = {
        itemId,
        fromSlot: slotId,
        toSlot: storageSlot,
        startedAtMs: timeMs,
      };
    } else {
      nextState.pendingTransfer = null;
    }
    nextState.equipState = this.hasActiveEquipment(nextState) ? "ready" : "stowed";
    return nextState;
  }

  toggleDefaultLoadout(
    state: EquipmentState,
    defaultLoadout: Partial<Record<EquipmentSlotId, EquipmentId>>,
    timeMs: number,
  ): EquipmentState {
    if (this.hasActiveEquipment(state)) {
      let nextState = cloneState(state);
      (Object.keys(nextState.activeSlots) as EquipmentSlotId[]).forEach((slotId) => {
        nextState = this.requestUnequip(nextState, slotId, timeMs);
      });
      nextState.equipState = "stowed";
      nextState.pendingTransfer = null;
      return nextState;
    }

    let nextState = cloneState(state);
    (Object.entries(defaultLoadout) as [EquipmentSlotId, EquipmentId | undefined][])
      .filter((entry): entry is [EquipmentSlotId, EquipmentId] => !!entry[1])
      .forEach(([slotId, itemId]) => {
        nextState = this.requestEquip(nextState, itemId, slotId, timeMs);
      });
    nextState.pendingTransfer = null;
    nextState.equipState = this.hasActiveEquipment(nextState) ? "ready" : "stowed";
    return nextState;
  }
}

export const equipmentSystem = new EquipmentSystem();

export const resolveStanceFamily = (state: EquipmentState, weaponKind: WeaponKind): StanceFamilyId => {
  const mainHandItemId = state.activeSlots.main_hand;
  const offHandItemId = state.activeSlots.off_hand;
  const mainHandItem = mainHandItemId ? equipmentItemsById[mainHandItemId] : null;
  const offHandItem = offHandItemId ? equipmentItemsById[offHandItemId] : null;

  if (mainHandItem?.family === "bow") {
    return "bow";
  }
  if (mainHandItem && offHandItem?.family === "shield") {
    return "one_hand_shield";
  }
  if (mainHandItem) {
    return mainHandItem.animationRequirements.stanceFamily;
  }
  if (weaponKind === "focus") {
    return "focus";
  }
  return "unarmed";
};

export const resolveAttachmentProfile = (
  rigProfileId: RigProfileId,
  itemId: EquipmentId,
  socketId: SocketId,
  stanceFamily: StanceFamilyId | "storage",
  overrides: AttachmentProfileOverrideMap = {},
): ResolvedAttachmentProfile | null => {
  const candidateIds = [
    attachmentProfileId(rigProfileId, itemId, socketId, stanceFamily),
    ...stanceFallbacks[stanceFamily].map((fallbackStance) => attachmentProfileId(rigProfileId, itemId, socketId, fallbackStance)),
  ];

  const profile = candidateIds
    .map((profileId) => attachmentProfilesById[profileId])
    .find((candidate): candidate is AttachmentProfileDefinition => !!candidate);
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    resolvedPoseOffset: mergePoseOverride(profile.poseOffset, overrides[profile.id]),
  };
};

export const resolveVisibleEquipmentView = (
  state: EquipmentState,
  rigProfileId: RigProfileId,
  weaponKind: WeaponKind,
  overrides: AttachmentProfileOverrideMap = {},
): ResolvedEquipmentView => {
  const rigProfile = rigProfilesById[rigProfileId];
  const stanceFamily = resolveStanceFamily(state, weaponKind);
  const bindings: ResolvedEquipmentView["bindings"] = [];
  const stanceProfile = stanceProfilesById[stanceFamily];

  (Object.entries(state.activeSlots) as [EquipmentSlotId, EquipmentId | undefined][])
    .filter((entry): entry is [EquipmentSlotId, EquipmentId] => !!entry[1])
    .forEach(([slotId, itemId]) => {
      const socketId = stanceProfile.activeSocketMap[slotId];
      if (!socketId || !rigProfile.sockets[socketId]) {
        return;
      }
      const profile = resolveAttachmentProfile(rigProfileId, itemId, socketId, stanceFamily, overrides);
      if (!profile) {
        return;
      }
      bindings.push({
        itemId,
        sourceSlot: slotId,
        socketId,
        stanceFamily,
        profileId: profile.id,
        sourceMarkerId: profile.sourceMarkerId,
        profile,
      });
    });

  (Object.entries(state.storageSlots) as [StorageSlotId, EquipmentId | undefined][])
    .filter((entry): entry is [StorageSlotId, EquipmentId] => !!entry[1])
    .forEach(([slotId, itemId]) => {
      const socketId = STORAGE_SOCKET_BY_SLOT[slotId];
      const profile = resolveAttachmentProfile(rigProfileId, itemId, socketId, "storage", overrides);
      if (!profile) {
        return;
      }
      bindings.push({
        itemId,
        sourceSlot: slotId,
        socketId,
        stanceFamily: "storage",
        profileId: profile.id,
        sourceMarkerId: profile.sourceMarkerId,
        profile,
      });
    });

  return {
    stanceFamily,
    bindings,
  };
};

export const formatEquipmentStateSummary = (state: EquipmentState) => {
  const active = (Object.entries(state.activeSlots) as [EquipmentSlotId, EquipmentId | undefined][])
    .filter((entry): entry is [EquipmentSlotId, EquipmentId] => !!entry[1])
    .map(([slotId, itemId]) => `${slotId}: ${equipmentItemsById[itemId].name}`);
  const stored = (Object.entries(state.storageSlots) as [StorageSlotId, EquipmentId | undefined][])
    .filter((entry): entry is [StorageSlotId, EquipmentId] => !!entry[1])
    .map(([slotId, itemId]) => `${slotId}: ${equipmentItemsById[itemId].name}`);

  return {
    active,
    stored,
  };
};
