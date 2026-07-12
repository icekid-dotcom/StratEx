import "dotenv/config";
import fs from "fs";
import path from "path";
import { fetchCandles } from "./priceData";
import { evaluateConfluence } from "./confluence";
import { sizePosition, simulatePosition } from "./positionSizer";
import { buildProposal, sendProposalToBot } from "./proposalBuilder";
import { fetchAllUserProfiles } from "./config";
import { startApiServer } from "./api";
import { checkAlertsForPair } from "./alerts";
import { monitorAllPositions } from "./positionMonitor";
import { Candle, UserProfileBundle } from "./types";

// ─── Config ───────────────────────────────────────────────────────────────────

const ENGINE_PORT     = parseInt(process.env.ENGINE_PORT ?? "3000");
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL_MS ?? "60000");
const CANDLE_INTERVAL = process.env.CANDLE_INTERVAL ?? "1h";
const CANDLE_LIMIT    = parseInt(process.env.CANDLE_LIMIT ?? "200");

const TRADING_PAIRS = (process.env.TRADING_PAIRS ?? "BTCUSDT,ETHUSDT,SOLUSDT")
  .split(",")
  .map((p) => p.trim());

// Cooldown is now per (userId, pair) — one user firing a signal shouldn't
// block another user's proposal on the same pair.
const PROPOSAL_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "../data");
const COOLDOWN_FILE = path.join(DATA_DIR, "cooldown.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadCooldowns(): Record<string, number> {
  try {
    ensureDataDir();
    if (!fs.existsSync(COOLDOWN_FILE)) return {};
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveCooldowns(cooldowns: Record<string, number>): void {
  try {
    ensureDataDir();
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldowns), "utf-8");
  } catch {
    console.warn("[engine] Could not persist cooldown timestamps.");
  }
}

const cooldowns: Record<string, number> = loadCooldowns();

// ─── Poll a single pair for a single user ─────────────────────────────────────

async function pollPairForUser(symbol: string, candles: Candle[], user: UserProfileBundle): Promise<void> {
  const pair = symbol.replace("USDT", "-USD");
  const cooldownKey = `${user.userId}:${symbol}`;

  const confluence = evaluateConfluence(candles, user.profile);

  if (!confluence.passed || confluence.direction === "NONE") {
    return;
  }

  const now = Date.now();
  const lastProposalAt = cooldowns[cooldownKey] ?? 0;
  if (now - lastProposalAt < PROPOSAL_COOLDOWN_MS) {
    return;
  }

  console.log(`[engine] 🎯 user ${user.userId} — ${symbol} ${confluence.direction} signal! Sizing position...`);

  const position = sizePosition(
    candles,
    confluence.direction as "LONG" | "SHORT",
    user.profile,
    confluence.score,
    confluence.total
  );

  const simulation = simulatePosition(position);
  const proposal = buildProposal(user.userId, pair, confluence, position, simulation);

  try {
    await sendProposalToBot(proposal);
    cooldowns[cooldownKey] = now;
    saveCooldowns(cooldowns);
  } catch (err) {
    console.error(`[engine] Failed to deliver proposal for user ${user.userId}:`, (err as Error).message);
  }
}

// ─── Poll all pairs, all users, plus alerts ───────────────────────────────────

async function pollAll(): Promise<void> {
  const users = await fetchAllUserProfiles();

  if (users.length === 0) {
    console.log(`[engine] No user profiles found (or bot unreachable) — skipping this cycle.`);
    return;
  }

  console.log(`[engine] Polling ${TRADING_PAIRS.length} pairs for ${users.length} user(s)...`);

  for (const symbol of TRADING_PAIRS) {
    // Fetch candles once per pair, reuse across users, check price alerts once.
    let candles;
    try {
      candles = await fetchCandles(symbol, CANDLE_INTERVAL, CANDLE_LIMIT);
    } catch (err) {
      console.error(`[engine] Failed to fetch candles for ${symbol}:`, (err as Error).message);
      continue;
    }
    const currentPrice = candles[candles.length - 1].close;
    const pair = symbol.replace("USDT", "-USD");

    await checkAlertsForPair(pair, currentPrice).catch((err) =>
      console.error(`[engine] Alert check failed for ${pair}:`, err.message)
    );

    for (const user of users) {
      await pollPairForUser(symbol, candles, user).catch((err) =>
        console.error(`[engine] Poll error for ${symbol} / user ${user.userId}:`, err.message)
      );
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  await monitorAllPositions(users).catch((err) =>
    console.error(`[engine] Position monitoring failed:`, err.message)
  );
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[engine] Stratex Strategy Engine starting (multi-user)...`);
  console.log(`[engine] Pairs: ${TRADING_PAIRS.join(", ")} | Interval: ${CANDLE_INTERVAL} | Poll: ${POLL_INTERVAL}ms`);

  startApiServer(ENGINE_PORT);

  await pollAll();

  setInterval(async () => {
    await pollAll();
  }, POLL_INTERVAL);
}

main().catch((err) => {
  console.error(`[engine] Fatal error:`, err);
  process.exit(1);
});
