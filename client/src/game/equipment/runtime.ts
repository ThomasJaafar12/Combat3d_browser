import * as THREE from "three";
import type { EquipmentId } from "@/game/defs";
import { equipmentItemsById, rigProfilesById } from "@/game/equipment/catalog";
import {
  clonePose,
  identityPose,
  type AttachmentDebugReport,
  type CharacterRigProfileDefinition,
  type EquipmentMarkerId,
  type RigBoneId,
  type RigProfileId,
  type SocketId,
  type StanceFamilyId,
  type TransformPose,
} from "@/game/equipment/schema";
import type { ResolvedEquipmentView } from "@/game/equipment/system";

const _markerMatrix = new THREE.Matrix4();
const _inverseMarkerMatrix = new THREE.Matrix4();
const _tempPosition = new THREE.Vector3();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _socketWorldScale = new THREE.Vector3();
const _tempEuler = new THREE.Euler(0, 0, 0, "XYZ");

export interface AttachmentIssueContext {
  characterId?: string;
  characterName?: string;
  rigProfileId: RigProfileId;
  itemId?: EquipmentId;
  socketId?: SocketId;
  markerId?: EquipmentMarkerId;
  stanceFamily?: StanceFamilyId | "storage";
  reason: string;
}

export const reportAttachmentIssue = (context: AttachmentIssueContext) => {
  console.error("Attachment pipeline issue", {
    system: "attachment_pipeline",
    ...context,
  });
};

const disableFrustumCulling = (root: THREE.Object3D) => {
  root.traverse((child) => {
    if ("isMesh" in child || "isSkinnedMesh" in child) {
      (child as THREE.Mesh).frustumCulled = false;
    }
  });
};

const applyPoseToObject = (object: THREE.Object3D, pose: TransformPose, scaleMultiplier = 1) => {
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
  object.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
  object.scale.setScalar(pose.scale * scaleMultiplier);
};

const readPoseFromObject = (object: THREE.Object3D, scaleMultiplier = 1): TransformPose => {
  _tempEuler.setFromQuaternion(object.quaternion, "XYZ");
  return {
    position: {
      x: object.position.x * scaleMultiplier,
      y: object.position.y * scaleMultiplier,
      z: object.position.z * scaleMultiplier,
    },
    rotation: {
      x: _tempEuler.x,
      y: _tempEuler.y,
      z: _tempEuler.z,
    },
    scale: object.scale.x * scaleMultiplier,
  };
};

const composePoseMatrix = (pose: TransformPose) => {
  _markerMatrix.compose(
    _tempPosition.set(pose.position.x, pose.position.y, pose.position.z),
    _tempQuaternion.setFromEuler(new THREE.Euler(pose.rotation.x, pose.rotation.y, pose.rotation.z, "XYZ")),
    _tempScale.setScalar(pose.scale),
  );
  return _markerMatrix;
};

const decomposeMatrixToObject = (matrix: THREE.Matrix4, object: THREE.Object3D) => {
  matrix.decompose(_tempPosition, _tempQuaternion, _tempScale);
  object.position.copy(_tempPosition);
  object.quaternion.copy(_tempQuaternion);
  object.scale.copy(_tempScale);
};

const extractLocalPoseFromNode = (root: THREE.Object3D, nodeName: string): TransformPose | null => {
  const markerNode = root.getObjectByName(nodeName);
  if (!markerNode) {
    return null;
  }

  root.updateMatrixWorld(true);
  markerNode.updateMatrixWorld(true);
  const localMatrix = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(markerNode.matrixWorld);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  localMatrix.decompose(position, quaternion, scale);
  euler.setFromQuaternion(quaternion, "XYZ");

  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: scale.x,
  };
};

