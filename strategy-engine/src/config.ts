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

const PROFILE_PATH =
  process.env.STRATEGY_PROFILE_PATH ??
  path.join(__dirname, "../../Stratex-bot/data/strategy.json");

export function loadStrategyProfile(): StrategyProfile {
  if (!fs.existsSync(PROFILE_PATH)) {
    console.warn(`[config] No strategy profile found at ${PROFILE_PATH}`);
    console.warn(`[config] Using default profile. Run /setup in the bot to configure.`);
    return defaultProfile();
  }

  try {
    const raw = fs.readFileSync(PROFILE_PATH, "utf-8");
    const profile = JSON.parse(raw) as StrategyProfile;
    console.log(`[config] Strategy profile loaded (updated: ${profile.updatedAt})`);
    return profile;
  } catch (err) {
    console.error(`[config] Failed to parse strategy profile:`, err);
    return defaultProfile();
  }
}

function defaultProfile(): StrategyProfile {
  return {
    indicators: ["RSI", "MACD", "MA"],
    rsi: { period: 14, oversoldThreshold: 30, overboughtThreshold: 70 },
    macd: { signalType: "crossover" },
    movingAverages: { periods: [50, 200], condition: "price_above_all" },
    leverage: { min: 3, max: 5 },
    stopLoss: { method: "percentage", percentage: 2.5 },
    maxPositionUSDC: 500,
    updatedAt: new Date().toISOString(),
  };
}
