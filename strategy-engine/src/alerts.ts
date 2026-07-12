import fs from "fs";
import path from "path";
import axios from "axios";
import { PriceAlert } from "./types";

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "../data");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const BOT_INTERNAL_URL =
  process.env.BOT_INTERNAL_URL ?? "http://stratex-bot.railway.internal:3001";

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAlerts(): PriceAlert[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(ALERTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ALERTS_FILE, "utf-8")) as PriceAlert[];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: PriceAlert[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), "utf-8");
  } catch {
    console.warn("[alerts] Could not persist alerts.json");
  }
}

export function addAlert(alert: PriceAlert): void {
  const alerts = loadAlerts();
  alerts.push(alert);
  saveAlerts(alerts);
}

/**
 * Checks all stored alerts for a given pair against the current price.
 * Fires (POSTs to the bot) and removes any that have crossed their target —
 * alerts are one-shot, matching typical price-alert UX.
 */
export async function checkAlertsForPair(pair: string, currentPrice: number): Promise<void> {
  const alerts = loadAlerts();
  const remaining: PriceAlert[] = [];
  const triggered: PriceAlert[] = [];

  for (const a of alerts) {
    if (a.pair !== pair) {
      remaining.push(a);
      continue;
    }
    const crossed =
      (a.direction === "above" && currentPrice >= a.targetPrice) ||
      (a.direction === "below" && currentPrice <= a.targetPrice);

    if (crossed) {
      triggered.push(a);
    } else {
      remaining.push(a);
    }
  }

  if (triggered.length > 0) {
    saveAlerts(remaining);
    for (const a of triggered) {
      try {
        await axios.post(`${BOT_INTERNAL_URL}/alert-triggered`, {
          ...a,
          currentPrice,
          triggeredAt: new Date().toISOString(),
        });
        console.log(`[alerts] Fired ${a.pair} ${a.direction} ${a.targetPrice} for user ${a.userId}`);
      } catch (err) {
        console.error(`[alerts] Failed to notify bot for user ${a.userId}:`, (err as Error).message);
      }
    }
  }
}
