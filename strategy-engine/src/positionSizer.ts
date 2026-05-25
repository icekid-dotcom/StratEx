import { Candle, SizedPosition, SimulationResult } from "./types";
import { StrategyProfile } from "./config";
import { calcSupportResistance } from "./indicators";

export function sizePosition(
  candles: Candle[],
  direction: "LONG" | "SHORT",
  profile: StrategyProfile,
  confluenceScore: number,  // passed checks out of total
  totalChecks: number
): SizedPosition {
  const entryPrice = candles[candles.length - 1].close;
  const sr = calcSupportResistance(candles);

  // ── Leverage: scale within range based on confluence score ─────────────────
  const ratio = confluenceScore / totalChecks;
  const leverage = Math.round(
    profile.leverage.min + ratio * (profile.leverage.max - profile.leverage.min)
  );

  // ── Collateral: use max position size from profile ─────────────────────────
  const collateralUSDC = profile.maxPositionUSDC;
  const notionalUSDC = collateralUSDC * leverage;

  // ── Stop-loss price ────────────────────────────────────────────────────────
  let stopLossPrice: number;
  let stopLossPct: number;

  if (profile.stopLoss.method === "support_zone") {
    if (direction === "LONG") {
      // SL just below nearest support
      stopLossPrice = sr.nearestSupport * 0.995;
    } else {
      // SL just above nearest resistance
      stopLossPrice = sr.nearestResistance * 1.005;
    }
    stopLossPct = Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100;
  } else if (profile.stopLoss.method === "percentage") {
    stopLossPct = profile.stopLoss.percentage ?? 2.5;
    stopLossPrice =
      direction === "LONG"
        ? entryPrice * (1 - stopLossPct / 100)
        : entryPrice * (1 + stopLossPct / 100);
  } else {
    // ATR — use 2% as fallback for MVP
    stopLossPct = 2.0;
    stopLossPrice =
      direction === "LONG"
        ? entryPrice * 0.98
        : entryPrice * 1.02;
  }

  // ── Take-profit: 2× the SL distance (2:1 RR minimum) ─────────────────────
  const takeProfitPct = stopLossPct * 2;
  const takeProfitPrice =
    direction === "LONG"
      ? entryPrice * (1 + takeProfitPct / 100)
      : entryPrice * (1 - takeProfitPct / 100);

  return {
    direction,
    entryPrice: parseFloat(entryPrice.toFixed(2)),
    leverage,
    collateralUSDC,
    notionalUSDC: parseFloat(notionalUSDC.toFixed(2)),
    stopLossPrice: parseFloat(stopLossPrice.toFixed(2)),
    takeProfitPrice: parseFloat(takeProfitPrice.toFixed(2)),
    stopLossPct: parseFloat(stopLossPct.toFixed(2)),
    takeProfitPct: parseFloat(takeProfitPct.toFixed(2)),
  };
}

/**
 * Mock simulation output for MVP.
 * The real simulation runs through the Anvil fork in the Rust backend.
 */
export function simulatePosition(pos: SizedPosition): SimulationResult {
  const { collateralUSDC, leverage, stopLossPct, takeProfitPct } = pos;

  const estimatedPnlTP = parseFloat(
    (collateralUSDC * leverage * (takeProfitPct / 100)).toFixed(2)
  );
  const estimatedPnlSL = parseFloat(
    (collateralUSDC * leverage * (stopLossPct / 100)).toFixed(2)
  );

  // Liquidation price: ~90% margin usage (simplified)
  const liqPct = (0.9 / leverage) * 100;
  const liquidationPrice =
    pos.direction === "LONG"
      ? parseFloat((pos.entryPrice * (1 - liqPct / 100)).toFixed(2))
      : parseFloat((pos.entryPrice * (1 + liqPct / 100)).toFixed(2));

  return {
    estimatedPnlTP,
    estimatedPnlSL: -Math.abs(estimatedPnlSL),
    liquidationPrice,
    funding8h: parseFloat((collateralUSDC * 0.0003).toFixed(4)),
    gasEstimateUSD: 0.004,
  };
}
