import { prototypeCatalog } from "@/game/content";
import type {
  BehaviorProfileId,
  OrderId,
  RewardId,
  SpellId,
  StatusId,
  UnitArchetypeId,
} from "@/game/defs";
import { arenaDefinition } from "@/game/map";
import { clamp, roundVec3, vec3 } from "@/game/math";
import type {
  CombatSnapshot,
  DebugFlag,
  FloatingText,
  RewardChoiceState,
  RuntimeBehaviorSettings,
  RuntimeOrderState,
  RuntimeUnit,
} from "@/game/runtime";

type Listener = (snapshot: CombatSnapshot) => void;

const RESOURCE_REGEN_PER_SECOND = 7;
const DOWNED_BLEED_OUT_MS = 18000;
const REVIVE_CHANNEL_MS = 1500;
const LEVEL_XP_STEP = 100;

export class CombatAuthority {
  private listeners = new Set<Listener>();
  private idCounter = 0;
  private unitsById = new Map<string, RuntimeUnit>();
  private timeMs = 0;
  private phase: CombatSnapshot["phase"] = "loadout";
  private leaderId = "";
  private selectedTargetId: string | null = null;
  private activeLoadoutIds: SpellId[] = [];
  private spellbookIds: SpellId[] = [];
  private recruitableCompanions: UnitArchetypeId[] = [
    "companion_vanguard",
    "companion_ranger",
    "companion_mender",
  ];
  private recruitedCompanionIds: string[] = [];
  private projectiles: CombatSnapshot["projectiles"] = [];
  private zones: CombatSnapshot["zones"] = [];
  private floatingTexts: FloatingText[] = [];
  private rewardChoices: RewardChoiceState = { choices: [], pendingSelection: false };
  private appliedRewards: RewardId[] = [];
  private totalXp = 0;
  private level = 1;
  private waveNumber = 1;
  private debugFlags: CombatSnapshot["debugFlags"] = {
    godMode: false,
    noCooldowns: false,
    showAi: true,
  };

  constructor() {
    this.resetEncounter();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): CombatSnapshot {
    return {
      phase: this.phase,
      timeMs: this.timeMs,
      leaderId: this.leaderId,
      selectedTargetId: this.selectedTargetId,
      activeLoadoutIds: [...this.activeLoadoutIds],
      spellbookIds: [...this.spellbookIds],
      recruitableCompanions: [...this.recruitableCompanions],
      recruitedCompanionIds: [...this.recruitedCompanionIds],
      units: [...this.unitsById.values()].map((unit) => ({
        ...unit,
        position: roundVec3(unit.position),
        velocity: roundVec3(unit.velocity),
        statuses: unit.statuses.map((status) => ({ ...status })),
        spellCooldowns: { ...unit.spellCooldowns },
        loadoutSpellIds: [...unit.loadoutSpellIds],
        spellbookIds: [...unit.spellbookIds],
        order: {
          ...unit.order,
          anchor: unit.order.anchor ? roundVec3(unit.order.anchor) : null,
        },
        behavior: {
          ...unit.behavior,
          rotationSpellIds: [...unit.behavior.rotationSpellIds],
        },
        castState: unit.castState
          ? {
              ...unit.castState,
              targetPoint: unit.castState.targetPoint ? roundVec3(unit.castState.targetPoint) : null,
              direction: unit.castState.direction ? roundVec3(unit.castState.direction) : null,
            }
          : null,
        aiState: {
          ...unit.aiState,
          anchorPoint: unit.aiState.anchorPoint ? roundVec3(unit.aiState.anchorPoint) : null,
          retreatPoint: unit.aiState.retreatPoint ? roundVec3(unit.aiState.retreatPoint) : null,
        },
      })),
      projectiles: this.projectiles.map((projectile) => ({
        ...projectile,
        position: roundVec3(projectile.position),
        direction: roundVec3(projectile.direction),
      })),
      zones: this.zones.map((zone) => ({
        ...zone,
        center: roundVec3(zone.center),
      })),
      floatingTexts: this.floatingTexts.map((entry) => ({
        ...entry,
        position: roundVec3(entry.position),
      })),
      rewardChoices: {
        choices: [...this.rewardChoices.choices],
        pendingSelection: this.rewardChoices.pendingSelection,
      },
      appliedRewards: [...this.appliedRewards],
      totalXp: this.totalXp,
      level: this.level,
      waveNumber: this.waveNumber,
      arena: arenaDefinition,
      debugFlags: { ...this.debugFlags },
    };
  }

