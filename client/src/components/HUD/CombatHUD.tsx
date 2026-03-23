import { prototypeCatalog } from "@/game/content";
import { formatEquipmentStateSummary, resolveStanceFamily } from "@/game/equipment/system";
import type { GroundTargetOrderId } from "@/game/input/orderTargeting";
import type { CombatSnapshot } from "@/game/runtime";

interface CombatHUDProps {
  snapshot: CombatSnapshot;
  activeTab: "combat" | "setup" | "leader" | "companions" | "target" | "debug" | "attachment";
  armedSpellSlot: number | null;
  activeOrderTargeting: GroundTargetOrderId | null;
  onSpellSlotClick: (slotIndex: number) => void;
  onChooseReward: (rewardId: CombatSnapshot["rewardChoices"]["choices"][number]) => void;
}

const makePortraitLabel = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const makeOrderIcon = (orderId: string) => {
  switch (orderId) {
    case "follow_me":
      return "FLW";
    case "focus_weakest":
      return "FOC";
    case "hold_position":
      return "HLD";
    case "defend_area":
      return "DEF";
    case "retreat":
      return "RET";
    case "attack_my_target":
      return "ATK";
    default:
      return "ORD";
  }
};

const makeEquipmentLabel = (slotId: string) => {
  switch (slotId) {
    case "main_hand":
      return "Main";
    case "off_hand":
      return "Off";
    case "back":
      return "Back";
    case "hip_left":
      return "Hip L";
    case "hip_right":
      return "Hip R";
    default:
      return slotId;
  }
};

