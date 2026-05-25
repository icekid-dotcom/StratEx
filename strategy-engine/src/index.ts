import "dotenv/config";
import fs from "fs";
import path from "path";
import { fetchCandles } from "./priceData";
import { evaluateConfluence } from "./confluence";
import { sizePosition, simulatePosition } from "./positionSizer";
import { buildProposal, sendProposalToBot } from "./proposalBuilder";
import { loadStrategyProfile } from "./config";
import { startApiServer } from "./api";

// ─── Config ───────────────────────────────────────────────────────────────────

const ENGINE_PORT     = parseInt(process.env.ENGINE_PORT ?? "3000");
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL_MS ?? "60000");
const TRADING_PAIR    = process.env.TRADING_PAIR ?? "BTCUSDT";
const CANDLE_INTERVAL = process.env.CANDLE_INTERVAL ?? "1h";
const CANDLE_LIMIT    = parseInt(process.env.CANDLE_LIMIT ?? "200");

// Cooldown: 4 hours between proposals — persisted to disk so restarts don't reset it
const PROPOSAL_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const COOLDOWN_FILE = path.join(__dirname, "../cooldown.json");

function loadLastProposalAt(): number {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) return 0;
    const raw = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf-8"));
    return raw.lastProposalAt ?? 0;
  } catch {
    return 0;
  }
}

function saveLastProposalAt(ts: number): void {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify({ lastProposalAt: ts }), "utf-8");
  } catch {
    console.warn("[engine] Could not persist cooldown timestamp.");
  }
}

let lastProposalAt = loadLastProposalAt();

// ─── Main poll loop ───────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  const profile = loadStrategyProfile();

  console.log(`\n[engine] ── Polling ${TRADING_PAIR} ${CANDLE_INTERVAL} ──`);

  // 1. Fetch OHLCV
  const candles = await fetchCandles(TRADING_PAIR, CANDLE_INTERVAL, CANDLE_LIMIT);
  const currentPrice = candles[candles.length - 1].close;
  console.log(`[engine] Current price: $${currentPrice.toLocaleString()}`);

  // 2. Evaluate confluence
  const confluence = evaluateConfluence(candles, profile);
  console.log(`[engine] Confluence: ${confluence.score}/${confluence.total} checks passed`);
  confluence.checks.forEach((c) =>
    console.log(`  ${c.passed ? "✅" : "❌"} ${c.indicator}: ${c.value}`)
  );

  // 3. Check if signal is strong enough
  if (!confluence.passed || confluence.direction === "NONE") {
    console.log(`[engine] No signal — waiting for next poll.`);
    return;
  }

  // 4. Cooldown check — persists across restarts
  const now = Date.now();
  if (now - lastProposalAt < PROPOSAL_COOLDOWN_MS) {
    const remainingMins = Math.round((PROPOSAL_COOLDOWN_MS - (now - lastProposalAt)) / 60000);
    console.log(`[engine] Signal detected but in cooldown (${remainingMins}m remaining).`);
    return;
  }

  console.log(`[engine] 🎯 ${confluence.direction} signal detected! Sizing position...`);

  // 5. Size position
  const position = sizePosition(
    candles,
    confluence.direction as "LONG" | "SHORT",
    profile,
    confluence.score,
    confluence.total
  );
  console.log(
    `[engine] Position: ${position.direction} ${position.leverage}x ` +
    `$${position.collateralUSDC} USDC | SL: $${position.stopLossPrice} | TP: $${position.takeProfitPrice}`
  );

  // 6. Simulate
  const simulation = simulatePosition(position);
  console.log(
    `[engine] Sim: PnL@TP +$${simulation.estimatedPnlTP} | PnL@SL ${simulation.estimatedPnlSL} | Liq: $${simulation.liquidationPrice}`
  );

  // 7. Build and fire proposal
  const pair = TRADING_PAIR.replace("USDT", "-USD");
  const proposal = buildProposal(pair, confluence, position, simulation);

  await sendProposalToBot(proposal);

  // Save cooldown timestamp to disk
  lastProposalAt = Date.now();
  saveLastProposalAt(lastProposalAt);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[engine] Stratex Strategy Engine starting...`);
  console.log(`[engine] Pair: ${TRADING_PAIR} | Interval: ${CANDLE_INTERVAL} | Poll: ${POLL_INTERVAL}ms`);

  const cooldownRemaining = PROPOSAL_COOLDOWN_MS - (Date.now() - lastProposalAt);
  if (cooldownRemaining > 0) {
    console.log(`[engine] Last proposal was ${Math.round((Date.now() - lastProposalAt) / 60000)}m ago — cooldown active.`);
  }

  startApiServer(ENGINE_PORT);

  await poll().catch((err) => console.error(`[engine] Poll error:`, err));

  setInterval(async () => {
    await poll().catch((err) => console.error(`[engine] Poll error:`, err));
  }, POLL_INTERVAL);
}

main().catch((err) => {
  console.error(`[engine] Fatal error:`, err);
  process.exit(1);
});