  resetEncounter() {
    this.idCounter = 0;
    this.unitsById.clear();
    this.projectiles = [];
    this.zones = [];
    this.floatingTexts = [];
    this.timeMs = 0;
    this.phase = "loadout";
    this.selectedTargetId = null;
    this.rewardChoices = { choices: [], pendingSelection: false };
    this.debugFlags = { godMode: false, noCooldowns: false, showAi: true };
    this.appliedRewards = [];
    this.totalXp = 0;
    this.level = 1;
    this.waveNumber = 1;

    const leader = this.createUnit("leader_captain", arenaDefinition.playerStart);
    this.leaderId = leader.id;
    this.spellbookIds = [...leader.spellbookIds];
    this.activeLoadoutIds = [...leader.loadoutSpellIds];
    this.unitsById.set(leader.id, leader);
    this.recruitedCompanionIds = [];
    this.recruitableCompanions = [
      "companion_vanguard",
      "companion_ranger",
      "companion_mender",
    ];

    this.emit();
  }

  recruitCompanion(definitionId: UnitArchetypeId) {
    if (this.phase !== "loadout") {
      return false;
    }
    if (!this.recruitableCompanions.includes(definitionId)) {
      return false;
    }
    if (this.recruitedCompanionIds.length >= arenaDefinition.companionSlots.length) {
      return false;
    }

    const position = arenaDefinition.recruitStaging[this.recruitedCompanionIds.length] ?? arenaDefinition.playerStart;
    const unit = this.createUnit(definitionId, position);
    this.unitsById.set(unit.id, unit);
    this.recruitedCompanionIds = [...this.recruitedCompanionIds, unit.id];
    this.recruitableCompanions = this.recruitableCompanions.filter((candidate) => candidate !== definitionId);
    this.floatingTexts.push(this.makeFloatingText(`${unit.name} ready`, "info", unit.position));
    this.emit();
    return true;
  }

  setLeaderLoadout(spellIds: SpellId[]) {
    const leader = this.unitsById.get(this.leaderId);
    if (!leader) {
      return false;
    }

    const nextLoadout = [...new Set(spellIds)];
    if (nextLoadout.length !== prototypeCatalog.loadouts.leader_spellbook.slotCount) {
      return false;
    }
    if (!nextLoadout.every((spellId) => leader.spellbookIds.includes(spellId))) {
      return false;
    }

    leader.loadoutSpellIds = nextLoadout;
    this.activeLoadoutIds = [...nextLoadout];
    this.emit();
    return true;
  }

  startBattle() {
    if (this.phase !== "loadout") {
      return false;
    }
    if (this.activeLoadoutIds.length !== prototypeCatalog.loadouts.leader_spellbook.slotCount) {
      return false;
    }

    this.phase = "battle";
    this.positionPartyForBattle();
    this.spawnWave();
    this.emit();
    return true;
  }

  setSelectedTarget(targetUnitId: string | null) {
    this.selectedTargetId = targetUnitId && this.unitsById.has(targetUnitId) ? targetUnitId : null;
    this.emit();
  }

  applyDamage(targetUnitId: string, baseAmount: number, sourceUnitId: string | null = null) {
    const target = this.unitsById.get(targetUnitId);
    if (!target || target.isDead) {
      return;
    }
    if (target.faction === "leader_party" && this.debugFlags.godMode) {
      return;
    }

    let amount = Math.max(1, Math.round(baseAmount - prototypeCatalog.units[target.definitionId].stats.defense * 0.35));
    const shieldStatus = target.statuses.find((status) => status.id === "shielded");
    if (shieldStatus && shieldStatus.magnitude > 0) {
      const absorbed = Math.min(amount, shieldStatus.magnitude);
      shieldStatus.magnitude -= absorbed;
      amount -= absorbed;
    }

    if (amount <= 0) {
      return;
    }

    target.currentHp = clamp(target.currentHp - amount, 0, prototypeCatalog.units[target.definitionId].stats.maxHp);
    target.lastDamagedByUnitId = sourceUnitId;
    this.floatingTexts.push(this.makeFloatingText(`-${amount}`, "damage", target.position));

    if (target.currentHp <= 0) {
      this.handleUnitAtZeroHp(target);
    }

    this.emit();
  }

  applyHeal(targetUnitId: string, amount: number) {
    const target = this.unitsById.get(targetUnitId);
    if (!target || target.isDead) {
      return;
    }

    const maxHp = prototypeCatalog.units[target.definitionId].stats.maxHp;
    target.currentHp = clamp(target.currentHp + amount, 0, maxHp);
    this.floatingTexts.push(this.makeFloatingText(`+${amount}`, "heal", target.position));
    this.emit();
  }

