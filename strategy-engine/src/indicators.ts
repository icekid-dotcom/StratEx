import { Candle, RSIResult, MACDResult, MAResult, SupportResistanceResult } from "./types";

// ─── EMA ─────────────────────────────────────────────────────────────────────

export function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];

  // Seed with SMA of first `period` values
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(seed);

  for (let i = period; i < values.length; i++) {
    ema.push(values[i] * k + ema[ema.length - 1] * (1 - k));
  }

  return ema;
}

// ─── SMA ─────────────────────────────────────────────────────────────────────

export function calcSMA(values: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    sma.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return sma;
}

// ─── RSI ─────────────────────────────────────────────────────────────────────

export function calcRSI(candles: Candle[], period: number): RSIResult {
  const closes = candles.map((c) => c.close);
  const changes = closes.slice(1).map((c, i) => c - closes[i]);

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth using Wilder's method
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  return {
    value: parseFloat(rsi.toFixed(2)),
    period,
    isOversold: rsi < 30,
    isOverbought: rsi > 70,
  };
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
// Standard settings: 12, 26, 9

export function calcMACD(candles: Candle[]): MACDResult {
  const closes = candles.map((c) => c.close);

  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);

  // Align: ema26 starts at index 25, ema12 starts at index 11
  // Offset so both arrays end at the same candle
  const offset = 26 - 12;
  const macdLine = ema12.slice(offset).map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);

  // Align signal with macd
  const sigOffset = macdLine.length - signalLine.length;
  const histogram = signalLine.map((s, i) => macdLine[i + sigOffset] - s);

  const lastIdx = signalLine.length - 1;
  const prevIdx = lastIdx - 1;

  const currentMACD = macdLine[lastIdx + sigOffset];
  const currentSignal = signalLine[lastIdx];
  const currentHist = histogram[lastIdx];
  const prevHist = histogram[prevIdx];

  const prevMACD = macdLine[prevIdx + sigOffset];
  const prevSignal = signalLine[prevIdx];

  return {
    macdLine: parseFloat(currentMACD.toFixed(4)),
    signalLine: parseFloat(currentSignal.toFixed(4)),
    histogram: parseFloat(currentHist.toFixed(4)),
    isBullishCrossover: prevMACD <= prevSignal && currentMACD > currentSignal,
    isBearishCrossover: prevMACD >= prevSignal && currentMACD < currentSignal,
    isBullishHistogram: currentHist > 0 && currentHist > prevHist,
    isBearishHistogram: currentHist < 0 && currentHist < prevHist,
  };
}

// ─── Moving Averages ──────────────────────────────────────────────────────────

export function calcMA(candles: Candle[], period: number): MAResult {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // Not enough candles for this period — return current price as fallback
  if (closes.length < period) {
    return { period, value: currentPrice, priceAbove: true };
  }

  const sma = calcSMA(closes, period);
  const value = sma[sma.length - 1] ?? currentPrice;

  return {
    period,
    value: parseFloat(value.toFixed(2)),
    priceAbove: currentPrice > value,
  };
}

// ─── Support & Resistance ─────────────────────────────────────────────────────
// Detects swing highs/lows over a lookback window as S/R levels

export function calcSupportResistance(
  candles: Candle[],
  lookback: number = 20,
  proximityPct: number = 0.01  // 1% proximity to consider "in zone"
): SupportResistanceResult {
  const currentPrice = candles[candles.length - 1].close;
  const recent = candles.slice(-lookback);

  // Collect swing lows (support) and swing highs (resistance)
  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = 1; i < recent.length - 1; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const next = recent[i + 1];

    // Swing low
    if (curr.low < prev.low && curr.low < next.low) {
      supports.push(curr.low);
    }
    // Swing high
    if (curr.high > prev.high && curr.high > next.high) {
      resistances.push(curr.high);
    }
  }

  // Find nearest levels to current price
  const nearestSupport = supports.length
    ? supports.reduce((a, b) =>
        Math.abs(a - currentPrice) < Math.abs(b - currentPrice) ? a : b
      )
    : currentPrice * 0.97;

  const nearestResistance = resistances.length
    ? resistances.reduce((a, b) =>
        Math.abs(a - currentPrice) < Math.abs(b - currentPrice) ? a : b
      )
    : currentPrice * 1.03;

  const proximity = currentPrice * proximityPct;
  const inDemandZone = Math.abs(currentPrice - nearestSupport) <= proximity;
  const inSupplyZone = Math.abs(currentPrice - nearestResistance) <= proximity;

  return {
    nearestSupport: parseFloat(nearestSupport.toFixed(2)),
    nearestResistance: parseFloat(nearestResistance.toFixed(2)),
    inDemandZone,
    inSupplyZone,
    demandZoneLow: parseFloat((nearestSupport * 0.995).toFixed(2)),
    demandZoneHigh: parseFloat((nearestSupport * 1.005).toFixed(2)),
  };
}
