import { Canvas } from "@react-three/fiber";
import { Float, Grid, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { featureFlags } from "@/config/featureFlags";
import { assetAudit } from "@/game/assetAudit";
import { catalogSummary, prototypeCatalog } from "@/game/content";
import { createCombatAuthority, reviveChannelMs } from "@/game/engine";
import type { CombatSnapshot } from "@/game/runtime";

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
    leader: leader
      ? {
          hp: Math.round(leader.currentHp),
          resource: Math.round(leader.currentResource),
          loadout: [...leader.loadoutSpellIds],
        }
      : null,
    selectedTargetId: snapshot.selectedTargetId,
    livingEnemies: livingEnemies.length,
    companions: companions.map((unit) => ({
      id: unit.id,
      name: unit.name,
      hp: Math.round(unit.currentHp),
      downed: unit.isDowned,
      dead: unit.isDead,
      order: unit.order.orderId,
      behavior: unit.behavior.profileId,
    })),
    rewardsPending: snapshot.rewardChoices.pendingSelection,
    rewardChoices: snapshot.rewardChoices.choices,
    catalogSummary,
  };
};

function App() {
  const authorityRef = useRef(createCombatAuthority());
  const authority = authorityRef.current;
  const [snapshot, setSnapshot] = useState(() => authority.getSnapshot());

  useEffect(() => {
    return authority.subscribe(setSnapshot);
  }, [authority]);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();

    const tick = (now: number) => {
      const deltaMs = Math.min(50, now - previousTime);
      previousTime = now;
      authority.advanceTime(deltaMs);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [authority]);

  useEffect(() => {
    const renderGameToText = () =>
      JSON.stringify({
        featureFlags,
        assetAudit,
        ...summarizeSnapshot(authority.getSnapshot()),
      });

    const advanceTime = (ms: number) => authority.advanceTime(ms);

    Object.assign(window, {
      render_game_to_text: renderGameToText,
      advanceTime,
    });

    return () => {
      delete (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
      delete (window as Window & { advanceTime?: (ms: number) => void }).advanceTime;
    };
  }, [authority]);

  const leader = snapshot.units.find((unit) => unit.id === snapshot.leaderId) ?? null;
  const selectedTarget =
    snapshot.units.find((unit) => unit.id === snapshot.selectedTargetId) ?? null;
  const recruitOptions = snapshot.recruitableCompanions.map((definitionId) => prototypeCatalog.units[definitionId]);
  const loadoutNames = snapshot.activeLoadoutIds.map((spellId) => prototypeCatalog.spells[spellId].name);
  const orderedUnits = [...snapshot.units].sort((left, right) => {
    if (left.id === snapshot.leaderId) {
      return -1;
    }
    if (right.id === snapshot.leaderId) {
      return 1;
    }
    if (left.faction !== right.faction) {
      return left.faction === "leader_party" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

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
              <strong>{snapshot.phase}</strong>
            </li>
            <li>
              <span>Wave</span>
              <strong>{snapshot.waveNumber}</strong>
            </li>
            <li>
              <span>XP / level</span>
              <strong>
                {snapshot.totalXp} / {snapshot.level}
              </strong>
            </li>
            <li>
              <span>Leader HP / resource</span>
              <strong>
                {leader ? `${Math.round(leader.currentHp)} / ${Math.round(leader.currentResource)}` : "n/a"}
              </strong>
            </li>
            <li>
              <span>Selected target</span>
              <strong>{selectedTarget?.name ?? "none"}</strong>
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
          <ul>
            {loadoutNames.map((name) => (
              <li key={name}>
                <span>{name}</span>
                <strong>equipped</strong>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Recruit</h2>
          <div className="button-grid">
            {recruitOptions.map((unit) => (
              <button
                key={unit.id}
                className="action-button"
                onClick={() => {
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
          <div className="button-grid">
            <button
              className="action-button"
              onClick={() => {
                authority.startBattle();
              }}
            >
              Start battle
            </button>
            <button
              className="action-button"
              onClick={() => {
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
                  authority.applyDamage(selectedTarget.id, 20, snapshot.leaderId);
                }
              }}
            >
              Damage target
            </button>
            <button
              className="action-button"
              onClick={() => {
                authority.applyShield(snapshot.leaderId, 24);
              }}
            >
              Shield leader
            </button>
            <button
              className="action-button"
              onClick={() => {
                authority.grantXp(100);
              }}
            >
              Grant XP
            </button>
            <button
              className="action-button"
              onClick={() => {
                authority.resetEncounter();
              }}
            >
              Reset
            </button>
          </div>
        </section>

        {snapshot.rewardChoices.pendingSelection ? (
          <section>
            <h2>Reward choices</h2>
            <div className="button-grid">
              {snapshot.rewardChoices.choices.map((rewardId) => (
                <button
                  key={rewardId}
                  className="action-button"
                  onClick={() => {
                    authority.chooseReward(rewardId);
                  }}
                >
                  {prototypeCatalog.rewards[rewardId].name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2>Units</h2>
          <ul className="unit-list">
            {orderedUnits.map((unit) => (
              <li key={unit.id}>
                <button
                  className="unit-button"
                  onClick={() => {
                    authority.setSelectedTarget(unit.id === snapshot.selectedTargetId ? null : unit.id);
                  }}
                >
                  <span>
                    {unit.name}
                    {unit.id === snapshot.leaderId ? " (Leader)" : ""}
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

      <main className="viewport-shell">
        <Canvas
          camera={{ position: [0, 7, 12], fov: 42 }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 1.5, 0);
          }}
        >
          <color attach="background" args={["#e6dcc6"]} />
          <ambientLight intensity={1.3} />
          <directionalLight castShadow intensity={2.4} position={[12, 20, 4]} />
          <gridHelper args={[40, 40, "#786654", "#bca37c"]} />
          <Grid
            args={[40, 40]}
            cellColor="#967958"
            sectionColor="#c5a77b"
            fadeDistance={45}
            fadeStrength={1}
            infiniteGrid={false}
          />
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#bfa07a" />
          </mesh>
          <mesh castShadow position={[-3.2, 1.4, 0]}>
            <boxGeometry args={[2.2, 2.8, 2.2]} />
            <meshStandardMaterial color="#76523b" />
          </mesh>
          <mesh castShadow position={[3.2, 1.7, -1.5]}>
            <cylinderGeometry args={[1.2, 1.6, 3.4, 16]} />
            <meshStandardMaterial color="#4d6579" />
          </mesh>
          <Float speed={1.8} rotationIntensity={0.3} floatIntensity={0.5}>
            <mesh castShadow position={[0, 2.8, 0]}>
              <cylinderGeometry args={[0.6, 0.85, 2.5, 12]} />
              <meshStandardMaterial color="#30495d" />
            </mesh>
          </Float>
          <Text
            color="#382717"
            fontSize={0.58}
            maxWidth={5}
            position={[0, 5.45, 0]}
            textAlign="center"
          >
            {snapshot.phase === "battle" ? "Authority ticking" : "Authority staged"}
          </Text>
          <OrbitControls enablePan={false} minDistance={7} maxDistance={18} target={[0, 1.5, 0]} />
        </Canvas>
      </main>
    </div>
  );
}

export default App;
