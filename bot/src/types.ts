// ─── Strategy Profile ───────────────────────────────────────────────────────
// Captured during the onboarding wizard. Serialised to JSON and read back on
// every signal evaluation by the strategy engine.

export interface StrategyProfile {
  /** e.g. ["RSI", "MACD", "200MA"] */
  indicators: string[];

  rsi: {
    period: number;
    /** Enter long when RSI drops below this */
    oversoldThreshold: number;
    /** Enter short when RSI rises above this */
    overboughtThreshold: number;
  };

  macd: {
    /** "crossover" | "histogram" | "both" */
    signalType: "crossover" | "histogram" | "both";
  };

  movingAverages: {
    /** The MA periods the trader uses, e.g. [50, 200] */
    periods: number[];
    /** "price_above_all" | "price_above_any" | "ma_cross" */
    condition: "price_above_all" | "price_above_any" | "ma_cross";
  };

  leverage: {
    min: number;
    max: number;
  };

  stopLoss: {
    /** "support_zone" | "percentage" | "atr" */
    method: "support_zone" | "percentage" | "atr";
    /** Used when method === "percentage" */
    percentage?: number;
  };

  /** Max collateral per trade in USDC */
  maxPositionUSDC: number;

  /** ISO timestamp of when this profile was last saved */
  updatedAt: string;
}

// ─── Trade Proposal ──────────────────────────────────────────────────────────
// Emitted by the strategy engine and delivered to the user as a Telegram card.

export interface SimulationResult {
  estimatedPnlTP: number;   // USDC gain at take-profit
  estimatedPnlSL: number;   // USDC loss at stop-loss (negative)
  liquidationPrice: number;
  funding8h: number;        // estimated funding cost/gain over 8 hours
  gasEstimateUSD: number;
}

export interface SignalConfluence {
  indicator: string;
  value: string;
  passed: boolean;
}

export interface TradeProposal {
  id: string;               // uuid, used as callback_data key
  pair: string;             // e.g. "BTC-USD"
  direction: "LONG" | "SHORT";
  entryPrice: number;
  leverage: number;
  collateralUSDC: number;   // what the user puts in
  notionalUSDC: number;     // collateral × leverage
  stopLossPrice: number;
  takeProfitPrice: number;
  stopLossPct: number;      // % distance from entry
  takeProfitPct: number;
  simulation: SimulationResult;
  confluence: SignalConfluence[];
  /** ISO timestamp when signal was detected */
  detectedAt: string;
}

// ─── Active Position (from Avantis via Rust tools) ──────────────────────────

export interface ActivePosition {
  positionId: string;
  pair: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  collateralUSDC: number;
  unrealizedPnl: number;
  marginRatio: number;      // 0–1; low values = close to liquidation
  liquidationPrice: number;
  openedAt: string;
}

// ─── Bot internal ────────────────────────────────────────────────────────────

export type OnboardingStep =
  | "indicators"
  | "rsi"
  | "macd"
  | "moving_averages"
  | "leverage"
  | "stop_loss"
  | "position_size"
  | "confirm";