export const resolveItemMarkerPose = (
  itemScene: THREE.Object3D,
  itemId: EquipmentId,
  markerId: EquipmentMarkerId,
  context: Omit<AttachmentIssueContext, "markerId" | "reason" | "itemId"> & { itemId: EquipmentId },
) => {
  const itemDefinition = equipmentItemsById[itemId];
  const marker = itemDefinition.markers[markerId];
  if (!marker) {
    reportAttachmentIssue({
      ...context,
      itemId,
      markerId,
      reason: "Missing marker definition",
    });
    return identityPose();
  }

  if (marker.kind === "synthetic") {
    return marker.pose ? clonePose(marker.pose) : identityPose();
  }

  if (marker.nodeName) {
    const nodePose = extractLocalPoseFromNode(itemScene, marker.nodeName);
    if (nodePose) {
      return nodePose;
    }
  }

  reportAttachmentIssue({
    ...context,
    itemId,
    markerId,
    reason: `Marker node '${marker.nodeName ?? ""}' was not found`,
  });
  return identityPose();
};

export class CharacterRigAdapter {
  readonly profile: CharacterRigProfileDefinition;
  private readonly root: THREE.Object3D;
  private readonly resolvedBones: Partial<Record<RigBoneId, THREE.Object3D>> = {};
  private readonly socketNodes: Partial<Record<SocketId, THREE.Object3D>> = {};
  private readonly createdSockets: THREE.Object3D[] = [];

  constructor(root: THREE.Object3D, rigProfileId: RigProfileId) {
    this.root = root;
    this.profile = rigProfilesById[rigProfileId];
    this.resolveBones();
    this.createSockets();
  }

  getRigProfileId() {
    return this.profile.id;
  }

  getCanonicalBone(boneId: RigBoneId) {
    return this.resolvedBones[boneId] ?? null;
  }

  getSocketNode(socketId: SocketId) {
    return this.socketNodes[socketId] ?? null;
  }

  debugSnapshot() {
    return {
      rigProfileId: this.profile.id,
      resolvedBones: Object.fromEntries(
        Object.entries(this.resolvedBones).map(([boneId, node]) => [boneId, node?.name ?? null]),
      ),
      resolvedSockets: Object.fromEntries(
        Object.entries(this.socketNodes).map(([socketId, node]) => [socketId, node?.name ?? null]),
      ),
    };
  }

  dispose() {
    this.createdSockets.forEach((socketNode) => {
      socketNode.parent?.remove(socketNode);
    });
    this.createdSockets.length = 0;
  }

  private resolveBones() {
    (Object.keys(this.profile.boneMap) as RigBoneId[]).forEach((boneId) => {
      const boneName = this.profile.boneMap[boneId];
      const bone = this.root.getObjectByName(boneName);
      if (!bone) {
        if (this.profile.requiredBones.includes(boneId)) {
          reportAttachmentIssue({
            rigProfileId: this.profile.id,
            reason: `Required bone '${boneName}' was not found`,
          });
        }
        return;
      }
      this.resolvedBones[boneId] = bone;
    });
  }

  private createSockets() {
    (Object.entries(this.profile.sockets) as [SocketId, CharacterRigProfileDefinition["sockets"][SocketId]][]).forEach(
      ([socketId, socketDefinition]) => {
        const helperNode = socketDefinition.helperNodeName
          ? this.root.getObjectByName(socketDefinition.helperNodeName)
          : null;
        const parentNode = helperNode ?? this.resolvedBones[socketDefinition.parentBoneId] ?? null;
        if (!parentNode) {
          reportAttachmentIssue({
            rigProfileId: this.profile.id,
            socketId,
            reason: `Socket parent '${socketDefinition.parentBoneId}' was not resolved`,
          });
          return;
        }

        const socketNode = new THREE.Group();
        socketNode.name = `SOCKET__${socketId}`;
        applyPoseToObject(socketNode, socketDefinition.localPose);
        parentNode.add(socketNode);
        socketNode.updateMatrixWorld(true);
        this.socketNodes[socketId] = socketNode;
        this.createdSockets.push(socketNode);
      },
    );
  }
}

export interface BoundAttachmentHandle {
  bindingRoot: THREE.Object3D;
  applyPose: (pose: TransformPose) => void;
  readPose: () => TransformPose;
  detach: () => void;
}