export function CombatHUD({
  snapshot,
  activeTab,
  armedSpellSlot,
  activeOrderTargeting,
  onSpellSlotClick,
  onChooseReward,
}: CombatHUDProps) {
  const leader = snapshot.units.find((unit) => unit.id === snapshot.leaderId) ?? null;
  const selectedTarget = snapshot.selectedTargetId
    ? snapshot.units.find((unit) => unit.id === snapshot.selectedTargetId) ?? null
    : null;
  const companions = snapshot.units.filter(
    (unit) => unit.faction === "leader_party" && unit.id !== snapshot.leaderId,
  );
  const leaderEquipment = leader ? formatEquipmentStateSummary(leader.equipmentState) : null;
  const leaderStance = leader
    ? resolveStanceFamily(leader.equipmentState, prototypeCatalog.weapons[leader.weaponId].kind)
    : "unarmed";
  const controlHint = activeOrderTargeting
    ? `Click ground to place ${prototypeCatalog.orders[activeOrderTargeting].name.toLowerCase()}.`
    : armedSpellSlot !== null
      ? `Spell armed: ${prototypeCatalog.spells[snapshot.activeLoadoutIds[armedSpellSlot]].name}.`
      : "Shift sprints. C toggles aim mode. E toggles equipment. Q/H/T place area orders. 1-3 arm spells. R revives nearby allies.";

  return (
    <>
      <div className="combat-hud combat-hud-top">
        {activeTab === "leader" && (
        <section className="hud-card leader-hud">
          <div className="hud-header">
            <div>
              <p className="hud-kicker">Leader</p>
              <h2>{leader?.name ?? "Iron Captain"}</h2>
            </div>
            <span className="hud-tag">Wave {snapshot.waveNumber}</span>
          </div>
          <div className="meter-stack">
            <div className="meter-row">
              <span>HP</span>
              <strong>{leader ? `${Math.round(leader.currentHp)} / ${prototypeCatalog.units[leader.definitionId].stats.maxHp}` : "n/a"}</strong>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill meter-fill-health"
                style={{
                  width: leader
                    ? `${Math.max(6, (leader.currentHp / prototypeCatalog.units[leader.definitionId].stats.maxHp) * 100)}%`
                    : "0%",
                }}
              />
            </div>
            <div className="meter-row">
              <span>Resource</span>
              <strong>{leader ? `${Math.round(leader.currentResource)} / ${prototypeCatalog.units[leader.definitionId].stats.maxResource}` : "n/a"}</strong>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill meter-fill-resource"
                style={{
                  width: leader
                    ? `${Math.max(6, (leader.currentResource / prototypeCatalog.units[leader.definitionId].stats.maxResource) * 100)}%`
                    : "0%",
                }}
              />
            </div>
          </div>
          <div className="leader-actions">
            <div className="hud-chip-card">
              <span>Basic</span>
              <strong>{leader ? prototypeCatalog.weapons[leader.weaponId].name : "Sword and Shield"}</strong>
            </div>
            <div className="hud-chip-card">
              <span>State</span>
              <strong>
                {activeOrderTargeting ? "Order targeting" : armedSpellSlot !== null ? "Spell armed" : leaderStance}
              </strong>
            </div>
            <div className="hud-chip-card">
              <span>Equipment</span>
              <strong>
                {leaderEquipment
                  ? [
                      ...leaderEquipment.active.map((entry) => {
                        const [slotId, label] = entry.split(": ");
                        return `${makeEquipmentLabel(slotId)} ${label}`;
                      }),
                      ...leaderEquipment.stored.map((entry) => {
                        const [slotId, label] = entry.split(": ");
                        return `${makeEquipmentLabel(slotId)} ${label}`;
                      }),
                    ].join(" / ") || "Unarmed"
                  : "n/a"}
              </strong>
            </div>
          </div>
        </section>
        )}

        {activeTab === "target" && (
        <section className="hud-card target-hud">
          <div className="hud-header">
            <div>
              <p className="hud-kicker">Target</p>
              <h2>{selectedTarget?.name ?? "No target"}</h2>
            </div>
            <span className="hud-tag">{selectedTarget ? makePortraitLabel(selectedTarget.name) : "--"}</span>
          </div>
          {selectedTarget ? (
            <>
              <div className="meter-row">
                <span>HP</span>
                <strong>{Math.round(selectedTarget.currentHp)}</strong>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill meter-fill-enemy"
                  style={{
                    width: `${Math.max(6, (selectedTarget.currentHp / prototypeCatalog.units[selectedTarget.definitionId].stats.maxHp) * 100)}%`,
                  }}
                />
              </div>
              <div className="target-meta">
                <span>{prototypeCatalog.units[selectedTarget.definitionId].summary}</span>
                <span>{prototypeCatalog.units[selectedTarget.definitionId].group}</span>
              </div>
              <div className="status-row">
                {selectedTarget.statuses.length > 0 ? (
                  selectedTarget.statuses.map((status) => (
                    <span key={status.id} className="status-pill">
                      {prototypeCatalog.statuses[status.id].name}
                    </span>
                  ))
                ) : (
                  <span className="status-pill status-pill-muted">No effects</span>
                )}
              </div>
            </>
          ) : (
            <p className="hud-empty">Select an enemy to inspect its health and status effects.</p>
          )}
        </section>
        )}
      </div>

      <div className="combat-hud combat-hud-left">
        {activeTab === "companions" && (
        <section className="hud-card companion-panel">
          <div className="hud-header">
            <div>
              <p className="hud-kicker">Companions</p>
              <h2>{companions.length ? `${companions.length} active` : "No recruits"}</h2>
            </div>
            <span className="hud-tag">{companions.length}/3</span>
          </div>
          <div className="companion-list">
            {companions.length > 0 ? (
              companions.map((unit) => (
                <article key={unit.id} className="companion-card">
                  <div className="portrait-badge">{makePortraitLabel(unit.name)}</div>
                  <div className="companion-copy">
                    <strong>{unit.name}</strong>
                    <span>{unit.group}</span>
                  </div>
                  <div className="companion-state">
                    <span className="order-icon">{makeOrderIcon(unit.order.orderId)}</span>
                    <small>{unit.isDowned ? "Downed" : `${Math.round(unit.currentHp)} HP`}</small>
                  </div>
                </article>
              ))
            ) : (
              <p className="hud-empty">Recruit companions from the setup panel before battle.</p>
            )}
          </div>
        </section>
        )}
      </div>

      <div className="combat-hud combat-hud-bottom">
        <section className="hud-card action-bar">
          <div className="action-grid">
            {snapshot.activeLoadoutIds.map((spellId, index) => {
              const spell = prototypeCatalog.spells[spellId];
              const cooldown = leader?.spellCooldowns[spellId] ?? 0;
              return (
                <button
                  key={spellId}
                  className={`hud-action-slot${armedSpellSlot === index ? " hud-action-slot-active" : ""}`}
                  onClick={() => {
                    onSpellSlotClick(index);
                  }}
                  type="button"
                >
                  <span className="slot-index">{index + 1}</span>
                  <strong>{spell.name}</strong>
                  <small>{cooldown > 0 ? `${(cooldown / 1000).toFixed(1)}s` : `${spell.resourceCost} mana`}</small>
                </button>
              );
            })}
          </div>
          <p className="control-hint">{controlHint}</p>
        </section>
      </div>

      {snapshot.rewardChoices.pendingSelection ? (
        <div className="combat-hud combat-hud-center">
          <section className="hud-card reward-panel">
            <div className="hud-header">
              <div>
                <p className="hud-kicker">Reward</p>
                <h2>Choose a combat reward</h2>
              </div>
              <span className="hud-tag">Level {snapshot.level}</span>
            </div>
            <div className="reward-grid">
              {snapshot.rewardChoices.choices.map((rewardId) => (
                <button
                  key={rewardId}
                  className="reward-card"
                  onClick={() => {
                    onChooseReward(rewardId);
                  }}
                  type="button"
                >
                  <strong>{prototypeCatalog.rewards[rewardId].name}</strong>
                  <span>{prototypeCatalog.rewards[rewardId].description}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
