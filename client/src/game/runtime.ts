import type {
  BehaviorProfileId,
  ControllerType,
  GroupId,
  OrderId,
  RewardId,
  SpellId,
  StatusId,
  UnitArchetypeId,
  Vec3,
  WeaponId,
} from "@/game/defs";
import type {
  RuntimeInputTelemetry,
  RuntimeLocomotionTelemetry,
  RuntimePresentationTelemetry,
} from "@/game/locomotion/types";
import type { EquipmentState } from "@/game/equipment/schema";

export type CombatPhase = "loadout" | "battle" | "victory" | "reward" | "defeat";
export type DebugFlag = "godMode" | "noCooldowns" | "showAi";
export type CustomGroupId = Extract<GroupId, "alpha" | "bravo">;

export interface RuntimeStatus {
  id: StatusId;
  sourceUnitId: string | null;
  remainingMs: number;
  magnitude: number;
}

export interface RuntimeOrderState {
  orderId: OrderId;
  anchor: Vec3 | null;
  targetUnitId: string | null;
  issuedAtMs: number;
}

export interface RuntimeBehaviorSettings {
  profileId: BehaviorProfileId;
  customGroup: CustomGroupId | null;
  healThresholdPct: number;
  retreatThresholdPct: number;
  openerSpellId: SpellId | null;
  rotationSpellIds: SpellId[];
  focusMarkedTarget: boolean;
  supportAllies: boolean;
}

export interface RuntimeCastState {
  spellId: SpellId;
  elapsedMs: number;
  targetUnitId: string | null;
  targetPoint: Vec3 | null;
  direction: Vec3 | null;
}

export interface RuntimeAiState {
  focusUnitId: string | null;
  anchorPoint: Vec3 | null;
  retreatPoint: Vec3 | null;
  lastDecisionMs: number;
  openerUsed: boolean;
  stateLabel: string;
}

export interface RuntimeUnit {
  id: string;
  definitionId: UnitArchetypeId;
  name: string;
  faction: "leader_party" | "enemy";
  controller: ControllerType;
  group: GroupId;
  customGroup: CustomGroupId | null;
  position: Vec3;
  facingYaw: number;
  velocity: Vec3;
  moveIntent: Vec3;
  inputTelemetry: RuntimeInputTelemetry;
  locomotion: RuntimeLocomotionTelemetry;
  presentation: RuntimePresentationTelemetry;
  currentHp: number;
  currentResource: number;
  weaponId: WeaponId;
  equipmentState: EquipmentState;
  equipmentRevision: number;
  loadoutSpellIds: SpellId[];
  spellbookIds: SpellId[];
  spellCooldowns: Partial<Record<SpellId, number>>;
  basicCooldownMs: number;
  targetUnitId: string | null;
  order: RuntimeOrderState;
  behavior: RuntimeBehaviorSettings;
  statuses: RuntimeStatus[];
  castState: RuntimeCastState | null;
  aiState: RuntimeAiState;
  isDowned: boolean;
  isDead: boolean;
  bleedOutMs: number | null;
  reviveProgressMs: number;
  xpValue: number;
  spawnRadius: number;
  lastDamagedByUnitId: string | null;
}

export interface RuntimeProjectile {
  id: string;
  sourceUnitId: string;
  targetUnitId: string | null;
  spellId: SpellId | null;
  weaponId: WeaponId | null;
  position: Vec3;
  direction: Vec3;
  speed: number;
  remainingRange: number;
  power: number;
  appliesStatusId: StatusId | null;
  hitsFaction: "leader_party" | "enemy";
}

export interface RuntimeZone {
  id: string;
  sourceUnitId: string;
  spellId: SpellId;
  center: Vec3;
  radius: number;
  remainingMs: number;
  tickAccumulatorMs: number;
}

export interface FloatingText {
  id: string;
  text: string;
  kind: "damage" | "heal" | "status" | "reward" | "info";
  position: Vec3;
  remainingMs: number;
}

export type PresentationEventKind =
  | "basic_attack_hit"
  | "spell_cast"
  | "spell_impact"
  | "unit_downed"
  | "revive_complete"
  | "level_up";

export interface PresentationEvent {
  id: string;
  kind: PresentationEventKind;
  timeMs: number;
  sourceUnitId: string | null;
  targetUnitId: string | null;
  position: Vec3 | null;
  spellId: SpellId | null;
  weaponId: WeaponId | null;
}

export interface RewardChoiceState {
  choices: RewardId[];
  pendingSelection: boolean;
}

export interface DebugFlagsState {
  godMode: boolean;
  noCooldowns: boolean;
  showAi: boolean;
}

export interface ArenaObstacle {
  id: string;
  kind: "crate" | "fence" | "wall" | "archway" | "timber";
  position: Vec3;
  rotationY: number;
  size: {
    x: number;
    y: number;
    z: number;
  };
  modelUrl: string;
  blocksMovement: boolean;
}

export interface ArenaSupportSurface {
  id: string;
  kind: "flat" | "ramp";
  position: Vec3;
  rotationY: number;
  size: {
    x: number;
    z: number;
  };
  supportY: number;
  endSupportY?: number;
  rampAxis?: "x" | "z";
}

export interface ArenaDefinition {
  bounds: {
    width: number;
    depth: number;
  };
  groundModelUrl: string;
  supportSurfaces: ArenaSupportSurface[];
  playerStart: Vec3;
  recruitStaging: Vec3[];
  companionSlots: Vec3[];
  enemySpawnPoints: Vec3[];
  retreatPoint: Vec3;
  defendPoint: Vec3;
  obstacles: ArenaObstacle[];
}

export interface CombatSnapshot {
  phase: CombatPhase;
  timeMs: number;
  leaderId: string;
  selectedTargetId: string | null;
  activeLoadoutIds: SpellId[];
  spellbookIds: SpellId[];
  recruitableCompanions: UnitArchetypeId[];
  recruitedCompanionIds: string[];
  units: RuntimeUnit[];
  projectiles: RuntimeProjectile[];
  zones: RuntimeZone[];
  floatingTexts: FloatingText[];
  presentationEvents: PresentationEvent[];
  rewardChoices: RewardChoiceState;
  appliedRewards: RewardId[];
  totalXp: number;
  level: number;
  waveNumber: number;
  arena: ArenaDefinition;
  debugFlags: DebugFlagsState;
}

export interface CombatRenderStatus {
  id: StatusId;
  remainingMs: number;
}

export interface CombatRenderUnit {
  id: string;
  definitionId: UnitArchetypeId;
  name: string;
  faction: "leader_party" | "enemy";
  controller: ControllerType;
  position: Vec3;
  facingYaw: number;
  velocity: Vec3;
  currentHp: number;
  weaponId: WeaponId;
  equipmentState: EquipmentState;
  equipmentRevision: number;
  basicCooldownMs: number;
  locomotion: RuntimeLocomotionTelemetry;
  presentation: RuntimePresentationTelemetry;
  statuses: CombatRenderStatus[];
  aiStateLabel: string;
  isCasting: boolean;
  isDowned: boolean;
  isDead: boolean;
}

export interface CombatRenderSnapshot {
  phase: CombatPhase;
  timeMs: number;
  leaderId: string;
  selectedTargetId: string | null;
  units: CombatRenderUnit[];
  projectiles: RuntimeProjectile[];
  zones: RuntimeZone[];
  floatingTexts: FloatingText[];
  arena: ArenaDefinition;
  debugFlags: DebugFlagsState;
}