export const bindEquipmentModelToSocket = ({
  adapter,
  characterId,
  characterName,
  itemId,
  socketId,
  stanceFamily,
  itemScene,
  poseOffset,
  sourceMarkerId,
}: {
  adapter: CharacterRigAdapter;
  characterId: string;
  characterName: string;
  itemId: EquipmentId;
  socketId: SocketId;
  stanceFamily: StanceFamilyId | "storage";
  itemScene: THREE.Object3D;
  poseOffset: TransformPose;
  sourceMarkerId: EquipmentMarkerId;
}): BoundAttachmentHandle | null => {
  const socketNode = adapter.getSocketNode(socketId);
  if (!socketNode) {
    reportAttachmentIssue({
      characterId,
      characterName,
      rigProfileId: adapter.getRigProfileId(),
      itemId,
      socketId,
      stanceFamily,
      reason: "Resolved socket node is missing",
    });
    return null;
  }

  const markerPose = resolveItemMarkerPose(itemScene, itemId, sourceMarkerId, {
    characterId,
    characterName,
    rigProfileId: adapter.getRigProfileId(),
    socketId,
    stanceFamily,
    itemId,
  });

  const bindingRoot = new THREE.Group();
  bindingRoot.name = `ATTACH_BIND__${itemId}__${socketId}`;
  const markerCompensationNode = new THREE.Group();
  markerCompensationNode.name = `ATTACH_MARKER__${sourceMarkerId}`;
  bindingRoot.add(markerCompensationNode);
  markerCompensationNode.add(itemScene);

  socketNode.updateMatrixWorld(true);
  const applySocketLocalPose = (nextPose: TransformPose) => {
    socketNode.updateMatrixWorld(true);
    socketNode.getWorldScale(_socketWorldScale);
    const inverseParentScale = _socketWorldScale.x > 0.0001 ? 1 / _socketWorldScale.x : 1;
    const normalizedPose = clonePose(nextPose);
    normalizedPose.position.x *= inverseParentScale;
    normalizedPose.position.y *= inverseParentScale;
    normalizedPose.position.z *= inverseParentScale;
    applyPoseToObject(bindingRoot, normalizedPose, inverseParentScale);
  };

  applySocketLocalPose(poseOffset);

  _inverseMarkerMatrix.copy(composePoseMatrix(markerPose)).invert();
  decomposeMatrixToObject(_inverseMarkerMatrix, markerCompensationNode);

  disableFrustumCulling(itemScene);
  socketNode.add(bindingRoot);
  bindingRoot.updateMatrixWorld(true);

  return {
    bindingRoot,
    applyPose: applySocketLocalPose,
    readPose: () => {
      socketNode.updateMatrixWorld(true);
      socketNode.getWorldScale(_socketWorldScale);
      const parentScale = _socketWorldScale.x > 0.0001 ? _socketWorldScale.x : 1;
      return readPoseFromObject(bindingRoot, parentScale);
    },
    detach: () => {
      socketNode.remove(bindingRoot);
    },
  };
};

export const buildAttachmentDebugReport = ({
  unitId,
  unitName,
  adapter,
  equipmentView,
}: {
  unitId: string;
  unitName: string;
  adapter: CharacterRigAdapter;
  equipmentView: ResolvedEquipmentView;
}): AttachmentDebugReport => {
  const snapshot = adapter.debugSnapshot();
  return {
    unitId,
    unitName,
    rigProfileId: snapshot.rigProfileId,
    stanceFamily: equipmentView.stanceFamily,
    resolvedBones: snapshot.resolvedBones,
    resolvedSockets: snapshot.resolvedSockets,
    visibleBindings: equipmentView.bindings.map((binding) => ({
      itemId: binding.itemId,
      sourceSlot: binding.sourceSlot,
      socketId: binding.socketId,
      stanceFamily: binding.stanceFamily,
      profileId: binding.profileId,
      sourceMarkerId: binding.sourceMarkerId,
    })),
  };
};
