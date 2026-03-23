import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

type RenderState = {
  phase: string;
  leader: {
    resource: number;
    spellCooldowns: Record<string, number>;
    locomotion?: {
      mode: string;
      facingMode: string;
    };
    equipment: {
      active: Record<string, string | null>;
      stored: Record<string, string | null>;
    };
  } | null;
  leaderAnimation?: {
    activeBaseClip: string | null;
  } | null;
  companions: Array<{
    id: string;
    name: string;
    downed: boolean;
    dead: boolean;
    order: string;
    orderAnchor: { x: number; z: number } | null;
  }>;
  livingEnemies: number;
  zones: number;
  rewardsPending: boolean;
  rewardChoices: string[];
};

const url = process.argv[2] ?? "http://127.0.0.1:5173";

type CombatDebugApi = {
  issueAreaOrder: (orderId: "defend_area" | "hold_position" | "retreat", point: { x: number; y: number; z: number }) => void;
  castGroundSpell: (slotIndex: number, point: { x: number; y: number; z: number }) => void;
  reviveNearest: () => void;
  chooseReward: (rewardId: string) => void;
};

const readState = async (page: Page) =>
  page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) {
      throw new Error("render_game_to_text is not available");
    }
    return JSON.parse(render()) as RenderState;
  });

const advanceTime = async (page: Page, ms: number) => {
  await page.evaluate((amount) => {
    const advance = (window as Window & { advanceTime?: (ms: number) => void }).advanceTime;
    if (!advance) {
      throw new Error("advanceTime is not available");
    }
    advance(amount);
  }, ms);
};

const clickBattlefield = async (page: Page, xRatio: number, yRatio: number) => {
  const battlefield = page.locator("#battlefield");
  const box = await battlefield.boundingBox();
  if (!box) {
    throw new Error("Battlefield bounds unavailable");
  }

  await battlefield.click({
    position: {
      x: box.width * xRatio,
      y: box.height * yRatio,
    },
  });
};

const clickSelector = async (page: Page, selector: string) => {
  await page.evaluate((targetSelector) => {
    const element = document.querySelector<HTMLElement>(targetSelector);
    if (!element) {
      throw new Error(`Selector not found: ${targetSelector}`);
    }
    element.click();
  }, selector);
};

