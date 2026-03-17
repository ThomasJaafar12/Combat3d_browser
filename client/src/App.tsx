import { Canvas } from "@react-three/fiber";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { CombatScene, type GroundPreviewState, type ScenePerformanceSample } from "@/components/CombatScene";
import { CombatHUD } from "@/components/HUD/CombatHUD";
import { featureFlags } from "@/config/featureFlags";
import { preloadPresentationAssets } from "@/game/assets/loader";
import { createCombatAudioSystem } from "@/game/audio/audioSystem";
import { assetAudit } from "@/game/assetAudit";
import { catalogSummary, prototypeCatalog } from "@/game/content";
import { createCombatAuthority, reviveChannelMs } from "@/game/engine";
import type { RewardId, SpellId } from "@/game/defs";
import {
  type GroundTargetOrderId,
  type OrderTargetingState,
  orderTargetingHotkeys,
} from "@/game/input/orderTargeting";
import { normalize2D, subVec3, vec3, yawToDirection } from "@/game/math";
import type { CombatSnapshot } from "@/game/runtime";

type MovementDirection = "forward" | "backward" | "left" | "right";

const resolveMovementDirection = (event: KeyboardEvent): MovementDirection | null => {
  const key = event.key.toLowerCase();
  if (event.code === "KeyW" || event.code === "ArrowUp" || key === "w" || key === "z") {
    return "forward";
  }
  if (event.code === "KeyS" || event.code === "ArrowDown" || key === "s") {
    return "backward";
  }
  if (event.code === "KeyA" || event.code === "ArrowLeft" || key === "a" || key === "q") {
    return "left";
  }
  if (event.code === "KeyD" || event.code === "ArrowRight" || key === "d") {
    return "right";
  }
  return null;
};

const summarizeSnapshot = (snapshot: CombatSnapshot) => {
  const leader = snapshot.units.find((unit) => unit.id === snapshot.leaderId);
  const livingEnemies = snapshot.units.filter((unit) => unit.faction === "enemy" && !unit.isDead);
  const companions = snapshot.units.filter(
    (unit) => unit.faction === "leader_party" && unit.id !== snapshot.leaderId,
  );

  return {
    mode: snapshot.phase,
    phase: snapshot.phase,
    timeMs: Math.round(snapshot.timeMs),
    coordinateSystem: "Arena origin at center; +x is camera-right from spawn, +z points back toward the archway/player side.",
    leader: leader
      ? {
          hp: Math.round(leader.currentHp),
          resource: Math.round(leader.currentResource),
          loadout: [...leader.loadoutSpellIds],
          basicCooldownMs: Math.round(leader.basicCooldownMs),
          spellCooldowns: Object.fromEntries(
            leader.loadoutSpellIds.map((spellId) => [spellId, Math.round(leader.spellCooldowns[spellId] ?? 0)]),
          ),
          position: {
            x: Math.round(leader.position.x * 10) / 10,
            z: Math.round(leader.position.z * 10) / 10,
          },
        }
      : null,
    selectedTargetId: snapshot.selectedTargetId,
    livingEnemies: livingEnemies.length,
    companions: companions.map((unit) => ({
      id: unit.id,
      name: unit.name,
      position: { x: Math.round(unit.position.x * 10) / 10, z: Math.round(unit.position.z * 10) / 10 },
      hp: Math.round(unit.currentHp),
      downed: unit.isDowned,
      dead: unit.isDead,
      order: unit.order.orderId,
      orderAnchor: unit.order.anchor
        ? {
            x: Math.round(unit.order.anchor.x * 10) / 10,
            z: Math.round(unit.order.anchor.z * 10) / 10,
          }
        : null,
      behavior: unit.behavior.profileId,
    })),
    enemies: livingEnemies.map((unit) => ({
      id: unit.id,
      name: unit.name,
      position: { x: Math.round(unit.position.x * 10) / 10, z: Math.round(unit.position.z * 10) / 10 },
      hp: Math.round(unit.currentHp),
    })),
    zones: snapshot.zones.length,
    debugFlags: snapshot.debugFlags,
    rewardsPending: snapshot.rewardChoices.pendingSelection,
    rewardChoices: snapshot.rewardChoices.choices,
    catalogSummary,
  };
};

