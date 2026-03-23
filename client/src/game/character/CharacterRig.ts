import * as THREE from "three";
import type { CharacterModelInstance } from "@/game/assets/loader";
import { getRigProfileIdForPresentation } from "@/game/equipment/catalog";
import { CharacterRigAdapter } from "@/game/equipment/runtime";
import type { CharacterPresentationId, Vec3 } from "@/game/defs";

export class CharacterRig {
  readonly actorRoot = new THREE.Group();
  readonly visualRoot = new THREE.Group();
  readonly modelOffsetRoot = new THREE.Group();
  readonly skeletonRoot: THREE.Group;
  readonly adapter: CharacterRigAdapter;

  constructor(
    readonly model: CharacterModelInstance,
    presentationId: CharacterPresentationId,
  ) {
    this.actorRoot.name = "ActorRoot";
    this.visualRoot.name = "VisualRoot";
    this.modelOffsetRoot.name = "ModelOffsetRoot";
    this.skeletonRoot = model.scene;
    this.skeletonRoot.name = "SkeletonRoot";

    this.actorRoot.add(this.visualRoot);
    this.visualRoot.add(this.modelOffsetRoot);
    this.modelOffsetRoot.add(this.skeletonRoot);
    this.modelOffsetRoot.rotation.y = model.rotationOffsetY;
    this.actorRoot.updateMatrixWorld(true);

    this.adapter = new CharacterRigAdapter(this.skeletonRoot, getRigProfileIdForPresentation(presentationId));
  }

  setActorTransform(position: Vec3, yaw: number) {
    this.actorRoot.position.set(position.x, position.y, position.z);
    this.actorRoot.rotation.set(0, yaw, 0);
    this.actorRoot.updateMatrixWorld(true);
  }

  getSocketNode(socketId: Parameters<CharacterRigAdapter["getSocketNode"]>[0]) {
    return this.adapter.getSocketNode(socketId);
  }

  dispose() {
    this.adapter.dispose();
    this.actorRoot.remove(this.visualRoot);
  }
}
