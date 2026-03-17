import { useEffect, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrls } from "@/game/assets";
import { prototypeCatalog } from "@/game/content";
import type { CharacterPresentationId } from "@/game/defs";
import { arenaDefinition } from "@/game/environment/arena";

type PresentationAnimationId =
  | "idle"
  | "run"
  | "attack"
  | "cast"
  | "hit"
  | "death"
  | "block"
  | "draw"
  | "release"
  | "guard";

export type EnvironmentModelId =
  | "ground"
  | "crate"
  | "fence_short"
  | "fence_long"
  | "wall"
  | "archway"
  | "metal_fence"
  | "timber_wall";

interface LoadedModelAsset {
  scene: THREE.Group;
  size: THREE.Vector3;
  animations: THREE.AnimationClip[];
}

interface CharacterBundle {
  id: CharacterPresentationId;
  scene: THREE.Group;
  size: THREE.Vector3;
  animations: Partial<Record<PresentationAnimationId, THREE.AnimationClip>>;
  targetHeight: number;
  rotationOffsetY: number;
  tint: string | null;
}

export interface CharacterModelInstance {
  scene: THREE.Group;
  animations: Partial<Record<PresentationAnimationId, THREE.AnimationClip>>;
  rotationOffsetY: number;
}

export interface EnvironmentModelInstance {
  scene: THREE.Group;
}

const modelPromiseCache = new Map<string, Promise<LoadedModelAsset>>();
const characterPromiseCache = new Map<CharacterPresentationId, Promise<CharacterBundle>>();

const sharedFbxLoader = new FBXLoader();
const sharedLoadingManager = new THREE.LoadingManager();

