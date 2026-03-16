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
  currentHp: number;
  currentResource: number;
  weaponId: WeaponId;
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

export interface ArenaDefinition {
  bounds: {
    width: number;
    depth: number;
  };
  groundModelUrl: string;
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
  rewardChoices: RewardChoiceState;
  appliedRewards: RewardId[];
  totalXp: number;
  level: number;
  waveNumber: number;
  arena: ArenaDefinition;
  debugFlags: DebugFlagsState;
}
