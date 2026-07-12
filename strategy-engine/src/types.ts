// ─── Price Data ───────────────────────────────────────────────────────────────

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// ─── Indicator Results ────────────────────────────────────────────────────────

export interface RSIResult {
  value: number;
  period: number;
  isOversold: boolean;
  isOverbought: boolean;
}

export interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
  isBullishCrossover: boolean;
  isBearishCrossover: boolean;
  isBullishHistogram: boolean;
  isBearishHistogram: boolean;
}

export interface MAResult {
  period: number;
  value: number;
  priceAbove: boolean;
}

export interface SupportResistanceResult {
  nearestSupport: number;
  nearestResistance: number;
  inDemandZone: boolean;
  inSupplyZone: boolean;
  demandZoneLow: number;
  demandZoneHigh: number;
}

// ─── Confluence Signal ────────────────────────────────────────────────────────

export type SignalDirection = "LONG" | "SHORT" | "NONE";

export interface ConfluenceResult {
  direction: SignalDirection;
  score: number;
  total: number;
  passed: boolean;
  checks: ConfluenceCheck[];
  currentPrice: number;
}

export interface ConfluenceCheck {
  indicator: string;
  value: string;
  passed: boolean;
}

// ─── Position Sizing ──────────────────────────────────────────────────────────

export interface SizedPosition {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  leverage: number;
  collateralUSDC: number;
  notionalUSDC: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
}

// ─── Simulation ────────────────────────────────────────────────────────────────

export interface SimulationResult {
  estimatedPnlTP: number;
  estimatedPnlSL: number;
  liquidationPrice: number;
  funding8h: number;
  gasEstimateUSD: number;
}

// ─── Strategy Profile (mirrors the bot's shape) ────────────────────────────────

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

/** One user's full context, pulled from the bot's GET /profiles each poll cycle. */
export interface UserProfileBundle {
  userId: number;
  profile: StrategyProfile;
  walletAddress: string | null;
}

// ─── Price Alerts ──────────────────────────────────────────────────────────────

export interface PriceAlert {
  userId: number;
  pair: string;               // e.g. "BTC-USD"
  direction: "above" | "below";
  targetPrice: number;
  createdAt: string;
}

// ─── Avantis Position (mirrors Rust backend's ActivePosition) ─────────────────

export interface AvantisPosition {
  positionId: string;
  pair: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  collateralUSDC: number;
  unrealizedPnl: number;
  marginRatio: number;
  liquidationPrice: number;
  openedAt: string;
}