  applyShield(targetUnitId: string, amount: number, durationMs = 4500) {
    const target = this.unitsById.get(targetUnitId);
    if (!target || target.isDead) {
      return;
    }

    this.upsertStatus(target, "shielded", amount, durationMs, this.leaderId);
    this.floatingTexts.push(this.makeFloatingText("Shielded", "status", target.position));
    this.emit();
  }

  applyStatus(targetUnitId: string, statusId: StatusId, magnitude: number, durationMs: number, sourceUnitId: string | null) {
    const target = this.unitsById.get(targetUnitId);
    if (!target || target.isDead) {
      return;
    }

    this.upsertStatus(target, statusId, magnitude, durationMs, sourceUnitId);
    this.floatingTexts.push(this.makeFloatingText(prototypeCatalog.statuses[statusId].name, "status", target.position));
    this.emit();
  }

  reviveUnit(targetUnitId: string) {
    const target = this.unitsById.get(targetUnitId);
    if (!target || !target.isDowned || target.isDead) {
      return false;
    }

    target.isDowned = false;
    target.bleedOutMs = null;
    target.reviveProgressMs = 0;
    target.currentHp = Math.round(prototypeCatalog.units[target.definitionId].stats.maxHp * 0.45);
    target.currentResource = Math.round(prototypeCatalog.units[target.definitionId].stats.maxResource * 0.35);
    target.statuses = target.statuses.filter((status) => status.id !== "downed" && status.id !== "reviving");
    this.floatingTexts.push(this.makeFloatingText("Revived", "status", target.position));
    this.emit();
    return true;
  }

  issueOrderToCompanions(orderId: OrderId, anchor = arenaDefinition.defendPoint, targetUnitId: string | null = null) {
    this.recruitedCompanionIds.forEach((unitId) => {
      const unit = this.unitsById.get(unitId);
      if (!unit) {
        return;
      }
      unit.order = {
        orderId,
        anchor,
        targetUnitId,
        issuedAtMs: this.timeMs,
      };
      unit.aiState.anchorPoint = anchor;
      unit.aiState.focusUnitId = targetUnitId;
      unit.aiState.stateLabel = prototypeCatalog.orders[orderId].name;
    });
    this.emit();
  }

  updateBehaviorProfile(unitId: string, profileId: BehaviorProfileId) {
    const unit = this.unitsById.get(unitId);
    if (!unit) {
      return false;
    }
    unit.behavior = this.createBehaviorSettings(profileId);
    this.emit();
    return true;
  }

  assignCustomGroup(unitId: string, groupId: RuntimeBehaviorSettings["customGroup"]) {
    const unit = this.unitsById.get(unitId);
    if (!unit) {
      return false;
    }
    unit.customGroup = groupId;
    unit.behavior.customGroup = groupId;
    this.emit();
    return true;
  }

  grantXp(amount: number) {
    this.totalXp += amount;
    const requiredXp = this.level * LEVEL_XP_STEP;
    if (this.totalXp >= requiredXp && !this.rewardChoices.pendingSelection) {
      this.level += 1;
      this.rewardChoices = {
        choices: this.pickRewardChoices(),
        pendingSelection: true,
      };
      this.phase = "reward";
      this.floatingTexts.push(this.makeFloatingText("Reward ready", "reward", arenaDefinition.playerStart));
    }
    this.emit();
  }

  chooseReward(rewardId: RewardId) {
    if (!this.rewardChoices.pendingSelection || !this.rewardChoices.choices.includes(rewardId)) {
      return false;
    }

    this.appliedRewards = [...this.appliedRewards, rewardId];
    this.rewardChoices = { choices: [], pendingSelection: false };
    this.phase = "victory";
    this.floatingTexts.push(this.makeFloatingText(prototypeCatalog.rewards[rewardId].name, "reward", arenaDefinition.playerStart));
    this.emit();
    return true;
  }

  toggleDebugFlag(flag: DebugFlag) {
    this.debugFlags = {
      ...this.debugFlags,
      [flag]: !this.debugFlags[flag],
    };
    this.emit();
  }

