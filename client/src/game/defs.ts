export type FactionId = "leader_party" | "enemy";
export type UnitArchetypeId =
  | "leader_captain"
  | "companion_vanguard"
  | "companion_ranger"
  | "companion_mender"
  | "enemy_melee_chaser"
  | "enemy_ranged_caster"
  | "enemy_tank_disruptor";
export type CharacterPresentationId =
  | "leader"
  | "companion_paladin"
  | "companion_ranged"
  | "companion_support"
  | "enemy_melee"
  | "enemy_ranged"
  | "enemy_tank";
export type WeaponId =
  | "captain_swordshield"
  | "vanguard_halberd"
  | "ranger_longbow"
  | "mender_staff"
  | "raider_axe"
  | "hexcaster_staff"
  | "bulwark_maul";
export type SpellId =
  | "arcane_lance"
  | "commanders_mark"
  | "bulwark_pulse"
  | "field_mend"
  | "steam_snare"
  | "volley_burst"
  | "guardian_shout"
  | "ember_bolt"
  | "shockwave_slam";
export type StatusId =
  | "shielded"
  | "slowed"
  | "marked"
  | "taunted"
  | "battle_focus"
  | "downed"
  | "reviving";
export type OrderId =
  | "follow_me"
  | "hold_position"
  | "attack_my_target"
  | "defend_area"
  | "focus_weakest"
  | "retreat";
export type RewardId =
  | "steel_discipline"
  | "arcane_capacitors"
  | "battlefield_medicine"
  | "companion_drill"
  | "overcharged_ward"
  | "honed_edges";
export type BehaviorProfileId = "aggressive" | "defensive" | "support";
export type GroupId = "all" | "frontline" | "backline" | "support" | "alpha" | "bravo";
export type ControllerType = "player" | "ai";
export type WeaponKind = "melee" | "ranged" | "focus";
export type TargetingMode = "self" | "ally" | "enemy" | "ground" | "skillshot_line";
export type AreaShape = "single" | "circle" | "line";
export type EffectType =
  | "damage"
  | "heal"
  | "shield"
  | "slow"
  | "taunt"
  | "knockback"
  | "mark"
  | "buff";
export type OrderTargetMode = "none" | "point" | "unit";
export type MovementDirective = "follow_leader" | "hold" | "anchor" | "retreat";
export type TargetDirective = "nearest_enemy" | "player_target" | "weakest_enemy" | "anchor_threat";
export type StanceId = "aggressive" | "defensive" | "support";
export type RewardEffectType = "stat_bonus" | "spell_upgrade" | "party_bonus";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface StatBlock {
  maxHp: number;
  maxResource: number;
  moveSpeed: number;
  attackPower: number;
  spellPower: number;
  defense: number;
  revivePower: number;
}

export interface AssetBinding {
  modelUrl?: string;
  iconUrl?: string;
  panelUrl?: string;
  vfxUrl?: string;
  sfxUrl?: string;
}

export type EquipmentSlotId = "main_hand" | "off_hand";

export interface EquipmentAttachmentDefinition {
  boneCandidates: string[];
  position: Vec3;
  rotation: Vec3;
  scale: number;
}

export type EquipmentId =
  | "leader_sword"
  | "leader_shield"
  | "ranger_bow"
  | "vanguard_halberd_equip"
  | "mender_staff_equip"
  | "hexcaster_staff_equip"
  | "raider_axe_equip"
  | "bulwark_maul_equip";

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  description: string;
  slotId: EquipmentSlotId;
  asset: AssetBinding;
  attachment: EquipmentAttachmentDefinition;
}

export interface FactionDefinition {
  id: FactionId;
  name: string;
  color: string;
  isFriendlyTo: FactionId[];
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  description: string;
  range: number;
  cooldownMs: number;
  baseDamage: number;
  projectileSpeed?: number;
  preferredDistance: number;
  asset: AssetBinding;
  visualAttachment?: EquipmentAttachmentDefinition;
}

export interface EffectDefinition {
  type: EffectType;
  power: number;
  durationMs?: number;
  radius?: number;
  shape?: AreaShape;
  statusId?: StatusId;
  stat?: keyof StatBlock;
}

export interface SpellDefinition {
  id: SpellId;
  name: string;
  description: string;
  cooldownMs: number;
  resourceCost: number;
  castTimeMs: number;
  range: number;
  targetingMode: TargetingMode;
  areaShape: AreaShape;
  areaRadius?: number;
  lineLength?: number;
  projectileSpeed?: number;
  effects: EffectDefinition[];
  aiTags: string[];
  asset: AssetBinding;
}

export interface StatusDefinition {
  id: StatusId;
  name: string;
  description: string;
  effectType: EffectType;
  maxStacks: number;
  defaultDurationMs: number;
  asset: AssetBinding;
}

export interface OrderDirectiveDefinition {
  movement: MovementDirective;
  targetSelection: TargetDirective;
  maintainDistance?: number;
  radius?: number;
  preferMarkedTarget?: boolean;
}

export interface OrderDefinition {
  id: OrderId;
  name: string;
  description: string;
  targetMode: OrderTargetMode;
  directive: OrderDirectiveDefinition;
}

export interface RewardEffectDefinition {
  type: RewardEffectType;
  value: number;
  target: "leader" | "companions" | "allies";
  stat?: keyof StatBlock;
  spellId?: SpellId;
  upgradeKey?: "power" | "cooldownMs" | "resourceCost";
}

export interface RewardDefinition {
  id: RewardId;
  name: string;
  description: string;
  rarity: "common" | "rare";
  iconUrl: string;
  effects: RewardEffectDefinition[];
}

export interface SpellLoadoutDefinition {
  id: string;
  ownerId: UnitArchetypeId | "leader_spellbook";
  spellIds: SpellId[];
  slotCount: number;
}

export interface BehaviorProfileDefinition {
  id: BehaviorProfileId;
  name: string;
  stance: StanceId;
  description: string;
  healThresholdPct: number;
  retreatThresholdPct: number;
  openerSpellId?: SpellId;
  rotationSpellIds: SpellId[];
  focusMarkedTarget: boolean;
  supportAllies: boolean;
}

export interface UnitDefinition {
  id: UnitArchetypeId;
  name: string;
  faction: FactionId;
  controller: ControllerType;
  presentationId: CharacterPresentationId;
  recruitmentLabel?: string;
  summary: string;
  group: GroupId;
  stats: StatBlock;
  weaponId: WeaponId;
  equipmentLoadout: Partial<Record<EquipmentSlotId, EquipmentId>>;
  spellbookIds: SpellId[];
  defaultLoadoutIds: SpellId[];
  behaviorProfileId: BehaviorProfileId;
  spawnRadius: number;
  reviveable: boolean;
  xpValue: number;
}

export interface PrototypeCatalog {
  factions: Record<FactionId, FactionDefinition>;
  equipment: Record<EquipmentId, EquipmentDefinition>;
  weapons: Record<WeaponId, WeaponDefinition>;
  spells: Record<SpellId, SpellDefinition>;
  statuses: Record<StatusId, StatusDefinition>;
  orders: Record<OrderId, OrderDefinition>;
  rewards: Record<RewardId, RewardDefinition>;
  loadouts: Record<string, SpellLoadoutDefinition>;
  behaviorProfiles: Record<BehaviorProfileId, BehaviorProfileDefinition>;
  units: Record<UnitArchetypeId, UnitDefinition>;
}