function App() {
  const simulationAccumulatorRef = useRef(0);
  const authorityRef = useRef(createCombatAuthority());
  const authority = authorityRef.current;
  const audioRef = useRef(createCombatAudioSystem());
  const viewportRef = useRef<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState(() => authority.getSnapshot());
  const snapshotRef = useRef(snapshot);
  const deferredSnapshot = useDeferredValue(snapshot);
  const snapshotCountRef = useRef(0);
  const [liveOps, setLiveOps] = useState<ScenePerformanceSample & { snapshotHz: number }>({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    units: 0,
    projectiles: 0,
    floatingTexts: 0,
    snapshotHz: 0,
  });
  const [armedSpellSlot, setArmedSpellSlot] = useState<number | null>(null);
  const armedSpellSlotRef = useRef<number | null>(null);
  const [groundHoverPoint, setGroundHoverPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [orderTargeting, setOrderTargeting] = useState<OrderTargetingState | null>(null);
  const [editingLoadoutSlot, setEditingLoadoutSlot] = useState(0);
  const [orderScope, setOrderScope] = useState<"all" | "frontline" | "backline" | "support" | "alpha" | "bravo">("all");
  const orderScopeRef = useRef(orderScope);
  const movementKeysRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });
  const cameraOrbitRef = useRef({
    yaw: Math.PI,
    pitch: 0.38,
    distance: 7.2,
    dragging: false,
    lastClientX: 0,
    lastClientY: 0,
  });

  useEffect(() => {
    return authority.subscribe((nextSnapshot) => {
      snapshotCountRef.current += 1;
      setSnapshot(nextSnapshot);
    });
  }, [authority]);

  useEffect(() => {
    preloadPresentationAssets().catch((error) => {
      console.error("Presentation asset preload failed", error);
    });
    audioRef.current.preload().catch((error) => {
      console.warn("Audio preload failed", error);
    });
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const leaderUnit = snapshot.units.find((unit) => unit.id === snapshot.leaderId);
    if (!leaderUnit) {
      return;
    }

    audioRef.current.updateListener(leaderUnit.position, cameraOrbitRef.current.yaw);
  }, [snapshot.leaderId, snapshot.units]);

  useEffect(() => {
    if (snapshot.phase === "loadout" || snapshot.phase === "battle") {
      viewportRef.current?.focus();
    }
  }, [snapshot.phase]);

  useEffect(() => {
    viewportRef.current?.focus();
  }, []);

  useEffect(() => {
    armedSpellSlotRef.current = armedSpellSlot;
  }, [armedSpellSlot]);

  useEffect(() => {
    orderScopeRef.current = orderScope;
  }, [orderScope]);

  useEffect(() => {
    setLiveOps((current) => ({
      ...current,
      units: snapshot.units.length,
      projectiles: snapshot.projectiles.length,
      floatingTexts: snapshot.floatingTexts.length,
    }));
  }, [snapshot.floatingTexts.length, snapshot.projectiles.length, snapshot.units.length]);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();
    let previousCount = snapshotCountRef.current;

    const sampleSnapshotRate = (now: number) => {
      const elapsedMs = now - previousTime;
      if (elapsedMs >= 500) {
        const emittedSnapshots = snapshotCountRef.current - previousCount;
        previousCount = snapshotCountRef.current;
        previousTime = now;
        setLiveOps((current) => ({
          ...current,
          snapshotHz: elapsedMs > 0 ? (emittedSnapshots * 1000) / elapsedMs : current.snapshotHz,
        }));
      }

      frameId = window.requestAnimationFrame(sampleSnapshotRate);
    };

    frameId = window.requestAnimationFrame(sampleSnapshotRate);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();
    const simulationStepMs = 1000 / 60;
    const maxCatchUpSteps = 4;

    const tick = (now: number) => {
      const deltaMs = Math.min(100, now - previousTime);
      previousTime = now;
      const input = movementKeysRef.current;
      const moveIntent = vec3(
        (input.left ? 1 : 0) - (input.right ? 1 : 0),
        0,
        (input.forward ? 1 : 0) - (input.backward ? 1 : 0),
      );
      authority.setPlayerIntent(moveIntent, cameraOrbitRef.current.yaw);
      simulationAccumulatorRef.current += deltaMs;

      let simulatedSteps = 0;
      while (
        simulationAccumulatorRef.current >= simulationStepMs &&
        simulatedSteps < maxCatchUpSteps
      ) {
        authority.advanceTime(simulationStepMs);
        simulationAccumulatorRef.current -= simulationStepMs;
        simulatedSteps += 1;
      }

      if (simulatedSteps === maxCatchUpSteps) {
        simulationAccumulatorRef.current = 0;
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [authority]);

  useEffect(() => {
    if (!snapshot.presentationEvents.length) {
      return;
    }

    snapshot.presentationEvents.forEach((event) => {
      if (event.kind === "basic_attack_hit") {
        audioRef.current.play({ cue: "basicAttackHit", position: event.position });
        return;
      }
      if (event.kind === "spell_cast") {
        audioRef.current.play({ cue: "spellCast", position: event.position });
        return;
      }
      if (event.kind === "spell_impact") {
        audioRef.current.play({ cue: "spellImpact", position: event.position });
        return;
      }
      if (event.kind === "unit_downed") {
        audioRef.current.play({ cue: "unitDowned", position: event.position });
        return;
      }
      if (event.kind === "revive_complete") {
        audioRef.current.play({ cue: "revive", position: event.position });
        return;
      }
      if (event.kind === "level_up") {
        audioRef.current.play({ cue: "levelUp" });
      }
    });
  }, [snapshot.presentationEvents]);

  useEffect(() => {
    const renderGameToText = () =>
      JSON.stringify({
        featureFlags,
        assetAudit,
        ...summarizeSnapshot(authority.getSnapshot()),
      });

    const advanceTime = (ms: number) => authority.advanceTime(ms);
    const combatDebug = {
      issueAreaOrder: (orderId: GroundTargetOrderId, point: { x: number; y: number; z: number }) => {
        const liveSnapshot = snapshotRef.current;
        const scope = orderScopeRef.current;
        if (scope === "all") {
          authority.issueScopedOrder({ mode: "all" }, orderId, point, liveSnapshot.selectedTargetId);
          return;
        }
        if (scope === "alpha" || scope === "bravo") {
          authority.issueScopedOrder({ mode: "custom", group: scope }, orderId, point, liveSnapshot.selectedTargetId);
          return;
        }
        authority.issueScopedOrder({ mode: "group", group: scope }, orderId, point, liveSnapshot.selectedTargetId);
      },
      castGroundSpell: (slotIndex: number, point: { x: number; y: number; z: number }) => {
        const liveSnapshot = snapshotRef.current;
        const leaderUnit = liveSnapshot.units.find((entry) => entry.id === liveSnapshot.leaderId);
        authority.commandLeaderSpell(slotIndex, {
          targetPoint: point,
          direction: leaderUnit
            ? normalize2D(subVec3(point, leaderUnit.position))
            : yawToDirection(cameraOrbitRef.current.yaw),
        });
      },
      reviveNearest: () => {
        const liveSnapshot = snapshotRef.current;
        const reviveTarget = liveSnapshot.units.find(
          (unit) =>
            unit.faction === "leader_party" &&
            unit.id !== liveSnapshot.leaderId &&
            unit.isDowned &&
            !unit.isDead,
        );
        if (reviveTarget) {
          authority.commandRevive(reviveTarget.id);
        }
      },
      chooseReward: (rewardId: RewardId) => {
        authority.chooseReward(rewardId);
      },
    };

    Object.assign(window, {
      render_game_to_text: renderGameToText,
      advanceTime,
      combat_debug: combatDebug,
    });

    return () => {
      delete (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
      delete (window as Window & { advanceTime?: (ms: number) => void }).advanceTime;
      delete (window as Window & { combat_debug?: unknown }).combat_debug;
    };
  }, [authority]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      void audioRef.current.unlock();
      const movementDirection = resolveMovementDirection(event);
      if (
        movementDirection ||
        event.code === "Space" ||
        event.code === "Escape" ||
        event.code === "KeyR" ||
        event.code === "Digit1" ||
        event.code === "Digit2" ||
        event.code === "Digit3" ||
        event.code in orderTargetingHotkeys
      ) {
        event.preventDefault();
      }

      if (movementDirection) {
        movementKeysRef.current[movementDirection] = true;
      }

      if (event.repeat) {
        return;
      }

      const liveSnapshot = snapshotRef.current;
      if (event.code === "Escape") {
        setArmedSpellSlot(null);
        setOrderTargeting(null);
        return;
      }

      const groundTargetOrderId = orderTargetingHotkeys[event.code];
      if (groundTargetOrderId) {
        setArmedSpellSlot(null);
        setOrderTargeting({ orderId: groundTargetOrderId });
        return;
      }

      if (event.code === "Digit1" || event.code === "Digit2" || event.code === "Digit3") {
        const slotIndex = Number(event.code.replace("Digit", "")) - 1;
        const spellId = liveSnapshot.activeLoadoutIds[slotIndex];
        if (!spellId) {
          return;
        }
        const spell = prototypeCatalog.spells[spellId];
        if (spell.targetingMode === "self") {
          authority.commandLeaderSpell(slotIndex, {
            targetPoint: liveSnapshot.units.find((unit) => unit.id === liveSnapshot.leaderId)?.position ?? vec3(),
            direction: yawToDirection(cameraOrbitRef.current.yaw),
          });
          setArmedSpellSlot(null);
        } else {
          setOrderTargeting(null);
          setArmedSpellSlot(slotIndex);
        }
        return;
      }

      if (event.code === "KeyR") {
        const leader = liveSnapshot.units.find((unit) => unit.id === liveSnapshot.leaderId);
        if (!leader) {
          return;
        }
        const reviveTarget = liveSnapshot.units.find(
          (unit) =>
            unit.faction === "leader_party" &&
            unit.id !== liveSnapshot.leaderId &&
            unit.isDowned &&
            !unit.isDead,
        );
        if (reviveTarget) {
          authority.commandRevive(reviveTarget.id);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const movementDirection = resolveMovementDirection(event);
      if (movementDirection) {
        event.preventDefault();
      }
      if (movementDirection) {
        movementKeysRef.current[movementDirection] = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [authority]);

  const leader = snapshot.units.find((unit) => unit.id === snapshot.leaderId) ?? null;
  const selectedTarget =
    snapshot.units.find((unit) => unit.id === snapshot.selectedTargetId) ?? null;
  const armedSpell = armedSpellSlot !== null ? prototypeCatalog.spells[snapshot.activeLoadoutIds[armedSpellSlot]] : null;
  const debugLeader = deferredSnapshot.units.find((unit) => unit.id === deferredSnapshot.leaderId) ?? null;
  const debugSelectedTarget =
    deferredSnapshot.units.find((unit) => unit.id === deferredSnapshot.selectedTargetId) ?? null;
  const recruitOptions = deferredSnapshot.recruitableCompanions.map((definitionId) => prototypeCatalog.units[definitionId]);
  const orderedUnits = [...deferredSnapshot.units].sort((left, right) => {
    if (left.id === deferredSnapshot.leaderId) {
      return -1;
    }
    if (right.id === deferredSnapshot.leaderId) {
      return 1;
    }
    if (left.faction !== right.faction) {
      return left.faction === "leader_party" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  const leaderSpellbook = deferredSnapshot.spellbookIds.map((spellId) => prototypeCatalog.spells[spellId]);
  const reviveIndicatorTargetId =
    leader
      ? snapshot.units.find(
          (unit) =>
            unit.faction === "leader_party" &&
            unit.id !== snapshot.leaderId &&
            unit.isDowned &&
            !unit.isDead &&
            Math.hypot(unit.position.x - leader.position.x, unit.position.z - leader.position.z) <= 2.6,
        )?.id ?? null
      : null;
  let groundPreview: GroundPreviewState | null = null;
  if (groundHoverPoint && orderTargeting) {
    groundPreview = {
      kind: "order",
      point: groundHoverPoint,
    };
  } else if (groundHoverPoint && armedSpell && armedSpell.targetingMode === "ground") {
    groundPreview = {
      kind: "spell",
      point: groundHoverPoint,
      radius: armedSpell.areaRadius,
      spellId: armedSpell.id,
    };
  }

  const aiStateSummary = deferredSnapshot.units
    .filter((unit) => unit.id !== deferredSnapshot.leaderId && !unit.isDead)
    .slice(0, 4)
    .map((unit) => ({
      id: unit.id,
      name: unit.name,
      stateLabel: unit.aiState.stateLabel,
    }));
  const leaderCooldownSummary = leader
    ? [
        { id: "basic", label: "Basic", seconds: leader.basicCooldownMs / 1000 },
        ...snapshot.activeLoadoutIds.map((spellId, index) => ({
          id: spellId,
          label: `${index + 1}`,
          seconds: (leader.spellCooldowns[spellId] ?? 0) / 1000,
        })),
      ]
    : [];

  const assignLoadoutSpell = (spellId: SpellId) => {
    const nextLoadout = [...snapshot.activeLoadoutIds];
    nextLoadout[editingLoadoutSlot] = spellId;
    if (new Set(nextLoadout).size !== nextLoadout.length) {
      return;
    }
    authority.setLeaderLoadout(nextLoadout);
  };

  const handleUnitClick = (unitId: string) => {
    const unit = snapshot.units.find((entry) => entry.id === unitId);
    if (!unit) {
      return;
    }

    const armedSlot = armedSpellSlotRef.current;
    if (armedSlot !== null) {
      const spellId = snapshot.activeLoadoutIds[armedSlot];
      const spell = spellId ? prototypeCatalog.spells[spellId] : null;
      if (!spell) {
        return;
      }
      if (spell.targetingMode === "enemy" || spell.targetingMode === "ally") {
        const leaderUnit = snapshot.units.find((entry) => entry.id === snapshot.leaderId);
        authority.commandLeaderSpell(armedSlot, {
          targetUnitId: unit.id,
          targetPoint: unit.position,
          direction: leaderUnit ? normalize2D(subVec3(unit.position, leaderUnit.position)) : vec3(),
        });
        setArmedSpellSlot(null);
      }
      return;
    }

    authority.setSelectedTarget(unit.id);
    if (unit.faction === "enemy") {
      authority.commandLeaderBasicAttack(unit.id);
    }
  };

  const handleGroundClick = (point: { x: number; y: number; z: number }) => {
    if (orderTargeting) {
      issueScopedOrder(orderTargeting.orderId, point);
      setOrderTargeting(null);
      return;
    }

    const armedSlot = armedSpellSlotRef.current;
    const leaderUnit = snapshot.units.find((entry) => entry.id === snapshot.leaderId);
    if (armedSlot !== null) {
      authority.commandLeaderSpell(armedSlot, {
        targetPoint: point,
        direction: leaderUnit ? normalize2D(subVec3(point, leaderUnit.position)) : yawToDirection(cameraOrbitRef.current.yaw),
      });
      setArmedSpellSlot(null);
      return;
    }

    authority.setSelectedTarget(null);
  };

  const issueScopedOrder = (
    orderId: "follow_me" | "focus_weakest" | "hold_position" | "attack_my_target" | "defend_area" | "retreat",
    anchor = leader?.position ?? snapshot.arena.defendPoint,
  ) => {
    if (orderScope === "all") {
      authority.issueScopedOrder({ mode: "all" }, orderId, anchor, snapshot.selectedTargetId);
      return;
    }
    if (orderScope === "alpha" || orderScope === "bravo") {
      authority.issueScopedOrder({ mode: "custom", group: orderScope }, orderId, anchor, snapshot.selectedTargetId);
      return;
    }
    authority.issueScopedOrder({ mode: "group", group: orderScope }, orderId, anchor, snapshot.selectedTargetId);
  };

  const beginOrderTargeting = (orderId: GroundTargetOrderId) => {
    audioRef.current.play({ cue: "uiConfirm" });
    setArmedSpellSlot(null);
    setOrderTargeting({ orderId });
  };

  const playUiConfirm = () => {
    audioRef.current.play({ cue: "uiConfirm" });
  };

  return (
    <div className="app-shell">
      <aside className="boot-panel">
        <p className="eyebrow">Commit 3 authority foundation</p>
        <h1>Combat Prototype V0</h1>
        <p>
          Combat state now lives behind an authority layer. The UI is still a debug-heavy shell,
          but leader state, recruit flow, battle start, reward gating, cooldown ticking, downed
          transitions, and combat resources are no longer static.
        </p>

        <section>
          <h2>Authority state</h2>
          <ul>
            <li>
              <span>Phase</span>
              <strong>{deferredSnapshot.phase}</strong>
            </li>
            <li>
              <span>Wave</span>
              <strong>{deferredSnapshot.waveNumber}</strong>
            </li>
            <li>
              <span>XP / level</span>
              <strong>
                {deferredSnapshot.totalXp} / {deferredSnapshot.level}
              </strong>
            </li>
            <li>
              <span>Leader HP / resource</span>
              <strong>
                {debugLeader ? `${Math.round(debugLeader.currentHp)} / ${Math.round(debugLeader.currentResource)}` : "n/a"}
              </strong>
            </li>
            <li>
              <span>Selected target</span>
              <strong>{debugSelectedTarget?.name ?? "none"}</strong>
            </li>
          </ul>
        </section>

        <section>
          <h2>Feature flags</h2>
          <ul>
            {Object.entries(featureFlags).map(([key, enabled]) => (
              <li key={key}>
                <span>{key}</span>
                <strong>{enabled ? "enabled" : "disabled"}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Shared content snapshot</h2>
          <ul>
            <li>Units: {catalogSummary.unitCount}</li>
            <li>Weapons: {catalogSummary.weaponCount}</li>
            <li>Spells: {catalogSummary.spellCount}</li>
            <li>Statuses: {catalogSummary.statusCount}</li>
            <li>Orders: {catalogSummary.orderCount}</li>
            <li>Rewards: {catalogSummary.rewardCount}</li>
          </ul>
        </section>

        <section>
          <h2>Loadout</h2>
          <p className="section-note">Leader spellbook has {catalogSummary.leaderSpellbookSlots} active slots.</p>
          <div className="button-grid">
            {deferredSnapshot.activeLoadoutIds.map((spellId, index) => (
              <button
                key={`${spellId}-${index}`}
                className="action-button"
                onClick={() => {
                  setEditingLoadoutSlot(index);
                }}
              >
                Slot {index + 1}: {prototypeCatalog.spells[spellId].name}
              </button>
            ))}
          </div>
          <p className="section-note">Editing slot {editingLoadoutSlot + 1}</p>
          <div className="button-grid">
            {leaderSpellbook.map((spell) => (
              <button
                key={spell.id}
                className="action-button"
                onClick={() => {
                  playUiConfirm();
                  assignLoadoutSpell(spell.id);
                }}
              >
                {spell.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Recruit</h2>
          <div className="button-grid">
            {recruitOptions.map((unit) => (
              <button
                key={unit.id}
                className="action-button"
                data-testid={`recruit-${unit.id}`}
                onClick={() => {
                  playUiConfirm();
                  authority.recruitCompanion(unit.id);
                }}
              >
                {unit.recruitmentLabel ?? unit.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Debug actions</h2>
          <p className="section-note">Order scope: {orderScope}</p>
          <div className="button-grid">
            {["all", "frontline", "backline", "support", "alpha", "bravo"].map((scope) => (
              <button
                key={scope}
                className="action-button"
                onClick={() => {
                  setOrderScope(scope as typeof orderScope);
                }}
              >
                {scope}
              </button>
            ))}
          </div>
          <div className="button-grid">
            <button
              className="action-button"
              id="start-battle"
              data-testid="start-battle"
              onClick={() => {
                playUiConfirm();
                authority.startBattle();
              }}
            >
              Start battle
            </button>
            <button
              className="action-button"
              data-testid="debug-order-follow"
              onClick={() => {
                playUiConfirm();
                issueScopedOrder("follow_me");
              }}
            >
              Order follow
            </button>
            <button
              className="action-button"
              data-testid="debug-order-weakest"
              onClick={() => {
                playUiConfirm();
                issueScopedOrder("focus_weakest");
              }}
            >
              Order weakest
            </button>
            <button
              className="action-button"
              id="debug-place-defend"
              data-testid="debug-place-defend"
              onClick={() => {
                beginOrderTargeting("defend_area");
              }}
            >
              Place defend
            </button>
            <button
              className="action-button"
              id="debug-place-hold"
              onClick={() => {
                beginOrderTargeting("hold_position");
              }}
            >
              Place hold
            </button>
            <button
              className="action-button"
              id="debug-place-retreat"
              onClick={() => {
                beginOrderTargeting("retreat");
              }}
            >
              Place retreat
            </button>
            <button
              className="action-button"
              onClick={() => {
                playUiConfirm();
                authority.applyDamage(snapshot.leaderId, 18, selectedTarget?.id ?? null);
              }}
            >
              Damage leader
            </button>
            <button
              className="action-button"
              disabled={!selectedTarget}
              onClick={() => {
                if (selectedTarget) {
                  playUiConfirm();
                  authority.applyDamage(selectedTarget.id, 20, snapshot.leaderId);
                }
              }}
            >
              Damage target
            </button>
            <button
              className="action-button"
              onClick={() => {
                playUiConfirm();
                authority.applyShield(snapshot.leaderId, 24);
              }}
            >
              Shield leader
            </button>
            <button
              className="action-button"
              onClick={() => {
                playUiConfirm();
                authority.grantXp(100);
              }}
            >
              Grant XP
            </button>
            <button
              className="action-button"
              onClick={() => {
                playUiConfirm();
                authority.resetEncounter();
              }}
            >
              Reset
            </button>
          </div>
        </section>

        {deferredSnapshot.rewardChoices.pendingSelection ? (
          <section>
            <h2>Reward choices</h2>
            <div className="button-grid">
              {deferredSnapshot.rewardChoices.choices.map((rewardId) => (
                <button
                  key={rewardId}
                  className="action-button"
                  data-testid={`reward-${rewardId}`}
                  onClick={() => {
                    playUiConfirm();
                    authority.chooseReward(rewardId);
                  }}
                >
                  {prototypeCatalog.rewards[rewardId].name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {deferredSnapshot.appliedRewards.length > 0 ? (
          <section>
            <h2>Applied rewards</h2>
            <ul>
              {deferredSnapshot.appliedRewards.map((rewardId) => (
                <li key={rewardId}>
                  <span>{prototypeCatalog.rewards[rewardId].name}</span>
                  <strong>active</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2>Behavior editor</h2>
          <div className="button-grid">
            {orderedUnits
              .filter((unit) => unit.faction === "leader_party" && unit.id !== deferredSnapshot.leaderId)
              .map((unit) => (
                <div key={unit.id} className="behavior-card">
                  <strong>{unit.name}</strong>
                  <span>
                    {unit.behavior.profileId} / {unit.behavior.customGroup ?? "no custom group"}
                  </span>
                  <div className="button-grid">
                    {(["aggressive", "defensive", "support"] as const).map((profileId) => (
                      <button
                        key={profileId}
                        className="action-button"
                        onClick={() => {
                          authority.updateBehaviorProfile(unit.id, profileId);
                        }}
                      >
                        {profileId}
                      </button>
                    ))}
                  </div>
                  <div className="button-grid">
                    {(["alpha", "bravo"] as const).map((groupId) => (
                      <button
                        key={groupId}
                        className="action-button"
                        onClick={() => {
                          authority.assignCustomGroup(
                            unit.id,
                            unit.behavior.customGroup === groupId ? null : groupId,
                          );
                        }}
                      >
                        {groupId}
                      </button>
                    ))}
                  </div>
                  <div className="button-grid">
                    <button
                      className="action-button"
                      onClick={() => {
                        authority.updateBehaviorSettings(unit.id, {
                          healThresholdPct: Math.min(0.85, unit.behavior.healThresholdPct + 0.05),
                        });
                      }}
                    >
                      Heal +5%
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        authority.updateBehaviorSettings(unit.id, {
                          healThresholdPct: Math.max(0.2, unit.behavior.healThresholdPct - 0.05),
                        });
                      }}
                    >
                      Heal -5%
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        authority.updateBehaviorSettings(unit.id, {
                          retreatThresholdPct: Math.min(0.6, unit.behavior.retreatThresholdPct + 0.05),
                        });
                      }}
                    >
                      Retreat +5%
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        authority.updateBehaviorSettings(unit.id, {
                          retreatThresholdPct: Math.max(0.1, unit.behavior.retreatThresholdPct - 0.05),
                        });
                      }}
                    >
                      Retreat -5%
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section>
          <h2>Units</h2>
          <ul className="unit-list">
            {orderedUnits.map((unit) => (
              <li key={unit.id}>
                <button
                  className="unit-button"
                  onClick={() => {
                    if (unit.id === deferredSnapshot.selectedTargetId) {
                      authority.setSelectedTarget(null);
                      return;
                    }
                    handleUnitClick(unit.id);
                  }}
                >
                  <span>
                    {unit.name}
                    {unit.id === deferredSnapshot.leaderId ? " (Leader)" : ""}
                  </span>
                  <strong>
                    {Math.round(unit.currentHp)} HP
                    {unit.isDowned ? " downed" : unit.isDead ? " dead" : ""}
                  </strong>
                </button>
              </li>
            ))}
          </ul>
          <p className="section-note">Revive channel target: {Math.round(reviveChannelMs / 1000)}s</p>
        </section>
      </aside>

      <main
        id="battlefield"
        ref={viewportRef}
        tabIndex={0}
        className="viewport-shell"
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onMouseDown={(event) => {
          void audioRef.current.unlock();
          viewportRef.current?.focus();
          if (event.button !== 2) {
            return;
          }
          cameraOrbitRef.current.dragging = true;
          cameraOrbitRef.current.lastClientX = event.clientX;
          cameraOrbitRef.current.lastClientY = event.clientY;
        }}
        onMouseMove={(event) => {
          if (!cameraOrbitRef.current.dragging) {
            return;
          }
          const deltaX = event.clientX - cameraOrbitRef.current.lastClientX;
          const deltaY = event.clientY - cameraOrbitRef.current.lastClientY;
          cameraOrbitRef.current.lastClientX = event.clientX;
          cameraOrbitRef.current.lastClientY = event.clientY;
          cameraOrbitRef.current.yaw -= deltaX * 0.008;
          cameraOrbitRef.current.pitch = Math.min(0.7, Math.max(0.2, cameraOrbitRef.current.pitch - deltaY * 0.0045));
        }}
        onMouseUp={() => {
          cameraOrbitRef.current.dragging = false;
        }}
        onMouseLeave={() => {
          cameraOrbitRef.current.dragging = false;
        }}
        onWheel={(event) => {
          event.preventDefault();
        }}
      >
        <Canvas
          camera={{ position: [0, 7, 12], fov: 42 }}
          shadows={false}
          dpr={[1, 1.5]}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
          }}
        >
          <CombatScene
            snapshot={snapshot}
            cameraOrbit={cameraOrbitRef.current}
            onGroundClick={handleGroundClick}
            onGroundHover={setGroundHoverPoint}
            onUnitClick={handleUnitClick}
            groundPreview={groundPreview}
            reviveIndicatorUnitId={reviveIndicatorTargetId}
            onPerformanceSample={(sample) => {
              setLiveOps((current) => ({
                ...current,
                ...sample,
              }));
            }}
          />
        </Canvas>
        <CombatHUD
          snapshot={snapshot}
          armedSpellSlot={armedSpellSlot}
          activeOrderTargeting={orderTargeting?.orderId ?? null}
          onSpellSlotClick={(index) => {
            playUiConfirm();
            const spellId = snapshot.activeLoadoutIds[index];
            const spell = spellId ? prototypeCatalog.spells[spellId] : null;
            if (!spell) {
              return;
            }
            if (spell.targetingMode === "self") {
              authority.commandLeaderSpell(index, {
                targetPoint: leader?.position ?? vec3(),
                direction: yawToDirection(cameraOrbitRef.current.yaw),
              });
              setArmedSpellSlot(null);
              return;
            }
            setOrderTargeting(null);
            setArmedSpellSlot(index);
          }}
          onChooseReward={(rewardId) => {
            playUiConfirm();
            authority.chooseReward(rewardId);
          }}
        />
        <div className="liveops-panel hud-card" aria-live="polite">
          <div className="liveops-header">
            <p className="hud-kicker">Live Ops</p>
            <strong>{liveOps.fps.toFixed(0)} FPS</strong>
          </div>
          <div className="liveops-grid">
            <span>Frame</span>
            <strong>{liveOps.frameMs.toFixed(1)} ms</strong>
            <span>Sim</span>
            <strong>{liveOps.snapshotHz.toFixed(0)} Hz</strong>
            <span>Draw calls</span>
            <strong>{liveOps.drawCalls}</strong>
            <span>Triangles</span>
            <strong>{liveOps.triangles.toLocaleString()}</strong>
            <span>Units</span>
            <strong>{liveOps.units}</strong>
            <span>FX</span>
            <strong>{liveOps.projectiles + liveOps.floatingTexts}</strong>
          </div>
        </div>
        {featureFlags.enableDebugTools ? (
          <div className="debug-overlay hud-card">
            <div className="liveops-header">
              <p className="hud-kicker">Debug</p>
              <strong>{snapshot.phase}</strong>
            </div>
            <div className="debug-toggle-grid">
              <button
                className={`debug-chip-button${snapshot.debugFlags.godMode ? " is-active" : ""}`}
                id="debug-toggle-god"
                onClick={() => {
                  playUiConfirm();
                  authority.toggleDebugFlag("godMode");
                }}
              >
                God mode
              </button>
              <button
                className={`debug-chip-button${snapshot.debugFlags.noCooldowns ? " is-active" : ""}`}
                id="debug-toggle-cooldowns"
                onClick={() => {
                  playUiConfirm();
                  authority.toggleDebugFlag("noCooldowns");
                }}
              >
                No cooldowns
              </button>
              <button
                className={`debug-chip-button${snapshot.debugFlags.showAi ? " is-active" : ""}`}
                id="debug-toggle-ai"
                onClick={() => {
                  playUiConfirm();
                  authority.toggleDebugFlag("showAi");
                }}
              >
                Show AI
              </button>
              <button
                className="debug-chip-button"
                id="debug-fast-forward"
                onClick={() => {
                  playUiConfirm();
                  authority.advanceTime(5000);
                }}
              >
                +5s
              </button>
            </div>
            <div className="debug-toggle-grid">
              <button
                className="debug-chip-button"
                id="debug-spawn-enemy"
                onClick={() => {
                  playUiConfirm();
                  authority.spawnDebugEnemy();
                }}
              >
                Spawn enemy
              </button>
              <button
                className="debug-chip-button"
                id="debug-spawn-companion"
                onClick={() => {
                  playUiConfirm();
                  authority.spawnDebugCompanion();
                }}
              >
                Spawn ally
              </button>
              <button
                className="debug-chip-button"
                id="debug-down-ally"
                onClick={() => {
                  playUiConfirm();
                  authority.downDebugCompanion();
                }}
              >
                Down ally
              </button>
              <button
                className="debug-chip-button"
                id="debug-clear-enemies"
                onClick={() => {
                  playUiConfirm();
                  authority.clearDebugEnemies();
                }}
              >
                Clear wave
              </button>
            </div>
            <div className="debug-readout">
              <span>Cooldowns</span>
              <strong>
                {leaderCooldownSummary.length > 0
                  ? leaderCooldownSummary
                      .map((entry) => `${entry.label} ${entry.seconds > 0.05 ? `${entry.seconds.toFixed(1)}s` : "ready"}`)
                      .join(" · ")
                  : "No leader"}
              </strong>
              <span>AI</span>
              <strong>
                {!snapshot.debugFlags.showAi
                  ? "Hidden"
                  : aiStateSummary.length > 0
                  ? aiStateSummary.map((entry) => `${entry.name}: ${entry.stateLabel}`).join(" | ")
                  : "No active AI units"}
              </strong>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
