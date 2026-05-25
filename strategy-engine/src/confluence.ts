import { Candle, ConfluenceResult, ConfluenceCheck, SignalDirection } from "./types";
import { StrategyProfile } from "./config";
import { calcRSI, calcMACD, calcMA, calcSupportResistance } from "./indicators";

const MIN_SCORE_TO_FIRE = 0.6; // 60% of checks must pass to fire a proposal

export function evaluateConfluence(
  candles: Candle[],
  profile: StrategyProfile
): ConfluenceResult {
  const currentPrice = candles[candles.length - 1].close;
  const checks: ConfluenceCheck[] = [];

  let longVotes = 0;
  let shortVotes = 0;

  // ── RSI ────────────────────────────────────────────────────────────────────
  if (profile.indicators.includes("RSI")) {
    const rsi = calcRSI(candles, profile.rsi.period);

    const longCheck = rsi.value < profile.rsi.oversoldThreshold;
    const shortCheck = rsi.value > profile.rsi.overboughtThreshold;

    checks.push({
      indicator: `RSI(${profile.rsi.period})`,
      value: `${rsi.value} — ${rsi.isOversold ? "oversold" : rsi.isOverbought ? "overbought" : "neutral"}`,
      passed: longCheck || shortCheck,
    });

    if (longCheck) longVotes++;
    if (shortCheck) shortVotes++;
  }

  // ── MACD ───────────────────────────────────────────────────────────────────
  if (profile.indicators.includes("MACD")) {
    const macd = calcMACD(candles);

    let longPassed = false;
    let shortPassed = false;
    let valueDesc = "";

    if (profile.macd.signalType === "crossover") {
      longPassed = macd.isBullishCrossover;
      shortPassed = macd.isBearishCrossover;
      valueDesc = macd.isBullishCrossover
        ? "bullish crossover"
        : macd.isBearishCrossover
        ? "bearish crossover"
        : `no crossover (hist: ${macd.histogram})`;
    } else if (profile.macd.signalType === "histogram") {
      longPassed = macd.isBullishHistogram;
      shortPassed = macd.isBearishHistogram;
      valueDesc = `histogram ${macd.histogram > 0 ? "+" : ""}${macd.histogram}`;
    } else {
      // both
      longPassed = macd.isBullishCrossover || macd.isBullishHistogram;
      shortPassed = macd.isBearishCrossover || macd.isBearishHistogram;
      valueDesc = `crossover: ${macd.isBullishCrossover ? "bull" : macd.isBearishCrossover ? "bear" : "none"}, hist: ${macd.histogram}`;
    }

    checks.push({
      indicator: "MACD",
      value: valueDesc,
      passed: longPassed || shortPassed,
    });

    if (longPassed) longVotes++;
    if (shortPassed) shortVotes++;
  }

  // ── Moving Averages ────────────────────────────────────────────────────────
  if (profile.indicators.includes("MA")) {
    const mas = profile.movingAverages.periods.map((p) => calcMA(candles, p));

    let longPassed = false;
    let shortPassed = false;

    if (profile.movingAverages.condition === "price_above_all") {
      longPassed = mas.every((ma) => ma.priceAbove);
      shortPassed = mas.every((ma) => !ma.priceAbove);
    } else if (profile.movingAverages.condition === "price_above_any") {
      longPassed = mas.some((ma) => ma.priceAbove);
      shortPassed = mas.some((ma) => !ma.priceAbove);
    } else {
      // ma_cross — check if shorter MA is above/below longer MA
      if (mas.length >= 2) {
        const sorted = [...mas].sort((a, b) => a.period - b.period);
        longPassed = sorted[0].value > sorted[1].value;
        shortPassed = sorted[0].value < sorted[1].value;
      }
    }

    const maDesc = mas
      .map((ma) => `${ma.period}MA@${ma.value.toLocaleString()}`)
      .join(", ");

    checks.push({
      indicator: `MA (${profile.movingAverages.condition.replace(/_/g, " ")})`,
      value: maDesc,
      passed: longPassed || shortPassed,
    });

    if (longPassed) longVotes++;
    if (shortPassed) shortVotes++;
  }

  // ── Support & Resistance ───────────────────────────────────────────────────
  const sr = calcSupportResistance(candles);

  const srLongPassed = sr.inDemandZone;
  const srShortPassed = sr.inSupplyZone;

  checks.push({
    indicator: "S/R Zone",
    value: sr.inDemandZone
      ? `demand zone $${sr.demandZoneLow}–$${sr.demandZoneHigh}`
      : sr.inSupplyZone
      ? `supply zone near $${sr.nearestResistance}`
      : `between zones (support: $${sr.nearestSupport}, resist: $${sr.nearestResistance})`,
    passed: srLongPassed || srShortPassed,
  });

  if (srLongPassed) longVotes++;
  if (srShortPassed) shortVotes++;

  // ── Score & Direction ──────────────────────────────────────────────────────
  const total = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  const score = passedCount / total;

  let direction: SignalDirection = "NONE";
  if (score >= MIN_SCORE_TO_FIRE) {
    direction = longVotes >= shortVotes ? "LONG" : "SHORT";
  }

  return {
    direction,
    score: passedCount,
    total,
    passed: score >= MIN_SCORE_TO_FIRE,
    checks,
    currentPrice,
  };
}
