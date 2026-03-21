import { prototypeCatalog } from "@/game/content";
import {
  attachmentProfiles,
  equipmentItems,
  equipmentItemsById,
  getRigProfileIdForPresentation,
  rigProfiles,
  stanceProfiles,
} from "@/game/equipment/catalog";

const unique = <T>(values: T[]) => new Set(values).size === values.length;

export const validateAttachmentCatalog = () => {
  const errors: string[] = [];

  if (!unique(rigProfiles.map((profile) => profile.id))) {
    errors.push("Rig profile ids must be unique.");
  }
  if (!unique(equipmentItems.map((item) => item.id))) {
    errors.push("Equipment item ids must be unique.");
  }
  if (!unique(attachmentProfiles.map((profile) => profile.id))) {
    errors.push("Attachment profile ids must be unique.");
  }
  if (!unique(stanceProfiles.map((profile) => profile.id))) {
    errors.push("Stance profile ids must be unique.");
  }

  Object.values(prototypeCatalog.units).forEach((unit) => {
    const rigProfileId = getRigProfileIdForPresentation(unit.presentationId);
    if (!rigProfileId) {
      errors.push(`Unit '${unit.id}' presentation '${unit.presentationId}' has no rig profile mapping.`);
    }
  });

  equipmentItems.forEach((item) => {
    if (!item.modelUrl) {
      errors.push(`Equipment item '${item.id}' is missing a model url.`);
    }
    if (!item.markers.grip_primary) {
      errors.push(`Equipment item '${item.id}' is missing a primary grip marker.`);
    }
    if (item.class === "shield" && item.slotId !== "off_hand") {
      errors.push(`Shield item '${item.id}' must live in the off-hand slot.`);
    }
  });

  attachmentProfiles.forEach((profile) => {
    const rigProfile = rigProfiles.find((entry) => entry.id === profile.rigProfileId);
    if (!rigProfile) {
      errors.push(`Attachment profile '${profile.id}' references missing rig '${profile.rigProfileId}'.`);
      return;
    }
    if (!equipmentItemsById[profile.itemId]) {
      errors.push(`Attachment profile '${profile.id}' references missing item '${profile.itemId}'.`);
    }
    if (!rigProfile.sockets[profile.socketId]) {
      errors.push(`Attachment profile '${profile.id}' references missing socket '${profile.socketId}'.`);
    }
    if (!equipmentItemsById[profile.itemId]?.markers[profile.sourceMarkerId]) {
      errors.push(
        `Attachment profile '${profile.id}' references marker '${profile.sourceMarkerId}' which is not defined on '${profile.itemId}'.`,
      );
    }
    if (profile.poseOffset.scale <= 0) {
      errors.push(`Attachment profile '${profile.id}' must use a positive scale.`);
    }
  });

  return errors;
};

export const assertValidAttachmentCatalog = () => {
  const errors = validateAttachmentCatalog();
  if (errors.length > 0) {
    throw new Error(`Attachment catalog validation failed:\n- ${errors.join("\n- ")}`);
  }
};
