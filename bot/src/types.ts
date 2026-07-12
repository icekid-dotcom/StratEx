export interface SimulationResult {
  estimatedPnlTP: number;
  estimatedPnlSL: number;
  liquidationPrice: number;
  funding8h: number;
  gasEstimateUSD: number;
}

export interface SignalConfluence {
  indicator: string;
  value: string;
  passed: boolean;
}

export interface TradeProposal {
  id: string;
  userId: number;           // NEW — which Telegram user this proposal belongs to
  pair: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  leverage: number;
  collateralUSDC: number;
  notionalUSDC: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
  simulation: SimulationResult;
  confluence: SignalConfluence[];
  detectedAt: string;
}

export interface ActivePosition {
  userId: number;            // NEW — who owns this position
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

export interface PriceAlert {
  userId: number;
  pair: string;              // e.g. "BTC-USD"
  direction: "above" | "below";
  targetPrice: number;
}

export interface TriggeredAlert extends PriceAlert {
  currentPrice: number;
  triggeredAt: string;
}

export type OnboardingStep =
  | "indicators"
  | "rsi"
  | "macd"
  | "moving_averages"
  | "leverage"
  | "stop_loss"
  | "position_size"
  | "confirm";
