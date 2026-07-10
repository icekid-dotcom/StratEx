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

// ─── Multi-user store ─────────────────────────────────────────────────────────

const STORE_DIR = process.env.STRATEGY_STORE_PATH ?? "./data/profiles";

function ensureDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function profilePath(userId: number): string {
  return path.join(STORE_DIR, `${userId}.json`);
}

export function saveProfile(userId: number, profile: StrategyProfile): void {
  ensureDir();
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
