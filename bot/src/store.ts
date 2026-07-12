import fs from "fs";
import path from "path";

export interface StrategyProfile {
  indicators: string[];
  rsi: {
    period: number;
    oversoldThreshold: number;
    overboughtThreshold: number;
  };
  macd: {
    signalType: "crossover" | "histogram" | "both";
  };
  movingAverages: {
    periods: number[];
    condition: "price_above_all" | "price_above_any" | "ma_cross";
  };
  leverage: {
    min: number;
    max: number;
  };
  stopLoss: {
    method: "support_zone" | "percentage" | "atr";
    percentage?: number;
  };
  maxPositionUSDC: number;
  updatedAt: string;
}

// ─── Multi-user profile store ─────────────────────────────────────────────────

const STORE_DIR = process.env.STRATEGY_STORE_PATH ?? "./data/profiles";
const WALLET_DIR = process.env.WALLET_STORE_PATH ?? "./data/wallets";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function profilePath(userId: number): string {
  return path.join(STORE_DIR, `${userId}.json`);
}

function walletPath(userId: number): string {
  return path.join(WALLET_DIR, `${userId}.txt`);
}

export function saveProfile(userId: number, profile: StrategyProfile): void {
  ensureDir(STORE_DIR);
  fs.writeFileSync(profilePath(userId), JSON.stringify(profile, null, 2), "utf-8");
}

export function loadProfile(userId: number): StrategyProfile | null {
  try {
    const p = profilePath(userId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as StrategyProfile;
  } catch {
    return null;
  }
}

export function hasProfile(userId: number): boolean {
  return loadProfile(userId) !== null;
}

export function deleteProfile(userId: number): void {
  const p = profilePath(userId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** Every userId that currently has a saved strategy profile. Used by the
 *  engine (via GET /profiles) to know who to evaluate signals for. */
export function listUserIds(): number[] {
  ensureDir(STORE_DIR);
  return fs
    .readdirSync(STORE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(f.replace(".json", ""), 10))
    .filter((n) => !isNaN(n));
}

// ─── Wallet address (needed for position monitoring / liquidation checks) ────

export function saveWallet(userId: number, address: string): void {
  ensureDir(WALLET_DIR);
  fs.writeFileSync(walletPath(userId), address.trim(), "utf-8");
}

export function loadWallet(userId: number): string | null {
  try {
    const p = walletPath(userId);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf-8").trim();
  } catch {
    return null;
  }
}

export function formatProfile(p: StrategyProfile): string {
  const mas = p.movingAverages.periods.map((n) => `${n}MA`).join(", ");
  const slDesc =
    p.stopLoss.method === "percentage"
      ? `${p.stopLoss.percentage}% from entry`
      : p.stopLoss.method === "support_zone"
      ? "below nearest support zone"
      : "ATR-based";

  return [
    `📋 <b>Your Strategy Profile</b>`,
    ``,
    `<b>Indicators:</b> ${p.indicators.join(", ")}`,
    `<b>RSI:</b> period ${p.rsi.period} | long &lt;${p.rsi.oversoldThreshold} | short &gt;${p.rsi.overboughtThreshold}`,
    `<b>MACD signal:</b> ${p.macd.signalType}`,
    `<b>Moving averages:</b> ${mas} (${p.movingAverages.condition.replace(/_/g, " ")})`,
    `<b>Leverage:</b> ${p.leverage.min}x – ${p.leverage.max}x`,
    `<b>Stop-loss:</b> ${slDesc}`,
    `<b>Max position:</b> $${p.maxPositionUSDC} USDC`,
    ``,
    `<i>Last updated: ${new Date(p.updatedAt).toUTCString()}</i>`,
  ].join("\n");
}
