import axios from "axios";
import { UserProfileBundle, StrategyProfile } from "./types";

export type { StrategyProfile } from "./types";

// The bot and engine run as separate Railway services with separate
// filesystems, so profiles can't be read off disk anymore — the engine
// pulls them fresh from the bot's GET /profiles each poll cycle.
const BOT_INTERNAL_URL =
  process.env.BOT_INTERNAL_URL ?? "http://stratex-bot.railway.internal:3001";

export async function fetchAllUserProfiles(): Promise<UserProfileBundle[]> {
  try {
    const res = await axios.get(`${BOT_INTERNAL_URL}/profiles`, { timeout: 8_000 });
    return res.data as UserProfileBundle[];
  } catch (err) {
    console.error(`[config] Failed to fetch profiles from bot (${BOT_INTERNAL_URL}):`, (err as Error).message);
    return [];
  }
}

export function defaultProfile(): StrategyProfile {
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