const environmentMaterialProxy = (() => {
  const svgByKind = {
    wood: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#8b6037"/><rect y="8" width="16" height="2" fill="#6c4524" opacity="0.45"/></svg>`,
    )}`,
    plaster: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#dcc8ac"/><rect x="2" y="2" width="12" height="12" fill="#efe0c8" opacity="0.32"/></svg>`,
    )}`,
    brick: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#b9ada0"/><path d="M0 5h16M0 11h16M5 0v5M11 5v6M5 11v5" stroke="#95897d" stroke-width="1"/></svg>`,
    )}`,
  };

  return (url: string) => {
    if (!url.includes("arena_outdoor/materials/") && !url.includes("../materials/")) {
      return null;
    }
    if (url.includes("wood_trim")) {
      return svgByKind.wood;
    }
    if (url.includes("plaster")) {
      return svgByKind.plaster;
    }
    return svgByKind.brick;
  };
})();

sharedLoadingManager.setURLModifier((url) => environmentMaterialProxy(url) ?? url);
const sharedGltfLoader = new GLTFLoader(sharedLoadingManager);

const characterConfigs: Record<
  CharacterPresentationId,
  {
    modelUrl: string;
    animationUrls: Partial<Record<PresentationAnimationId, string>>;
    targetHeight: number;
    rotationOffsetY: number;
    tint: string | null;
  }
> = {
  leader: {
    modelUrl: assetUrls.characters.leader,
    animationUrls: assetUrls.characterAnimations.leader,
    targetHeight: 2.45,
    rotationOffsetY: 0,
    tint: null,
  },
  companion_melee: {
    modelUrl: assetUrls.characters.enemyAxe,
    animationUrls: {
      idle: assetUrls.characterAnimations.axe.idle,
      run: assetUrls.characterAnimations.axe.run,
      attack: assetUrls.characterAnimations.axe.attack,
      hit: assetUrls.characterAnimations.axe.hit,
      guard: assetUrls.characterAnimations.axe.guard,
    },
    targetHeight: 2.2,
    rotationOffsetY: 0,
    tint: "#95b785",
  },
  companion_ranged: {
    modelUrl: assetUrls.characters.companionArcher,
    animationUrls: {
      idle: assetUrls.characterAnimations.archer.idle,
      run: assetUrls.characterAnimations.archer.run,
      attack: assetUrls.characterAnimations.archer.attack,
      cast: assetUrls.characterAnimations.archer.draw,
      release: assetUrls.characterAnimations.archer.release,
      hit: assetUrls.characterAnimations.archer.hit,
      death: assetUrls.characterAnimations.archer.death,
    },
    targetHeight: 2.12,
    rotationOffsetY: 0,
    tint: "#8ab0db",
  },
  companion_support: {
    modelUrl: assetUrls.characters.companionArcher,
    animationUrls: {
      idle: assetUrls.characterAnimations.archer.idle,
      run: assetUrls.characterAnimations.archer.run,
      cast: assetUrls.characterAnimations.archer.draw,
      attack: assetUrls.characterAnimations.archer.attack,
      hit: assetUrls.characterAnimations.archer.hit,
      death: assetUrls.characterAnimations.archer.death,
    },
    targetHeight: 2.08,
    rotationOffsetY: 0,
    tint: "#d8d2a4",
  },
  enemy_melee: {
    modelUrl: assetUrls.characters.enemyAxe,
    animationUrls: {
      idle: assetUrls.characterAnimations.axe.idle,
      run: assetUrls.characterAnimations.axe.run,
      attack: assetUrls.characterAnimations.axe.attackAlt,
      hit: assetUrls.characterAnimations.axe.hit,
      guard: assetUrls.characterAnimations.axe.guard,
    },
    targetHeight: 2.24,
    rotationOffsetY: 0,
    tint: "#c88570",
  },
  enemy_ranged: {
    modelUrl: assetUrls.characters.companionArcher,
    animationUrls: {
      idle: assetUrls.characterAnimations.archer.idle,
      run: assetUrls.characterAnimations.archer.run,
      attack: assetUrls.characterAnimations.archer.release,
      cast: assetUrls.characterAnimations.archer.draw,
      hit: assetUrls.characterAnimations.archer.hit,
      death: assetUrls.characterAnimations.archer.death,
    },
    targetHeight: 2.06,
    rotationOffsetY: 0,
    tint: "#cf8c8a",
  },
  enemy_tank: {
    modelUrl: assetUrls.characters.leader,
    animationUrls: {
      idle: assetUrls.characterAnimations.leader.idle,
      run: assetUrls.characterAnimations.leader.run,
      attack: assetUrls.characterAnimations.leader.attack,
      cast: assetUrls.characterAnimations.leader.block,
      hit: assetUrls.characterAnimations.leader.hit,
      death: assetUrls.characterAnimations.leader.death,
      block: assetUrls.characterAnimations.leader.block,
    },
    targetHeight: 2.56,
    rotationOffsetY: 0,
    tint: "#b36e66",
  },
};

const environmentModelUrls: Record<EnvironmentModelId, string> = {
  ground: assetUrls.environment.ground,
  crate: assetUrls.environment.crate,
  fence_short: assetUrls.environment.fenceShort,
  fence_long: assetUrls.environment.fenceLong,
  wall: assetUrls.environment.wall,
  archway: assetUrls.environment.archway,
  metal_fence: assetUrls.environment.metalFence,
  timber_wall: assetUrls.environment.timberWall,
};

const usedCharacterPresentationIds = [
  ...new Set(Object.values(prototypeCatalog.units).map((definition) => definition.presentationId)),
];

const usedEnvironmentModelUrls = [
  arenaDefinition.groundModelUrl,
  ...new Set(arenaDefinition.obstacles.map((obstacle) => obstacle.modelUrl)),
];

const setMeshShadows = (root: THREE.Object3D) => {
  root.traverse((child) => {
    if ("isMesh" in child || "isSkinnedMesh" in child) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => {
          material.side = THREE.FrontSide;
        });
      } else if (mesh.material) {
        mesh.material.side = THREE.FrontSide;
      }
    }
  });
};

const centerObjectOnFloor = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= bounds.min.y;
  object.position.z -= center.z;
};

const measureObject = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
};

const applyUniformHeight = (object: THREE.Object3D, targetHeight: number) => {
  const size = measureObject(object);
  const height = Math.max(size.y, 0.001);
  const scale = targetHeight / height;
  object.scale.setScalar(scale);
};

const applyBoxFit = (object: THREE.Object3D, targetSize: THREE.Vector3Like) => {
  const size = measureObject(object);
  object.scale.set(
    targetSize.x / Math.max(size.x, 0.001),
    targetSize.y / Math.max(size.y, 0.001),
    targetSize.z / Math.max(size.z, 0.001),
  );
};

const tintInstance = (object: THREE.Object3D, tintHex: string | null) => {
  if (!tintHex) {
    return;
  }

  const tint = new THREE.Color(tintHex);
  object.traverse((child) => {
    if (!("isMesh" in child || "isSkinnedMesh" in child)) {
      return;
    }

    const mesh = child as THREE.Mesh;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((entry) => {
        const material = entry.clone();
        if ("color" in material && material.color instanceof THREE.Color) {
          material.color.multiply(tint);
        }
        return material;
      });
      return;
    }

    if (!mesh.material) {
      return;
    }

    mesh.material = mesh.material.clone();
    if ("color" in mesh.material && mesh.material.color instanceof THREE.Color) {
      mesh.material.color.multiply(tint);
    }
  });
};

const loadRawModel = (url: string) => {
  const cached = modelPromiseCache.get(url);
  if (cached) {
    return cached;
  }

  const lowerUrl = url.toLowerCase();
  const loaderPromise = new Promise<LoadedModelAsset>((resolve, reject) => {
    const finish = (source: THREE.Object3D, animations: THREE.AnimationClip[]) => {
      const root = new THREE.Group();
      root.add(source);
      setMeshShadows(root);
      centerObjectOnFloor(root);
      resolve({
        scene: root,
        size: measureObject(root),
        animations,
      });
    };

    if (lowerUrl.endsWith(".fbx")) {
      sharedFbxLoader.load(
        url,
        (fbx) => {
          finish(fbx, [...(fbx.animations ?? [])]);
        },
        undefined,
        reject,
      );
      return;
    }

    sharedGltfLoader.load(
      url,
      (gltf) => {
        finish(gltf.scene, [...gltf.animations]);
      },
      undefined,
      reject,
    );
  });

  modelPromiseCache.set(url, loaderPromise);
  return loaderPromise;
};

const loadAnimationClip = async (url: string, fallbackName: PresentationAnimationId) => {
  const asset = await loadRawModel(url);
  const clip = asset.animations[0];
  if (!clip) {
    return null;
  }
  const normalizedClip = clip.clone().resetDuration().trim().optimize();
  normalizedClip.name = fallbackName;
  return normalizedClip;
};

export const loadCharacterModel = async (presentationId: CharacterPresentationId) => {
  const cached = characterPromiseCache.get(presentationId);
  if (cached) {
    return cached;
  }

  const config = characterConfigs[presentationId];
  const bundlePromise = Promise.all([
    loadRawModel(config.modelUrl),
    Promise.all(
      Object.entries(config.animationUrls).map(async ([animationId, animationUrl]) => {
        if (!animationUrl) {
          return [animationId, null] as const;
        }
        return [animationId, await loadAnimationClip(animationUrl, animationId as PresentationAnimationId)] as const;
      }),
    ),
  ]).then(([modelAsset, animationEntries]) => ({
    id: presentationId,
    scene: modelAsset.scene,
    size: modelAsset.size,
    animations: Object.fromEntries(
      animationEntries.filter((entry): entry is [string, THREE.AnimationClip] => !!entry[1]),
    ) as CharacterBundle["animations"],
    targetHeight: config.targetHeight,
    rotationOffsetY: config.rotationOffsetY,
    tint: config.tint,
  }));

  characterPromiseCache.set(presentationId, bundlePromise);
  return bundlePromise;
};

export const loadEnvironmentModel = async (modelId: EnvironmentModelId) => loadRawModel(environmentModelUrls[modelId]);
export const loadModelAsset = loadRawModel;

const cloneCharacterBundle = (bundle: CharacterBundle): CharacterModelInstance => {
  const scene = clone(bundle.scene) as THREE.Group;
  applyUniformHeight(scene, bundle.targetHeight);
  tintInstance(scene, bundle.tint);
  scene.updateMatrixWorld(true);
  return {
    scene,
    animations: bundle.animations,
    rotationOffsetY: bundle.rotationOffsetY,
  };
};

const cloneEnvironmentAsset = (asset: LoadedModelAsset, fitSize?: THREE.Vector3Like) => {
  const scene = asset.scene.clone(true);
  if (fitSize) {
    applyBoxFit(scene, fitSize);
  }
  scene.updateMatrixWorld(true);
  return { scene };
};

const useAsyncClone = <T,>(createValue: () => Promise<T>, deps: unknown[]) => {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    setValue(null);

    createValue()
      .then((nextValue) => {
        if (!cancelled) {
          setValue(nextValue);
        }
      })
      .catch((error) => {
        console.error("Presentation asset load failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return value;
};

export const useCharacterModel = (presentationId: CharacterPresentationId) =>
  useAsyncClone(() => loadCharacterModel(presentationId).then(cloneCharacterBundle), [presentationId]);

export const useEnvironmentModel = (modelId: EnvironmentModelId, fitSize?: THREE.Vector3Like) =>
  useAsyncClone(
    () => loadEnvironmentModel(modelId).then((asset) => cloneEnvironmentAsset(asset, fitSize)),
    [modelId, fitSize?.x, fitSize?.y, fitSize?.z],
  );

export const useModelAsset = (modelUrl: string, fitSize?: THREE.Vector3Like) =>
  useAsyncClone(
    () => loadModelAsset(modelUrl).then((asset) => cloneEnvironmentAsset(asset, fitSize)),
    [modelUrl, fitSize?.x, fitSize?.y, fitSize?.z],
  );

export const preloadPresentationAssets = () =>
  Promise.all([
    ...usedCharacterPresentationIds.map((presentationId) => loadCharacterModel(presentationId)),
    ...usedEnvironmentModelUrls.map((modelUrl) => loadModelAsset(modelUrl)),
  ]);