const callCombatDebug = async <TArgs extends unknown[]>(
  page: Page,
  fn: (api: CombatDebugApi, ...args: TArgs) => void,
  ...args: TArgs
) => {
  await page.evaluate(
    ([serializedArgs]) => {
      const api = (window as Window & { combat_debug?: CombatDebugApi }).combat_debug;
      if (!api) {
        throw new Error("combat_debug is not available");
      }
      const [callbackSource, callbackArgs] = serializedArgs as [string, unknown[]];
      const callback = Function("api", "args", `return (${callbackSource})(api, ...args);`) as (
        api: CombatDebugApi,
        args: unknown[],
      ) => void;
      callback(api, callbackArgs);
    },
    [[fn.toString(), args]],
  );
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#battlefield");
    await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: () => string }).render_game_to_text === "function");

    await clickSelector(page, '[data-testid="recruit-companion_vanguard"]');
    await clickSelector(page, '[data-testid="recruit-companion_ranger"]');
    await clickSelector(page, '[data-testid="recruit-companion_mender"]');

    let state = await readState(page);
    assert.equal(state.companions.length, 3, "expected three recruited companions");
    assert.equal(Object.keys(state.leader?.equipment.active ?? {}).length > 0, true, "leader should start equipped");

    await page.keyboard.press("KeyE");
    await advanceTime(page, 100);

    state = await readState(page);
    assert.equal(Object.keys(state.leader?.equipment.active ?? {}).length, 0, "toggle should clear active equipment");
    assert.equal(Object.keys(state.leader?.equipment.stored ?? {}).length > 0, true, "toggle should move items into storage");

    await page.keyboard.press("KeyE");
    await advanceTime(page, 100);

    state = await readState(page);
    assert.equal(Object.keys(state.leader?.equipment.active ?? {}).length > 0, true, "toggle should restore the default loadout");

    await clickSelector(page, '[data-testid="start-battle"]');
    await advanceTime(page, 200);

    state = await readState(page);
    assert.equal(state.phase, "battle", "battle should start");
    assert.equal(state.livingEnemies > 0, true, "wave should spawn enemies");

    await page.keyboard.press("KeyC");
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(220);
    state = await readState(page);
    assert.equal(state.leader?.locomotion?.mode, "strafe", "aim-left should resolve to strafe locomotion");
    assert.equal(state.leader?.locomotion?.facingMode, "faceAimDirection", "aim-left should keep aim-facing");
    assert.equal(state.leaderAnimation?.activeBaseClip !== null, true, "animation debug should expose the active base clip");
    await page.keyboard.up("KeyA");
    await page.keyboard.press("KeyC");

    await page.keyboard.down("Shift");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(220);
    state = await readState(page);
    assert.equal(state.leader?.locomotion?.mode, "sprint", "shift-forward should resolve to sprint locomotion");
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Shift");

    const orderBefore = state.companions[0]?.order;
    await callCombatDebug(
      page,
      (api, point) => {
        api.issueAreaOrder("defend_area", point);
      },
      { x: 6, y: 0, z: 1.5 },
    );
    await advanceTime(page, 100);

    state = await readState(page);
    assert.equal(state.companions[0]?.order, "defend_area", "companions should receive defend area order");
    assert.notEqual(state.companions[0]?.order, orderBefore, "order should change after placed order");
    assert.notEqual(state.companions[0]?.orderAnchor, null, "placed order should set an anchor");

    const resourceBeforeCast = state.leader?.resource ?? 0;
    await callCombatDebug(
      page,
      (api, point) => {
        api.castGroundSpell(2, point);
      },
      { x: 0, y: 0, z: 3 },
    );
    await advanceTime(page, 900);

    state = await readState(page);
    assert.equal(state.zones > 0, true, "ground spell should create a zone");
    assert.equal((state.leader?.resource ?? 0) < resourceBeforeCast, true, "spell cast should spend resource");
    assert.equal((state.leader?.spellCooldowns?.steam_snare ?? 0) > 0, true, "spell cast should trigger cooldown");

    await page.getByText("Debug/Ops").click();
    await page.locator("#debug-down-ally").waitFor({ state: "visible" });
    await advanceTime(page, 100);
    await clickSelector(page, "#debug-down-ally");
    await advanceTime(page, 100);
    state = await readState(page);
    const downedCompanionId = state.companions.find((companion) => companion.downed)?.id ?? null;
    assert.notEqual(downedCompanionId, null, "debug down ally should produce a downed companion");

    await callCombatDebug(page, (api) => {
      api.reviveNearest();
    });
    await advanceTime(page, 1800);

    state = await readState(page);
    assert.equal(
      state.companions.find((companion) => companion.id === downedCompanionId)?.downed ?? true,
      false,
      "revive should restore the targeted downed companion",
    );

    await clickSelector(page, "#debug-clear-enemies");
    await advanceTime(page, 200);

    state = await readState(page);
    assert.equal(state.rewardsPending, true, "clearing the wave should surface rewards");

    const rewardId = state.rewardChoices[0];
    assert.notEqual(rewardId, undefined, "a reward should be available after victory");
    await callCombatDebug(page, (api, chosenRewardId) => {
      api.chooseReward(chosenRewardId);
    }, rewardId);
    await advanceTime(page, 100);

    state = await readState(page);
    assert.equal(state.phase, "loadout", "choosing a reward should return the prototype to loadout");

    await page.screenshot({ path: "output/combat-smoke-final.png", fullPage: true });
    console.log("combat smoke passed");
  } finally {
    await page.close();
    await browser.close();
  }
}

await main();
