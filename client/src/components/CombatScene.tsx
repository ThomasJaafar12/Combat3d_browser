import { useFrame } from "@react-three/fiber";
import { Grid, Line, OrbitControls, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { CombatSnapshot } from "@/game/runtime";
import type { Vec3 } from "@/game/defs";
import * as THREE from "three";

export interface CameraOrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

interface CombatSceneProps {
  snapshot: CombatSnapshot;
  cameraOrbit: CameraOrbitState;
  onGroundClick: (point: Vec3) => void;
  onUnitClick: (unitId: string) => void;
}

function CameraRig({ snapshot, cameraOrbit }: { snapshot: CombatSnapshot; cameraOrbit: CameraOrbitState }) {
  useFrame(({ camera }) => {
    const leader = snapshot.units.find((unit) => unit.id === snapshot.leaderId);
    if (!leader) {
      return;
    }

    const cosPitch = Math.cos(cameraOrbit.pitch);
    const offset = new THREE.Vector3(
      -Math.sin(cameraOrbit.yaw) * cosPitch * cameraOrbit.distance,
      Math.sin(cameraOrbit.pitch) * cameraOrbit.distance + 3.5,
      -Math.cos(cameraOrbit.yaw) * cosPitch * cameraOrbit.distance,
    );
    const lookTarget = new THREE.Vector3(
      leader.position.x + Math.sin(leader.facingYaw) * 6,
      leader.position.y + 1.7,
      leader.position.z + Math.cos(leader.facingYaw) * 6,
    );
    camera.position.set(leader.position.x + offset.x, leader.position.y + offset.y, leader.position.z + offset.z);
    camera.lookAt(lookTarget);
  });

  return null;
}

function UnitMesh({
  unit,
  isSelected,
  onClick,
}: {
  unit: CombatSnapshot["units"][number];
  isSelected: boolean;
  onClick: (unitId: string) => void;
}) {
  const color = unit.faction === "leader_party" ? (unit.id.includes("leader") ? "#487fc4" : "#58a878") : "#c95c55";
  const statusLine = unit.isDowned ? "Downed" : unit.isDead ? "Dead" : `${Math.round(unit.currentHp)} HP`;

  return (
    <group
      position={[unit.position.x, unit.position.y, unit.position.z]}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onClick(unit.id);
      }}
    >
      <mesh castShadow position={[0, 1.2, 0]}>
        <capsuleGeometry args={[0.45, 1.25, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.65} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[unit.spawnRadius + 0.18, unit.spawnRadius + 0.32, 28]} />
        <meshBasicMaterial
          color={isSelected ? "#f6f0ca" : unit.faction === "leader_party" ? "#90d7ff" : "#ff9288"}
          transparent
          opacity={0.9}
        />
      </mesh>
      <Text color="#2c1e14" fontSize={0.3} anchorX="center" anchorY="middle" position={[0, 2.85, 0]}>
        {unit.name}
      </Text>
      <Text color="#31261d" fontSize={0.24} anchorX="center" anchorY="middle" position={[0, 2.45, 0]}>
        {statusLine}
      </Text>
      <Line
        points={[
          [-0.48, 2.18, 0],
          [-0.48 + Math.max(0.02, Math.min(0.96, unit.currentHp / 140) * 0.96), 2.18, 0],
        ]}
        color="#75c96a"
        lineWidth={3}
      />
    </group>
  );
}

function ArenaObstacles({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.arena.obstacles.map((obstacle) => (
        <mesh
          key={obstacle.id}
          castShadow
          receiveShadow
          position={[obstacle.position.x, obstacle.size.y / 2, obstacle.position.z]}
          rotation={[0, obstacle.rotationY, 0]}
        >
          <boxGeometry args={[obstacle.size.x, obstacle.size.y, obstacle.size.z]} />
          <meshStandardMaterial
            color={obstacle.kind === "crate" ? "#7b5135" : obstacle.kind === "wall" ? "#8e8476" : "#93755a"}
          />
        </mesh>
      ))}
    </>
  );
}

function Zones({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.zones.map((zone) => (
        <mesh
          key={zone.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[zone.center.x, 0.04, zone.center.z]}
        >
          <ringGeometry args={[zone.radius * 0.6, zone.radius, 40]} />
          <meshBasicMaterial color="#8db5d6" transparent opacity={0.35} />
        </mesh>
      ))}
    </>
  );
}

function Projectiles({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.projectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.position.x, 1.4, projectile.position.z]} castShadow>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={projectile.spellId ? "#7cb6ff" : "#d7d1b2"} emissive="#2a4c73" />
        </mesh>
      ))}
    </>
  );
}

function FloatingTexts({ snapshot }: { snapshot: CombatSnapshot }) {
  return (
    <>
      {snapshot.floatingTexts.map((entry) => (
        <Text
          key={entry.id}
          color={
            entry.kind === "damage"
              ? "#a62e2b"
              : entry.kind === "heal"
                ? "#3d8a3f"
                : entry.kind === "reward"
                  ? "#9f6f11"
                  : "#27445c"
          }
          fontSize={0.26}
          anchorX="center"
          anchorY="middle"
          position={[entry.position.x, entry.position.y, entry.position.z]}
        >
          {entry.text}
        </Text>
      ))}
    </>
  );
}

export function CombatScene({ snapshot, cameraOrbit, onGroundClick, onUnitClick }: CombatSceneProps) {
  const groundPoints: [number, number, number][] = [
    [-snapshot.arena.bounds.width / 2, 0, -snapshot.arena.bounds.depth / 2],
    [snapshot.arena.bounds.width / 2, 0, -snapshot.arena.bounds.depth / 2],
    [snapshot.arena.bounds.width / 2, 0, snapshot.arena.bounds.depth / 2],
    [-snapshot.arena.bounds.width / 2, 0, snapshot.arena.bounds.depth / 2],
    [-snapshot.arena.bounds.width / 2, 0, -snapshot.arena.bounds.depth / 2],
  ];

  return (
    <>
      <CameraRig snapshot={snapshot} cameraOrbit={cameraOrbit} />
      <color attach="background" args={["#e6dcc6"]} />
      <ambientLight intensity={1.25} />
      <directionalLight castShadow intensity={2.2} position={[12, 18, 5]} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <Grid
        args={[snapshot.arena.bounds.width, snapshot.arena.bounds.depth]}
        cellColor="#b99e72"
        sectionColor="#d5b98e"
        fadeDistance={45}
        fadeStrength={1}
        infiniteGrid={false}
      />
      <Line points={groundPoints} color="#8e704c" lineWidth={1.5} />
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event: ThreeEvent<PointerEvent>) => {
          onGroundClick({
            x: event.point.x,
            y: 0,
            z: event.point.z,
          });
        }}
      >
        <planeGeometry args={[snapshot.arena.bounds.width, snapshot.arena.bounds.depth]} />
        <meshStandardMaterial color="#c8b18a" />
      </mesh>
      <ArenaObstacles snapshot={snapshot} />
      <Zones snapshot={snapshot} />
      <Projectiles snapshot={snapshot} />
      {snapshot.units.map((unit) => (
        <UnitMesh
          key={unit.id}
          unit={unit}
          isSelected={snapshot.selectedTargetId === unit.id}
          onClick={onUnitClick}
        />
      ))}
      <FloatingTexts snapshot={snapshot} />
      <OrbitControls enabled={false} />
    </>
  );
}