  advanceTime(ms: number) {
    const steps = Math.max(1, Math.ceil(ms / 50));
    const stepMs = ms / steps;
    for (let index = 0; index < steps; index += 1) {
      this.tick(stepMs);
    }
    this.emit();
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private tick(deltaMs: number) {
    this.timeMs += deltaMs;
    this.tickFloatingTexts(deltaMs);
    this.tickUnits(deltaMs);

    if (this.phase === "battle") {
      this.evaluateEndStates();
    }
  }

  private tickUnits(deltaMs: number) {
    this.unitsById.forEach((unit) => {
      if (unit.isDead) {
        return;
      }

      unit.basicCooldownMs = Math.max(0, unit.basicCooldownMs - deltaMs);
      Object.keys(unit.spellCooldowns).forEach((spellId) => {
        const current = unit.spellCooldowns[spellId as SpellId] ?? 0;
        unit.spellCooldowns[spellId as SpellId] = Math.max(0, current - deltaMs);
      });

      if (!unit.isDowned) {
        const maxResource = prototypeCatalog.units[unit.definitionId].stats.maxResource;
        unit.currentResource = clamp(
          unit.currentResource + RESOURCE_REGEN_PER_SECOND * (deltaMs / 1000),
          0,
          maxResource,
        );
      }

      unit.statuses = unit.statuses
        .map((status) => ({
          ...status,
          remainingMs: status.remainingMs - deltaMs,
        }))
        .filter((status) => status.remainingMs > 0.001 && (status.id !== "shielded" || status.magnitude > 0.001));

      if (unit.isDowned && unit.bleedOutMs !== null) {
        unit.bleedOutMs = Math.max(0, unit.bleedOutMs - deltaMs);
        if (unit.bleedOutMs <= 0) {
          unit.isDead = true;
          unit.isDowned = false;
        }
      }

      if (unit.castState) {
        unit.castState.elapsedMs += deltaMs;
      }
    });
  }

  private evaluateEndStates() {
    const leader = this.unitsById.get(this.leaderId);
    if (!leader || leader.isDead) {
      this.phase = "defeat";
      return;
    }

    const livingEnemies = [...this.unitsById.values()].filter((unit) => unit.faction === "enemy" && !unit.isDead);
    if (livingEnemies.length === 0) {
      this.phase = "victory";
      const rewardXp = [...this.unitsById.values()]
        .filter((unit) => unit.faction === "enemy")
        .reduce((sum, unit) => sum + unit.xpValue, 0);
      if (rewardXp > 0) {
        this.grantXp(rewardXp);
      }
    }
  }

  private tickFloatingTexts(deltaMs: number) {
    this.floatingTexts = this.floatingTexts
      .map((entry) => ({
        ...entry,
        remainingMs: entry.remainingMs - deltaMs,
        position: { ...entry.position, y: entry.position.y + deltaMs * 0.0008 },
      }))
      .filter((entry) => entry.remainingMs > 0);
  }

  private createUnit(definitionId: UnitArchetypeId, position = vec3()): RuntimeUnit {
    const definition = prototypeCatalog.units[definitionId];
    const behavior = this.createBehaviorSettings(definition.behaviorProfileId);
    const unitId = `${definitionId}_${this.nextId()}`;
    const order = this.createOrderState("follow_me");

    return {
      id: unitId,
      definitionId,
      name: definition.name,
      faction: definition.faction,
      controller: definition.controller,
      group: definition.group,
      customGroup: null,
      position: { ...position },
      facingYaw: definition.faction === "enemy" ? Math.PI : 0,
      velocity: vec3(),
      currentHp: definition.stats.maxHp,
      currentResource: definition.stats.maxResource,
      weaponId: definition.weaponId,
      loadoutSpellIds: [...definition.defaultLoadoutIds],
      spellbookIds: [...definition.spellbookIds],
      spellCooldowns: {},
      basicCooldownMs: 0,
      targetUnitId: null,
      order,
      behavior,
      statuses: [],
      castState: null,
      aiState: {
        focusUnitId: null,
        anchorPoint: order.anchor,
        retreatPoint: arenaDefinition.retreatPoint,
        lastDecisionMs: 0,
        openerUsed: false,
        stateLabel: prototypeCatalog.orders.follow_me.name,
      },
      isDowned: false,
      isDead: false,
      bleedOutMs: null,
      reviveProgressMs: 0,
      xpValue: definition.xpValue,
      spawnRadius: definition.spawnRadius,
      lastDamagedByUnitId: null,
    };
  }

  private createBehaviorSettings(profileId: BehaviorProfileId): RuntimeBehaviorSettings {
    const profile = prototypeCatalog.behaviorProfiles[profileId];
    return {
      profileId,
      customGroup: null,
      healThresholdPct: profile.healThresholdPct,
      retreatThresholdPct: profile.retreatThresholdPct,
      openerSpellId: profile.openerSpellId ?? null,
      rotationSpellIds: [...profile.rotationSpellIds],
      focusMarkedTarget: profile.focusMarkedTarget,
      supportAllies: profile.supportAllies,
    };
  }

  private createOrderState(orderId: OrderId, anchor: CombatSnapshot["arena"]["defendPoint"] | null = null): RuntimeOrderState {
    return {
      orderId,
      anchor,
      targetUnitId: null,
      issuedAtMs: this.timeMs,
    };
  }

  private handleUnitAtZeroHp(unit: RuntimeUnit) {
    const definition = prototypeCatalog.units[unit.definitionId];
    if (definition.reviveable) {
      unit.isDowned = true;
      unit.bleedOutMs = DOWNED_BLEED_OUT_MS;
      unit.currentHp = 0;
      this.upsertStatus(unit, "downed", 1, DOWNED_BLEED_OUT_MS, unit.lastDamagedByUnitId);
      return;
    }

    unit.isDead = true;
    unit.currentHp = 0;
  }

  private upsertStatus(
    unit: RuntimeUnit,
    statusId: StatusId,
    magnitude: number,
    durationMs: number,
    sourceUnitId: string | null,
  ) {
    const existing = unit.statuses.find((status) => status.id === statusId);
    if (existing) {
      existing.remainingMs = Math.max(existing.remainingMs, durationMs);
      existing.magnitude = Math.max(existing.magnitude, magnitude);
      existing.sourceUnitId = sourceUnitId;
      return;
    }

    unit.statuses.push({
      id: statusId,
      sourceUnitId,
      remainingMs: durationMs,
      magnitude,
    });
  }

  private positionPartyForBattle() {
    const leader = this.unitsById.get(this.leaderId);
    if (leader) {
      leader.position = { ...arenaDefinition.playerStart };
      leader.loadoutSpellIds = [...this.activeLoadoutIds];
      leader.currentHp = prototypeCatalog.units[leader.definitionId].stats.maxHp;
      leader.currentResource = prototypeCatalog.units[leader.definitionId].stats.maxResource;
    }

    this.recruitedCompanionIds.forEach((unitId, index) => {
      const unit = this.unitsById.get(unitId);
      if (!unit) {
        return;
      }
      unit.position = { ...(arenaDefinition.companionSlots[index] ?? arenaDefinition.playerStart) };
      unit.currentHp = prototypeCatalog.units[unit.definitionId].stats.maxHp;
      unit.currentResource = prototypeCatalog.units[unit.definitionId].stats.maxResource;
      unit.isDead = false;
      unit.isDowned = false;
      unit.bleedOutMs = null;
      unit.statuses = [];
      unit.order.anchor = arenaDefinition.defendPoint;
      unit.aiState.anchorPoint = arenaDefinition.defendPoint;
    });
  }

  private spawnWave() {
    [...this.unitsById.values()]
      .filter((unit) => unit.faction === "enemy")
      .forEach((unit) => {
        this.unitsById.delete(unit.id);
      });

    const waveDefs: UnitArchetypeId[] = [
      "enemy_melee_chaser",
      "enemy_ranged_caster",
      "enemy_tank_disruptor",
      "enemy_melee_chaser",
      "enemy_ranged_caster",
    ];

    waveDefs.forEach((definitionId, index) => {
      const spawn = arenaDefinition.enemySpawnPoints[index] ?? arenaDefinition.enemySpawnPoints[0];
      const unit = this.createUnit(definitionId, spawn);
      unit.order = this.createOrderState("follow_me");
      unit.aiState.stateLabel = "Awaiting AI";
      this.unitsById.set(unit.id, unit);
    });
  }

  private pickRewardChoices(): RewardId[] {
    const available = Object.keys(prototypeCatalog.rewards) as RewardId[];
    return available
      .filter((rewardId) => !this.appliedRewards.includes(rewardId))
      .slice(0, 3);
  }

  private makeFloatingText(text: string, kind: FloatingText["kind"], position: FloatingText["position"]): FloatingText {
    return {
      id: `float_${this.nextId()}`,
      text,
      kind,
      position: { ...position, y: position.y + 1.8 },
      remainingMs: kind === "reward" ? 2200 : 1200,
    };
  }

  private nextId() {
    this.idCounter += 1;
    return this.idCounter.toString(36);
  }
}

export const createCombatAuthority = () => new CombatAuthority();

export const reviveChannelMs = REVIVE_CHANNEL_MS;
