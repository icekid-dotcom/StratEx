import { Candle, SizedPosition, SimulationResult } from "./types";
import { StrategyProfile } from "./config";
import { calcSupportResistance } from "./indicators";

const MAX_LEVERAGE = 100;
const MIN_LEVERAGE = 1;
const MIN_STOP_LOSS_PCT = 0.1;
const MAX_STOP_LOSS_PCT = 20;

export function sizePosition(
  candles: Candle[],
  direction: "LONG" | "SHORT",
  profile: StrategyProfile,
  confluenceScore: number,
  totalChecks: number
): SizedPosition {
  const entryPrice = candles[candles.length - 1].close;
  const sr = calcSupportResistance(candles);

  // ── Leverage: scale within range based on confluence score, clamped ────────
  const ratio = confluenceScore / totalChecks;
  const safeLevMin = clamp(profile.leverage.min, MIN_LEVERAGE, MAX_LEVERAGE);
  const safeLevMax = clamp(profile.leverage.max, MIN_LEVERAGE, MAX_LEVERAGE);
  const leverage = Math.round(safeLevMin + ratio * (Math.max(safeLevMax, safeLevMin) - safeLevMin));

  const collateralUSDC = profile.maxPositionUSDC;
  const notionalUSDC = collateralUSDC * leverage;

  // ── Stop-loss price ────────────────────────────────────────────────────────
  let stopLossPrice: number;
  let stopLossPct: number;

  if (profile.stopLoss.method === "support_zone") {
    if (direction === "LONG") {
      stopLossPrice = sr.nearestSupport * 0.995;
    } else {
      stopLossPrice = sr.nearestResistance * 1.005;
    }
    stopLossPct = Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100;
    // Support/resistance can occasionally hand back a degenerate zero or a
    // wildly wide gap — clamp so a bad S/R read can't produce a $0 stop.
    if (!Number.isFinite(stopLossPct) || stopLossPct < MIN_STOP_LOSS_PCT || stopLossPct > MAX_STOP_LOSS_PCT) {
      stopLossPct = clamp(stopLossPct, MIN_STOP_LOSS_PCT, MAX_STOP_LOSS_PCT);
      stopLossPrice = direction === "LONG"
        ? entryPrice * (1 - stopLossPct / 100)
        : entryPrice * (1 + stopLossPct / 100);
    }
  } else if (profile.stopLoss.method === "percentage") {
    stopLossPct = clamp(profile.stopLoss.percentage ?? 2.5, MIN_STOP_LOSS_PCT, MAX_STOP_LOSS_PCT);
    stopLossPrice =
      direction === "LONG"
        ? entryPrice * (1 - stopLossPct / 100)
        : entryPrice * (1 + stopLossPct / 100);
  } else {
    stopLossPct = 2.0;
    stopLossPrice =
      direction === "LONG"
        ? entryPrice * 0.98
        : entryPrice * 1.02;
  }

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

export function simulatePosition(pos: SizedPosition): SimulationResult {
  const { collateralUSDC, leverage, stopLossPct, takeProfitPct } = pos;

  const estimatedPnlTP = parseFloat(
    (collateralUSDC * leverage * (takeProfitPct / 100)).toFixed(2)
  );
  const estimatedPnlSL = parseFloat(
    (collateralUSDC * leverage * (stopLossPct / 100)).toFixed(2)
  );

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

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
