import fs from "fs";
import path from "path";
import { StrategyProfile } from "./types";

const STORE_PATH = process.env.STRATEGY_STORE_PATH ?? "./data/strategy.json";

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveProfile(profile: StrategyProfile): void {
  ensureDir(STORE_PATH);
  fs.writeFileSync(STORE_PATH, JSON.stringify(profile, null, 2), "utf-8");
}

export function loadProfile(): StrategyProfile | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as StrategyProfile;
  } catch {
    return null;
  }
}

export function hasProfile(): boolean {
  return loadProfile() !== null;
}

/** Pretty-prints the strategy profile for display in Telegram */
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
