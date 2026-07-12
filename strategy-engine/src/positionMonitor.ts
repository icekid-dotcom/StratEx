import axios from "axios";
import { AvantisPosition, UserProfileBundle } from "./types";

// Mirrors the Rust backend's avantis.rs client — the engine talks to the same
// REST API directly since it can't invoke the Aomi/Rust plugin as an HTTP service.
const AVANTIS_BASE = "https://api.avantisfi.com/v1";
const BOT_INTERNAL_URL =
  process.env.BOT_INTERNAL_URL ?? "http://stratex-bot.railway.internal:3001";

const LIQUIDATION_MARGIN_THRESHOLD = 0.15; // matches tools.rs danger-zone cutoff

export async function getPositionsForWallet(wallet: string): Promise<AvantisPosition[]> {
  try {
    const res = await axios.get(`${AVANTIS_BASE}/positions/${wallet}`, { timeout: 8_000 });
    const data = res.data;
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      positionId: item.id,
      pair: item.pair,
      direction: item.direction === "short" ? "SHORT" : "LONG",
      entryPrice: item.entry_price,
      currentPrice: item.current_price,
      leverage: item.leverage,
      collateralUSDC: item.collateral,
      unrealizedPnl: item.unrealized_pnl,
      marginRatio: item.margin_ratio,
      liquidationPrice: item.liquidation_price,
      openedAt: item.opened_at ?? "",
    }));
  } catch {
    // Avantis unreachable or wallet has no positions — fail safe to empty
    return [];
  }
}

/**
 * Called once per poll cycle. For every user with a linked wallet, fetches
 * open positions and pushes a liquidation warning for any below the margin
 * threshold. The bot's /liquidation endpoint has a 4h-ish natural cooldown
 * only in the sense that this runs on POLL_INTERVAL_MS — for a tighter demo
 * cadence, run this on its own faster interval than pollAll().
 */
export async function monitorAllPositions(users: UserProfileBundle[]): Promise<void> {
  for (const u of users) {
    if (!u.walletAddress) continue;

    const positions = await getPositionsForWallet(u.walletAddress);
    const danger = positions.filter((p) => p.marginRatio < LIQUIDATION_MARGIN_THRESHOLD);

    for (const p of danger) {
      try {
        await axios.post(`${BOT_INTERNAL_URL}/liquidation`, { userId: u.userId, ...p });
        console.log(`[monitor] Liquidation warning sent — user ${u.userId}, ${p.pair}, margin ${(p.marginRatio * 100).toFixed(1)}%`);
      } catch (err) {
        console.error(`[monitor] Failed to notify bot for user ${u.userId}:`, (err as Error).message);
      }
    }
  }
}
