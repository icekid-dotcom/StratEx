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
  value: number;       // current RSI value
  period: number;
  isOversold: boolean;
  isOverbought: boolean;
}

export interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
  isBullishCrossover: boolean;  // macd crossed above signal this candle
  isBearishCrossover: boolean;  // macd crossed below signal this candle
  isBullishHistogram: boolean;  // histogram positive and growing
  isBearishHistogram: boolean;  // histogram negative and shrinking
}

export interface MAResult {
  period: number;
  value: number;
  priceAbove: boolean;  // is current price above this MA?
}

export interface SupportResistanceResult {
  nearestSupport: number;
  nearestResistance: number;
  inDemandZone: boolean;   // price within 1% of a support level
  inSupplyZone: boolean;   // price within 1% of a resistance level
  demandZoneLow: number;
  demandZoneHigh: number;
}

// ─── Confluence Signal ────────────────────────────────────────────────────────

export type SignalDirection = "LONG" | "SHORT" | "NONE";

export interface ConfluenceResult {
  direction: SignalDirection;
  score: number;           // how many conditions passed (out of total)
  total: number;
  passed: boolean;         // score >= minimum threshold to fire proposal
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

// ─── Simulation (mock for MVP — real Anvil fork in backend layer) ─────────────

export interface SimulationResult {
  estimatedPnlTP: number;
  estimatedPnlSL: number;
  liquidationPrice: number;
  funding8h: number;
  gasEstimateUSD: number;
}
