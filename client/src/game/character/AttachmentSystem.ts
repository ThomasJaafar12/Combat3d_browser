import type * as THREE from "three";
import type { BoundAttachmentHandle } from "@/game/equipment/runtime";
import { bindEquipmentModelToSocket } from "@/game/equipment/runtime";
import type { CharacterRig } from "@/game/character/CharacterRig";
import type { EquipmentId } from "@/game/defs";
import type { EquipmentMarkerId, SocketId, StanceFamilyId, TransformPose } from "@/game/equipment/schema";

export interface AttachmentBindingParams {
  characterId: string;
  characterName: string;
  itemId: EquipmentId;
  socketId: SocketId;
  stanceFamily: StanceFamilyId | "storage";
  itemScene: THREE.Object3D;
  poseOffset: TransformPose;
  sourceMarkerId: EquipmentMarkerId;
}

export class AttachmentSystem {
  private readonly handles = new Map<string, BoundAttachmentHandle>();

  constructor(private readonly rig: CharacterRig) {}

  bind(key: string, params: AttachmentBindingParams) {
    this.unbind(key);
    const handle = bindEquipmentModelToSocket({
      adapter: this.rig.adapter,
      ...params,
    });
    if (handle) {
      this.handles.set(key, handle);
    }
    return handle;
  }

  updatePose(key: string, pose: TransformPose) {
    this.handles.get(key)?.applyPose(pose);
  }

  unbind(key: string) {
    this.handles.get(key)?.detach();
    this.handles.delete(key);
  }

  syncEquipment(activeKeys: string[]) {
    const activeSet = new Set(activeKeys);
    [...this.handles.keys()].forEach((key) => {
      if (!activeSet.has(key)) {
        this.unbind(key);
      }
    });
  }

  clear() {
    [...this.handles.keys()].forEach((key) => this.unbind(key));
  }
}
