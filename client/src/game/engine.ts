import { prototypeCatalog } from "@/game/content";
import type {
  BehaviorProfileId,
  OrderId,
  RewardId,
  RewardEffectDefinition,
  SpellId,
  StatBlock,
  StatusId,
  TargetingMode,
  UnitArchetypeId,
  Vec3,
} from "@/game/defs";
import { arenaDefinition } from "@/game/map";
import {
  addVec3,
  clamp,
  directionToYaw,
  distance2D,
  length2D,
  normalize2D,
  roundVec3,
  scaleVec3,
  subVec3,
  vec3,
  yawToDirection,
} from "@/game/math";
import type {
  CombatSnapshot,
  DebugFlag,
  FloatingText,
  RewardChoiceState,
  RuntimeBehaviorSettings,
  RuntimeCastState,
  RuntimeOrderState,
  RuntimeProjectile,
  RuntimeUnit,
  RuntimeZone,
} from "@/game/runtime";

type Listener = (snapshot: CombatSnapshot) => void;

const RESOURCE_REGEN_PER_SECOND = 7;
const DOWNED_BLEED_OUT_MS = 18000;
const REVIVE_CHANNEL_MS = 1500;
const LEVEL_XP_STEP = 100;
const AI_DECISION_INTERVAL_MS = 220;
const BASIC_ATTACK_BUFFER_MS = 120;

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
  private runBonuses: {
    leader: Partial<StatBlock>;
    companions: Partial<StatBlock>;
    allies: Partial<StatBlock>;
    spellUpgrades: Partial<Record<SpellId, { power: number; cooldownMs: number; resourceCost: number }>>;
  } = {
    leader: {},
    companions: {},
    allies: {},
    spellUpgrades: {},
  };
  private playerMoveIntent = vec3();
  private playerAimYaw = 0;
  private queuedBasicAttack = false;
  private activeReviveTargetId: string | null = null;

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
    this.runBonuses = {
      leader: {},
      companions: {},
      allies: {},
      spellUpgrades: {},
    };
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

  setPlayerIntent(moveInput: Vec3, aimYaw: number) {
    this.playerMoveIntent = { ...moveInput, y: 0 };
    this.playerAimYaw = aimYaw;
  }

  commandLeaderBasicAttack(targetUnitId = this.selectedTargetId) {
    const leader = this.unitsById.get(this.leaderId);
    if (!leader || !targetUnitId) {
      return false;
    }

    this.selectedTargetId = targetUnitId;
    leader.targetUnitId = targetUnitId;
    this.queuedBasicAttack = true;
    return true;
  }

  commandLeaderSpell(
    slotIndex: number,
    request: {
      targetUnitId?: string | null;
      targetPoint?: Vec3 | null;
      direction?: Vec3 | null;
    },
  ) {
    const leader = this.unitsById.get(this.leaderId);
    if (!leader) {
      return false;
    }

    const spellId = leader.loadoutSpellIds[slotIndex];
    if (!spellId) {
      return false;
    }

    return this.tryStartCast(leader, spellId, {
      targetUnitId: request.targetUnitId ?? null,
      targetPoint: request.targetPoint ?? null,
      direction: request.direction ?? null,
    });
  }

  commandRevive(targetUnitId: string) {
    const leader = this.unitsById.get(this.leaderId);
    const target = this.unitsById.get(targetUnitId);
    if (!leader || !target || !target.isDowned || target.isDead) {
      return false;
    }
    if (distance2D(leader.position, target.position) > 2.6) {
      return false;
    }

    this.activeReviveTargetId = targetUnitId;
    target.reviveProgressMs = 0;
    this.upsertStatus(target, "reviving", 1, REVIVE_CHANNEL_MS, leader.id);
    this.emit();
    return true;
  }

  applyDamage(targetUnitId: string, baseAmount: number, sourceUnitId: string | null = null) {
    const target = this.unitsById.get(targetUnitId);
    if (!target || target.isDead) {
      return;
    }
    if (target.faction === "leader_party" && this.debugFlags.godMode) {
      return;
    }

    let amount = Math.max(1, Math.round(baseAmount - this.getEffectiveStats(target).defense * 0.35));
    const shieldStatus = target.statuses.find((status) => status.id === "shielded");
    if (shieldStatus && shieldStatus.magnitude > 0) {
      const absorbed = Math.min(amount, shieldStatus.magnitude);
      shieldStatus.magnitude -= absorbed;
      amount -= absorbed;
    }

    if (amount <= 0) {
      return;
    }

    target.currentHp = clamp(target.currentHp - amount, 0, this.getEffectiveStats(target).maxHp);
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

    const maxHp = this.getEffectiveStats(target).maxHp;
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
    target.currentHp = Math.round(this.getEffectiveStats(target).maxHp * 0.45);
    target.currentResource = Math.round(this.getEffectiveStats(target).maxResource * 0.35);
    target.statuses = target.statuses.filter((status) => status.id !== "downed" && status.id !== "reviving");
    this.floatingTexts.push(this.makeFloatingText("Revived", "status", target.position));
    this.emit();
    return true;
  }

  issueOrderToCompanions(orderId: OrderId, anchor = arenaDefinition.defendPoint, targetUnitId: string | null = null) {
    this.issueScopedOrder(
      { mode: "all" },
      orderId,
      anchor,
      targetUnitId,
    );
  }

  issueScopedOrder(
    scope:
      | { mode: "all" }
      | { mode: "group"; group: Extract<RuntimeUnit["group"], "frontline" | "backline" | "support"> }
      | { mode: "custom"; group: NonNullable<RuntimeBehaviorSettings["customGroup"]> },
    orderId: OrderId,
    anchor = arenaDefinition.defendPoint,
    targetUnitId: string | null = null,
  ) {
    const scopedUnits = this.recruitedCompanionIds
      .map((unitId) => this.unitsById.get(unitId))
      .filter((unit): unit is RuntimeUnit => !!unit)
      .filter((unit) => {
        if (scope.mode === "all") {
          return true;
        }
        if (scope.mode === "group") {
          return unit.group === scope.group;
        }
        return unit.behavior.customGroup === scope.group;
      });

    scopedUnits.forEach((unit) => {
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

  updateBehaviorSettings(
    unitId: string,
    patch: Partial<
      Pick<
        RuntimeBehaviorSettings,
        "healThresholdPct" | "retreatThresholdPct" | "focusMarkedTarget" | "supportAllies"
      >
    >,
  ) {
    const unit = this.unitsById.get(unitId);
    if (!unit) {
      return false;
    }

    unit.behavior = {
      ...unit.behavior,
      ...patch,
    };
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

    this.applyRewardEffects(rewardId);
    this.appliedRewards = [...this.appliedRewards, rewardId];
    this.rewardChoices = { choices: [], pendingSelection: false };
    this.prepareReplay();
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
    this.tickProjectiles(deltaMs);
    this.tickZones(deltaMs);

    if (this.phase === "battle") {
      this.updateLeader(deltaMs);
      this.updateCompanionAi(deltaMs);
      this.updateEnemyAi(deltaMs);
      this.updateReviveChannel(deltaMs);
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
        const maxResource = this.getEffectiveStats(unit).maxResource;
        unit.currentResource = clamp(
          unit.currentResource + RESOURCE_REGEN_PER_SECOND * (deltaMs / 1000),
          0,
          maxResource,
        );
      } else {
        unit.velocity = vec3();
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
        const spell = this.getSpellDefinition(unit.castState.spellId);
        if (unit.castState.elapsedMs >= spell.castTimeMs) {
          this.resolveSpellCast(unit, unit.castState);
          unit.castState = null;
        }
      }

      if (unit.targetUnitId) {
        const target = this.unitsById.get(unit.targetUnitId);
        if (!target || target.isDead) {
          unit.targetUnitId = null;
        }
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

  private updateLeader(deltaMs: number) {
    const leader = this.unitsById.get(this.leaderId);
    if (!leader || leader.isDead || leader.isDowned) {
      return;
    }

    leader.facingYaw = this.playerAimYaw;
    const hasMoveIntent = length2D(this.playerMoveIntent) > 0.05;
    if (hasMoveIntent) {
      const worldMove = this.rotateInputByYaw(this.playerMoveIntent, this.playerAimYaw);
      this.moveUnitAlongDirection(leader, worldMove, deltaMs);
    } else {
      leader.velocity = vec3();
    }

    if (this.activeReviveTargetId) {
      const reviveTarget = this.unitsById.get(this.activeReviveTargetId);
      if (!reviveTarget || reviveTarget.isDead || !reviveTarget.isDowned) {
        this.activeReviveTargetId = null;
      }
    }

    if (this.queuedBasicAttack && leader.basicCooldownMs <= BASIC_ATTACK_BUFFER_MS) {
      this.queuedBasicAttack = false;
      if (leader.targetUnitId) {
        const target = this.unitsById.get(leader.targetUnitId);
        if (target && !target.isDead) {
          this.tryBasicAttack(leader, target);
        }
      }
    }
  }

  private updateCompanionAi(deltaMs: number) {
    this.recruitedCompanionIds.forEach((unitId) => {
      const unit = this.unitsById.get(unitId);
      if (!unit) {
        return;
      }
      this.tickAiUnit(unit, deltaMs);
    });
  }

  private updateEnemyAi(deltaMs: number) {
    this.unitsById.forEach((unit) => {
      if (unit.faction === "enemy") {
        this.tickAiUnit(unit, deltaMs);
      }
    });
  }

  private tickAiUnit(unit: RuntimeUnit, deltaMs: number) {
    if (unit.isDead || unit.isDowned || unit.castState) {
      return;
    }

    if (this.timeMs - unit.aiState.lastDecisionMs < AI_DECISION_INTERVAL_MS) {
      return;
    }
    unit.aiState.lastDecisionMs = this.timeMs;

    const hostileFaction = unit.faction === "leader_party" ? "enemy" : "leader_party";
    const enemies = this.getLivingUnits(hostileFaction);
    const allies = this.getLivingUnits(unit.faction);
    if (enemies.length === 0) {
      unit.velocity = vec3();
      unit.aiState.stateLabel = "No targets";
      return;
    }

    const shouldRetreat =
      unit.currentHp / this.getEffectiveStats(unit).maxHp <=
      unit.behavior.retreatThresholdPct;
    if (shouldRetreat) {
      const retreatPoint = unit.aiState.retreatPoint ?? arenaDefinition.retreatPoint;
      unit.aiState.stateLabel = "Retreating";
      this.moveUnitToPoint(unit, retreatPoint, deltaMs, 0.2);
      return;
    }

    if (
      unit.behavior.supportAllies &&
      unit.behavior.healThresholdPct > 0 &&
      this.tryHealingBehavior(unit, allies)
    ) {
      unit.aiState.stateLabel = "Healing";
      return;
    }

    let target =
      this.resolveOrderTarget(unit, enemies) ??
      (unit.behavior.focusMarkedTarget ? this.findMarkedTarget(enemies) : null) ??
      this.findWeakestUnit(enemies) ??
      enemies[0];

    unit.targetUnitId = target?.id ?? null;
    unit.aiState.focusUnitId = unit.targetUnitId;

    if (!target) {
      unit.aiState.stateLabel = "Idle";
      return;
    }

    if (!unit.aiState.openerUsed && unit.behavior.openerSpellId) {
      const openerStarted = this.tryStartCast(unit, unit.behavior.openerSpellId, {
        targetUnitId: target.id,
        targetPoint: target.position,
        direction: normalize2D(subVec3(target.position, unit.position)),
      });
      if (openerStarted) {
        unit.aiState.openerUsed = true;
        unit.aiState.stateLabel = `Casting ${prototypeCatalog.spells[unit.behavior.openerSpellId].name}`;
        return;
      }
    }

    for (const spellId of unit.behavior.rotationSpellIds) {
      if (
        this.tryStartCast(unit, spellId, {
          targetUnitId: target.id,
          targetPoint: target.position,
          direction: normalize2D(subVec3(target.position, unit.position)),
        })
      ) {
        unit.aiState.stateLabel = `Casting ${prototypeCatalog.spells[spellId].name}`;
        return;
      }
    }

    const basicAttacked = this.tryBasicAttack(unit, target);
    if (basicAttacked) {
      unit.aiState.stateLabel = "Basic attack";
      return;
    }

    const weapon = prototypeCatalog.weapons[unit.weaponId];
    const desiredDistance = unit.order.orderId === "retreat" ? 8 : weapon.preferredDistance;
    this.moveUnitToPoint(unit, target.position, deltaMs, desiredDistance);
    unit.aiState.stateLabel = `Pressing ${target.name}`;
  }

  private updateReviveChannel(deltaMs: number) {
    if (!this.activeReviveTargetId) {
      return;
    }

    const leader = this.unitsById.get(this.leaderId);
    const target = this.unitsById.get(this.activeReviveTargetId);
    if (!leader || !target || leader.isDead || target.isDead || !target.isDowned) {
      this.activeReviveTargetId = null;
      return;
    }

    if (distance2D(leader.position, target.position) > 2.8) {
      target.reviveProgressMs = 0;
      target.statuses = target.statuses.filter((status) => status.id !== "reviving");
      this.activeReviveTargetId = null;
      return;
    }

    target.reviveProgressMs += deltaMs;
    if (target.reviveProgressMs >= REVIVE_CHANNEL_MS) {
      this.reviveUnit(target.id);
      this.activeReviveTargetId = null;
    }
  }

  private tickProjectiles(deltaMs: number) {
    const nextProjectiles: RuntimeProjectile[] = [];

    this.projectiles.forEach((projectile) => {
      const currentProjectile = { ...projectile };
      if (projectile.targetUnitId) {
        const target = this.unitsById.get(projectile.targetUnitId);
        if (target && !target.isDead) {
          currentProjectile.direction = normalize2D(subVec3(target.position, currentProjectile.position));
        }
      }

      const movement = scaleVec3(currentProjectile.direction, currentProjectile.speed * (deltaMs / 1000));
      currentProjectile.position = addVec3(currentProjectile.position, movement);
      currentProjectile.remainingRange -= length2D(movement);

      const impactTarget =
        currentProjectile.targetUnitId &&
        this.unitsById.get(currentProjectile.targetUnitId) &&
        distance2D(
          currentProjectile.position,
          this.unitsById.get(currentProjectile.targetUnitId)!.position,
        ) <= 1;

      if (impactTarget) {
        const target = this.unitsById.get(currentProjectile.targetUnitId!);
        if (target && !target.isDead) {
          if (currentProjectile.spellId) {
            this.applySpellEffectsToUnit(currentProjectile.sourceUnitId, target, currentProjectile.spellId);
          } else if (currentProjectile.weaponId) {
            this.applyDamage(target.id, currentProjectile.power, currentProjectile.sourceUnitId);
          }
        }
        return;
      }

      if (currentProjectile.remainingRange > 0) {
        nextProjectiles.push(currentProjectile);
      }
    });

    this.projectiles = nextProjectiles;
  }

  private tickZones(deltaMs: number) {
    const nextZones: RuntimeZone[] = [];

    this.zones.forEach((zone) => {
      const currentZone = {
        ...zone,
        remainingMs: zone.remainingMs - deltaMs,
        tickAccumulatorMs: zone.tickAccumulatorMs + deltaMs,
      };

      if (currentZone.tickAccumulatorMs >= 350) {
        currentZone.tickAccumulatorMs = 0;
        const source = this.unitsById.get(zone.sourceUnitId);
        if (source) {
          this.applyZoneEffects(source, currentZone);
        }
      }

      if (currentZone.remainingMs > 0) {
        nextZones.push(currentZone);
      }
    });

    this.zones = nextZones;
  }

  private tryHealingBehavior(unit: RuntimeUnit, allies: RuntimeUnit[]) {
    const healTarget = allies
      .filter(
        (ally) =>
          !ally.isDead &&
          !ally.isDowned &&
          ally.currentHp / this.getEffectiveStats(ally).maxHp <=
            unit.behavior.healThresholdPct,
      )
      .sort((left, right) => left.currentHp - right.currentHp)[0];

    if (!healTarget) {
      return false;
    }

    return (
      this.tryStartCast(unit, "field_mend", {
        targetUnitId: healTarget.id,
        targetPoint: healTarget.position,
        direction: normalize2D(subVec3(healTarget.position, unit.position)),
      }) ||
      this.tryStartCast(unit, "bulwark_pulse", {
        targetUnitId: null,
        targetPoint: unit.position,
        direction: yawToDirection(unit.facingYaw),
      })
    );
  }

  private resolveOrderTarget(unit: RuntimeUnit, enemies: RuntimeUnit[]) {
    switch (unit.order.orderId) {
      case "attack_my_target":
        return enemies.find((enemy) => enemy.id === this.selectedTargetId) ?? null;
      case "focus_weakest":
        return this.findWeakestUnit(enemies);
      case "defend_area":
      case "hold_position": {
        const anchor = unit.order.anchor ?? unit.aiState.anchorPoint;
        if (!anchor) {
          return null;
        }
        return (
          enemies
            .filter((enemy) => distance2D(enemy.position, anchor) <= (unit.order.orderId === "hold_position" ? 6 : 8))
            .sort((left, right) => distance2D(left.position, anchor) - distance2D(right.position, anchor))[0] ??
          null
        );
      }
      default:
        return enemies
          .slice()
          .sort((left, right) => distance2D(left.position, unit.position) - distance2D(right.position, unit.position))[0];
    }
  }

  private findWeakestUnit(units: RuntimeUnit[]) {
    return units
      .filter((unit) => !unit.isDead)
      .slice()
      .sort((left, right) => left.currentHp - right.currentHp)[0] ?? null;
  }

  private findMarkedTarget(units: RuntimeUnit[]) {
    return units.find((unit) => unit.statuses.some((status) => status.id === "marked")) ?? null;
  }

  private getLivingUnits(faction: RuntimeUnit["faction"]) {
    return [...this.unitsById.values()].filter((unit) => unit.faction === faction && !unit.isDead);
  }

  private tryBasicAttack(attacker: RuntimeUnit, target: RuntimeUnit) {
    if (attacker.basicCooldownMs > 0 || attacker.castState || attacker.isDowned || attacker.isDead) {
      return false;
    }

    const weapon = prototypeCatalog.weapons[attacker.weaponId];
    const distance = distance2D(attacker.position, target.position);
    if (distance > weapon.range) {
      return false;
    }

    attacker.basicCooldownMs = this.debugFlags.noCooldowns ? 0 : weapon.cooldownMs;
    attacker.targetUnitId = target.id;
    attacker.facingYaw = directionToYaw(subVec3(target.position, attacker.position));

    if (weapon.projectileSpeed) {
      this.projectiles.push({
        id: `projectile_${this.nextId()}`,
        sourceUnitId: attacker.id,
        targetUnitId: target.id,
        spellId: null,
        weaponId: attacker.weaponId,
        position: { ...attacker.position, y: attacker.position.y + 1.4 },
        direction: normalize2D(subVec3(target.position, attacker.position)),
        speed: weapon.projectileSpeed,
        remainingRange: weapon.range + 1,
        power: this.calculateWeaponDamage(attacker, weapon.baseDamage, target),
        appliesStatusId: null,
        hitsFaction: target.faction,
      });
    } else {
      this.applyDamage(target.id, this.calculateWeaponDamage(attacker, weapon.baseDamage, target), attacker.id);
    }

    return true;
  }

  private tryStartCast(
    caster: RuntimeUnit,
    spellId: SpellId,
    request: {
      targetUnitId: string | null;
      targetPoint: Vec3 | null;
      direction: Vec3 | null;
    },
  ) {
    if (caster.castState || caster.isDead || caster.isDowned) {
      return false;
    }
    if (!caster.spellbookIds.includes(spellId)) {
      return false;
    }

    const spell = this.getSpellDefinition(spellId);
    const cooldownRemaining = caster.spellCooldowns[spellId] ?? 0;
    if (!this.debugFlags.noCooldowns && cooldownRemaining > 0) {
      return false;
    }
    if (!this.debugFlags.noCooldowns && caster.currentResource < spell.resourceCost) {
      return false;
    }
    if (!this.validateSpellRequest(caster, spell.targetingMode, request, spell.range)) {
      return false;
    }

    caster.castState = {
      spellId,
      elapsedMs: 0,
      targetUnitId: request.targetUnitId,
      targetPoint: request.targetPoint,
      direction: request.direction,
    };
    caster.spellCooldowns[spellId] = this.debugFlags.noCooldowns ? 0 : spell.cooldownMs;
    caster.currentResource = this.debugFlags.noCooldowns
      ? caster.currentResource
      : caster.currentResource - spell.resourceCost;

    if (request.targetUnitId) {
      const target = this.unitsById.get(request.targetUnitId);
      if (target) {
        caster.facingYaw = directionToYaw(subVec3(target.position, caster.position));
      }
    } else if (request.direction && length2D(request.direction) > 0.01) {
      caster.facingYaw = directionToYaw(request.direction);
    }

    return true;
  }

  private validateSpellRequest(
    caster: RuntimeUnit,
    targetingMode: TargetingMode,
    request: { targetUnitId: string | null; targetPoint: Vec3 | null; direction: Vec3 | null },
    range: number,
  ) {
    if (targetingMode === "self") {
      return true;
    }

    if (targetingMode === "ground") {
      return !!request.targetPoint && distance2D(caster.position, request.targetPoint) <= range;
    }

    if (targetingMode === "skillshot_line") {
      return !!request.direction || !!request.targetPoint;
    }

    if (!request.targetUnitId) {
      return false;
    }

    const target = this.unitsById.get(request.targetUnitId);
    if (!target || target.isDead) {
      return false;
    }
    if (distance2D(caster.position, target.position) > range) {
      return false;
    }

    const wantsAlly = targetingMode === "ally";
    return wantsAlly ? target.faction === caster.faction : target.faction !== caster.faction;
  }

  private resolveSpellCast(caster: RuntimeUnit, castState: RuntimeCastState) {
    const spell = this.getSpellDefinition(castState.spellId);
    if (spell.targetingMode === "self") {
      if (spell.areaShape === "circle" && spell.areaRadius) {
        this.applyAreaSpell(caster, spell.id, caster.position, spell.areaRadius, caster.faction);
      } else {
        this.applySpellEffectsToUnit(caster.id, caster, spell.id);
      }
      return;
    }

    if (spell.targetingMode === "ground" && castState.targetPoint) {
      this.applyAreaSpell(caster, spell.id, castState.targetPoint, spell.areaRadius ?? 0, caster.faction === "enemy" ? "leader_party" : "enemy");
      return;
    }

    if (spell.targetingMode === "skillshot_line") {
      const direction =
        castState.direction && length2D(castState.direction) > 0.01
          ? normalize2D(castState.direction)
          : yawToDirection(caster.facingYaw);
      this.applyLineSpell(caster, spell.id, direction, spell.lineLength ?? spell.range);
      return;
    }

    const target = castState.targetUnitId ? this.unitsById.get(castState.targetUnitId) : null;
    if (!target || target.isDead) {
      return;
    }

    if (spell.projectileSpeed) {
      this.projectiles.push({
        id: `projectile_${this.nextId()}`,
        sourceUnitId: caster.id,
        targetUnitId: target.id,
        spellId: spell.id,
        weaponId: null,
        position: { ...caster.position, y: caster.position.y + 1.5 },
        direction: normalize2D(subVec3(target.position, caster.position)),
        speed: spell.projectileSpeed,
        remainingRange: spell.range + 1,
        power: 0,
        appliesStatusId: null,
        hitsFaction: target.faction,
      });
      return;
    }

    this.applySpellEffectsToUnit(caster.id, target, spell.id);
  }

  private applySpellEffectsToUnit(sourceUnitId: string, target: RuntimeUnit, spellId: SpellId) {
    const source = this.unitsById.get(sourceUnitId);
    const spell = this.getSpellDefinition(spellId);
    spell.effects.forEach((effect) => {
      if (effect.type === "damage") {
        this.applyDamage(
          target.id,
          this.calculateSpellDamage(source ?? null, effect.power, target),
          sourceUnitId,
        );
      } else if (effect.type === "heal") {
        this.applyHeal(target.id, this.calculateHealing(source ?? null, effect.power));
      } else if (effect.type === "shield") {
        this.applyShield(target.id, this.calculateShielding(source ?? null, effect.power), effect.durationMs);
      } else if (effect.type === "slow" || effect.type === "mark" || effect.type === "taunt" || effect.type === "buff") {
        this.applyStatus(target.id, effect.statusId ?? "battle_focus", effect.power, effect.durationMs ?? 2500, sourceUnitId);
      } else if (effect.type === "knockback" && source) {
        const away = normalize2D(subVec3(target.position, source.position));
        target.position = this.resolvePosition(target, addVec3(target.position, scaleVec3(away, effect.power)));
      }
    });
  }

  private applyAreaSpell(
    source: RuntimeUnit,
    spellId: SpellId,
    center: Vec3,
    radius: number,
    affectedFaction: RuntimeUnit["faction"],
  ) {
    const spell = this.getSpellDefinition(spellId);
    const targets = this.getLivingUnits(affectedFaction).filter((unit) => distance2D(unit.position, center) <= radius);
    targets.forEach((target) => {
      this.applySpellEffectsToUnit(source.id, target, spellId);
    });

    if (spell.id === "steam_snare") {
      this.zones.push({
        id: `zone_${this.nextId()}`,
        sourceUnitId: source.id,
        spellId,
        center: { ...center },
        radius,
        remainingMs: 3200,
        tickAccumulatorMs: 0,
      });
    }
  }

  private applyLineSpell(source: RuntimeUnit, spellId: SpellId, direction: Vec3, length: number) {
    const directionNorm = normalize2D(direction);
    const hostileFaction = source.faction === "leader_party" ? "enemy" : "leader_party";
    this.getLivingUnits(hostileFaction).forEach((target) => {
      const relative = subVec3(target.position, source.position);
      const projection = relative.x * directionNorm.x + relative.z * directionNorm.z;
      const lateral = Math.abs(relative.x * -directionNorm.z + relative.z * directionNorm.x);
      if (projection >= 0 && projection <= length && lateral <= target.spawnRadius + 1) {
        this.applySpellEffectsToUnit(source.id, target, spellId);
      }
    });
  }

  private applyZoneEffects(source: RuntimeUnit, zone: RuntimeZone) {
    const hostileFaction = source.faction === "leader_party" ? "enemy" : "leader_party";
    this.getLivingUnits(hostileFaction)
      .filter((unit) => distance2D(unit.position, zone.center) <= zone.radius)
      .forEach((target) => {
        this.applySpellEffectsToUnit(source.id, target, zone.spellId);
      });
  }

  private moveUnitAlongDirection(unit: RuntimeUnit, direction: Vec3, deltaMs: number, speedScale = 1) {
    const normalized = normalize2D(direction);
    const slowMultiplier = unit.statuses.some((status) => status.id === "slowed") ? 0.65 : 1;
    const speed = this.getEffectiveStats(unit).moveSpeed * speedScale * slowMultiplier;
    const movement = scaleVec3(normalized, speed * (deltaMs / 1000));
    const nextPosition = addVec3(unit.position, movement);
    unit.position = this.resolvePosition(unit, nextPosition);
    unit.velocity = movement;
    if (length2D(normalized) > 0.01) {
      unit.facingYaw = directionToYaw(normalized);
    }
  }

  private moveUnitToPoint(unit: RuntimeUnit, targetPoint: Vec3, deltaMs: number, desiredDistance: number) {
    const delta = subVec3(targetPoint, unit.position);
    const distance = length2D(delta);
    if (distance <= desiredDistance + 0.1 && distance >= Math.max(0, desiredDistance - 0.6)) {
      unit.velocity = vec3();
      return;
    }

    const direction = distance > desiredDistance ? delta : scaleVec3(delta, -1);
    this.moveUnitAlongDirection(unit, direction, deltaMs);
  }

  private resolvePosition(unit: RuntimeUnit, rawPosition: Vec3) {
    const radius = unit.spawnRadius;
    const halfWidth = arenaDefinition.bounds.width / 2 - radius;
    const halfDepth = arenaDefinition.bounds.depth / 2 - radius;
    let position = {
      x: clamp(rawPosition.x, -halfWidth, halfWidth),
      y: 0,
      z: clamp(rawPosition.z, -halfDepth, halfDepth),
    };

    arenaDefinition.obstacles
      .filter((obstacle) => obstacle.blocksMovement)
      .forEach((obstacle) => {
        const halfX = obstacle.size.x / 2 + radius;
        const halfZ = obstacle.size.z / 2 + radius;
        const deltaX = position.x - obstacle.position.x;
        const deltaZ = position.z - obstacle.position.z;
        if (Math.abs(deltaX) < halfX && Math.abs(deltaZ) < halfZ) {
          const pushX = halfX - Math.abs(deltaX);
          const pushZ = halfZ - Math.abs(deltaZ);
          if (pushX < pushZ) {
            position = {
              ...position,
              x: obstacle.position.x + Math.sign(deltaX || 1) * halfX,
            };
          } else {
            position = {
              ...position,
              z: obstacle.position.z + Math.sign(deltaZ || 1) * halfZ,
            };
          }
        }
      });

    return position;
  }

  private rotateInputByYaw(moveInput: Vec3, yaw: number) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return vec3(moveInput.x * cos - moveInput.z * sin, 0, moveInput.x * sin + moveInput.z * cos);
  }

  private calculateWeaponDamage(attacker: RuntimeUnit, baseDamage: number, target: RuntimeUnit) {
    const markBonus = target.statuses.some((status) => status.id === "marked") ? 5 : 0;
    const focusBonus = attacker.statuses.some((status) => status.id === "battle_focus") ? 4 : 0;
    return baseDamage + this.getEffectiveStats(attacker).attackPower + markBonus + focusBonus;
  }

  private calculateSpellDamage(source: RuntimeUnit | null, baseDamage: number, target: RuntimeUnit) {
    const spellPower = source ? this.getEffectiveStats(source).spellPower : 0;
    const markBonus = target.statuses.some((status) => status.id === "marked") ? 6 : 0;
    return baseDamage + Math.round(spellPower * 0.65) + markBonus;
  }

  private calculateHealing(source: RuntimeUnit | null, baseValue: number) {
    const spellPower = source ? this.getEffectiveStats(source).spellPower : 0;
    return baseValue + Math.round(spellPower * 0.55);
  }

  private calculateShielding(source: RuntimeUnit | null, baseValue: number) {
    const spellPower = source ? this.getEffectiveStats(source).spellPower : 0;
    return baseValue + Math.round(spellPower * 0.45);
  }

  private getEffectiveStats(unit: RuntimeUnit) {
    const baseStats = prototypeCatalog.units[unit.definitionId].stats;
    const roleBonus = unit.id === this.leaderId ? this.runBonuses.leader : this.runBonuses.companions;
    const allBonus = this.runBonuses.allies;

    return {
      maxHp: baseStats.maxHp + (roleBonus.maxHp ?? 0) + (allBonus.maxHp ?? 0),
      maxResource: baseStats.maxResource + (roleBonus.maxResource ?? 0) + (allBonus.maxResource ?? 0),
      moveSpeed: baseStats.moveSpeed + (roleBonus.moveSpeed ?? 0) + (allBonus.moveSpeed ?? 0),
      attackPower: baseStats.attackPower + (roleBonus.attackPower ?? 0) + (allBonus.attackPower ?? 0),
      spellPower: baseStats.spellPower + (roleBonus.spellPower ?? 0) + (allBonus.spellPower ?? 0),
      defense: baseStats.defense + (roleBonus.defense ?? 0) + (allBonus.defense ?? 0),
      revivePower: baseStats.revivePower + (roleBonus.revivePower ?? 0) + (allBonus.revivePower ?? 0),
    };
  }

  private getSpellDefinition(spellId: SpellId) {
    const spell = prototypeCatalog.spells[spellId];
    const upgrade = this.runBonuses.spellUpgrades[spellId];
    if (!upgrade) {
      return spell;
    }

    return {
      ...spell,
      cooldownMs: Math.max(250, spell.cooldownMs - (upgrade.cooldownMs ?? 0)),
      resourceCost: Math.max(0, spell.resourceCost + (upgrade.resourceCost ?? 0)),
      effects: spell.effects.map((effect) => ({
        ...effect,
        power: effect.power + (upgrade.power ?? 0),
      })),
    };
  }

  private applyRewardEffects(rewardId: RewardId) {
    const reward = prototypeCatalog.rewards[rewardId];
    reward.effects.forEach((effect) => {
      this.applyRewardEffect(effect);
    });
  }

  private applyRewardEffect(effect: RewardEffectDefinition) {
    if (effect.type === "spell_upgrade" && effect.spellId && effect.upgradeKey) {
      const entry = this.runBonuses.spellUpgrades[effect.spellId] ?? {
        power: 0,
        cooldownMs: 0,
        resourceCost: 0,
      };
      entry[effect.upgradeKey] += effect.value;
      this.runBonuses.spellUpgrades[effect.spellId] = entry;
      return;
    }

    const targetKey =
      effect.target === "leader" ? "leader" : effect.target === "companions" ? "companions" : "allies";
    if (!effect.stat) {
      return;
    }
    this.runBonuses[targetKey][effect.stat] = (this.runBonuses[targetKey][effect.stat] ?? 0) + effect.value;
  }

  private prepareReplay() {
    this.phase = "loadout";
    this.selectedTargetId = null;
    this.projectiles = [];
    this.zones = [];
    this.floatingTexts = [];
    [...this.unitsById.values()]
      .filter((unit) => unit.faction === "enemy")
      .forEach((unit) => this.unitsById.delete(unit.id));
    this.positionPartyForBattle();
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
      leader.currentHp = this.getEffectiveStats(leader).maxHp;
      leader.currentResource = this.getEffectiveStats(leader).maxResource;
    }

    this.recruitedCompanionIds.forEach((unitId, index) => {
      const unit = this.unitsById.get(unitId);
      if (!unit) {
        return;
      }
      unit.position = { ...(arenaDefinition.companionSlots[index] ?? arenaDefinition.playerStart) };
      unit.currentHp = this.getEffectiveStats(unit).maxHp;
      unit.currentResource = this.getEffectiveStats(unit).maxResource;
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
