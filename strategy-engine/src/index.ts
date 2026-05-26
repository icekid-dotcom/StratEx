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
const CANDLE_INTERVAL = process.env.CANDLE_INTERVAL ?? "1h";
const CANDLE_LIMIT    = parseInt(process.env.CANDLE_LIMIT ?? "200");

// Pairs to monitor — BTC, ETH, SOL
const TRADING_PAIRS = (process.env.TRADING_PAIRS ?? "BTCUSDT,ETHUSDT,SOLUSDT")
  .split(",")
  .map((p) => p.trim());

// Cooldown per pair — persisted to disk so restarts don't reset it
const PROPOSAL_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours per pair
const COOLDOWN_FILE = path.join(__dirname, "../cooldown.json");

function loadCooldowns(): Record<string, number> {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) return {};
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveCooldowns(cooldowns: Record<string, number>): void {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldowns), "utf-8");
  } catch {
    console.warn("[engine] Could not persist cooldown timestamps.");
  }
}

const cooldowns: Record<string, number> = loadCooldowns();

// ─── Poll a single pair ───────────────────────────────────────────────────────

async function pollPair(symbol: string): Promise<void> {
  const profile = loadStrategyProfile();
  const pair = symbol.replace("USDT", "-USD");

  console.log(`\n[engine] ── Polling ${symbol} ${CANDLE_INTERVAL} ──`);

  // 1. Fetch OHLCV
  const candles = await fetchCandles(symbol, CANDLE_INTERVAL, CANDLE_LIMIT);
  const currentPrice = candles[candles.length - 1].close;
  console.log(`[engine] ${symbol} price: $${currentPrice.toLocaleString()}`);

  // 2. Evaluate confluence
  const confluence = evaluateConfluence(candles, profile);
  console.log(`[engine] ${symbol} confluence: ${confluence.score}/${confluence.total} checks passed`);
  confluence.checks.forEach((c) =>
    console.log(`  ${c.passed ? "✅" : "❌"} ${c.indicator}: ${c.value}`)
  );

  // 3. Check if signal is strong enough
  if (!confluence.passed || confluence.direction === "NONE") {
    console.log(`[engine] ${symbol}: No signal — waiting.`);
    return;
  }

  // 4. Cooldown check per pair
  const now = Date.now();
  const lastProposalAt = cooldowns[symbol] ?? 0;
  if (now - lastProposalAt < PROPOSAL_COOLDOWN_MS) {
    const remainingMins = Math.round((PROPOSAL_COOLDOWN_MS - (now - lastProposalAt)) / 60000);
    console.log(`[engine] ${symbol}: Signal detected but in cooldown (${remainingMins}m remaining).`);
    return;
  }

  console.log(`[engine] 🎯 ${symbol} ${confluence.direction} signal! Sizing position...`);

  // 5. Size position
  const position = sizePosition(
    candles,
    confluence.direction as "LONG" | "SHORT",
    profile,
    confluence.score,
    confluence.total
  );
  console.log(
    `[engine] ${symbol}: ${position.direction} ${position.leverage}x ` +
    `$${position.collateralUSDC} USDC | SL: $${position.stopLossPrice} | TP: $${position.takeProfitPrice}`
  );

  // 6. Simulate
  const simulation = simulatePosition(position);

  // 7. Build and fire proposal
  const proposal = buildProposal(pair, confluence, position, simulation);
  await sendProposalToBot(proposal);

  // Save cooldown for this pair
  cooldowns[symbol] = Date.now();
  saveCooldowns(cooldowns);
}

// ─── Main poll loop — cycles through all pairs ────────────────────────────────

async function pollAll(): Promise<void> {
  for (const symbol of TRADING_PAIRS) {
    await pollPair(symbol).catch((err) =>
      console.error(`[engine] Poll error for ${symbol}:`, err.message)
    );
    // Small delay between pairs to avoid rate limiting
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[engine] Stratex Strategy Engine starting...`);
  console.log(`[engine] Pairs: ${TRADING_PAIRS.join(", ")} | Interval: ${CANDLE_INTERVAL} | Poll: ${POLL_INTERVAL}ms`);

  startApiServer(ENGINE_PORT);

  // Run immediately on start
  await pollAll();

  // Then on interval
  setInterval(async () => {
    await pollAll();
  }, POLL_INTERVAL);
}

main().catch((err) => {
  console.error(`[engine] Fatal error:`, err);
  process.exit(1);
});
