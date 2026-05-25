import { Conversation } from "@grammyjs/conversations";
import { Context } from "grammy";
import { StrategyProfile } from "./types";
import { saveProfile, formatProfile } from "./store";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ask(
  conversation: Conversation<Context>,
  ctx: Context,
  question: string
): Promise<string> {
  await ctx.reply(question, { parse_mode: "HTML" });
  const reply = await conversation.waitFor("message:text");
  return reply.message.text.trim();
}

async function askWithOptions(
  conversation: Conversation<Context>,
  ctx: Context,
  question: string,
  options: string[]
): Promise<string> {
  const optionList = options.map((o, i) => `  <b>${i + 1}.</b> ${o}`).join("\n");
  await ctx.reply(`${question}\n\n${optionList}`, { parse_mode: "HTML" });

  while (true) {
    const reply = await conversation.waitFor("message:text");
    const input = reply.message.text.trim();

    // Accept number shortcut or direct text match
    const idx = parseInt(input) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];

    const match = options.find((o) => o.toLowerCase().startsWith(input.toLowerCase()));
    if (match) return match;

    await ctx.reply(
      `⚠️ Please reply with a number (1–${options.length}) or the option text.`
    );
  }
}

function parseNumbers(input: string): number[] {
  return input
    .split(/[\s,]+/)
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);
}

// ─── Main Onboarding Conversation ────────────────────────────────────────────

export async function onboardingConversation(
  conversation: Conversation<Context>,
  ctx: Context
): Promise<void> {
  await ctx.reply(
    [
      `👋 <b>Welcome to Stratex onboarding.</b>`,
      ``,
      `I'll learn your TA method in a few questions. This takes ~2 minutes.`,
      `Type /cancel at any time to stop.`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  // ── Step 1: Indicators ──────────────────────────────────────────────────
  const indicatorAnswer = await askWithOptions(
    conversation,
    ctx,
    `<b>Step 1/7</b> — Which indicators are core to your entries?`,
    [
      "RSI + MACD + MA",
      "RSI + MACD only",
      "RSI + MA only",
      "MACD + MA only",
      "RSI only",
    ]
  );

  const indicators: string[] = [];
  if (indicatorAnswer.includes("RSI")) indicators.push("RSI");
  if (indicatorAnswer.includes("MACD")) indicators.push("MACD");
  if (indicatorAnswer.includes("MA")) indicators.push("MA");

  // ── Step 2: RSI settings ────────────────────────────────────────────────
  let rsiPeriod = 14;
  let rsiOversold = 30;
  let rsiOverbought = 70;

  if (indicators.includes("RSI")) {
    const rsiPeriodRaw = await ask(
      conversation,
      ctx,
      `<b>Step 2/7</b> — RSI settings.\n\nWhat period do you use? (default: <b>14</b> — just hit Enter or type your number)`
    );
    rsiPeriod = parseInt(rsiPeriodRaw) || 14;

    const rsiOversoldRaw = await ask(
      conversation,
      ctx,
      `Oversold threshold for <b>long entries</b>? (default: <b>30</b>)`
    );
    rsiOversold = parseInt(rsiOversoldRaw) || 30;

    const rsiOverboughtRaw = await ask(
      conversation,
      ctx,
      `Overbought threshold for <b>short entries</b>? (default: <b>70</b>)`
    );
    rsiOverbought = parseInt(rsiOverboughtRaw) || 70;
  }

  // ── Step 3: MACD signal ─────────────────────────────────────────────────
  let macdSignalType: StrategyProfile["macd"]["signalType"] = "crossover";

  if (indicators.includes("MACD")) {
    const macdAnswer = await askWithOptions(
      conversation,
      ctx,
      `<b>Step 3/7</b> — How do you read MACD signals?`,
      ["crossover", "histogram", "both"]
    );
    macdSignalType = macdAnswer as typeof macdSignalType;
  }

  // ── Step 4: Moving averages ─────────────────────────────────────────────
  let maPeriods: number[] = [50, 200];
  let maCondition: StrategyProfile["movingAverages"]["condition"] = "price_above_all";

  if (indicators.includes("MA")) {
    const maPeriodsRaw = await ask(
      conversation,
      ctx,
      `<b>Step 4/7</b> — Which MA periods do you use?\n\nType them separated by commas (e.g. <code>50, 200</code>)`
    );
    maPeriods = parseNumbers(maPeriodsRaw);
    if (maPeriods.length === 0) maPeriods = [50, 200];

    const maConditionAnswer = await askWithOptions(
      conversation,
      ctx,
      `How do you use these MAs as a filter?`,
      ["price_above_all", "price_above_any", "ma_cross"]
    );
    maCondition = maConditionAnswer as typeof maCondition;
  }

  // ── Step 5: Leverage ────────────────────────────────────────────────────
  const leverageRaw = await ask(
    conversation,
    ctx,
    [
      `<b>Step 5/7</b> — What's your preferred leverage range?`,
      ``,
      `Type min and max separated by a dash, e.g. <code>3-5</code>`,
      `or just a single number like <code>4</code> for fixed leverage.`,
    ].join("\n")
  );

  let leverageMin = 3;
  let leverageMax = 5;

  if (leverageRaw.includes("-")) {
    const parts = leverageRaw.split("-").map((s) => parseInt(s.trim()));
    leverageMin = parts[0] || 3;
    leverageMax = parts[1] || leverageMin + 2;
  } else {
    const single = parseInt(leverageRaw);
    if (!isNaN(single)) {
      leverageMin = single;
      leverageMax = single;
    }
  }

  // ── Step 6: Stop-loss method ────────────────────────────────────────────
  const slMethod = await askWithOptions(
    conversation,
    ctx,
    `<b>Step 6/7</b> — How do you size your stop-loss?`,
    [
      "support_zone — below the nearest S/R level",
      "percentage — fixed % from entry",
      "atr — ATR-based distance",
    ]
  );

  let stopLossMethod: StrategyProfile["stopLoss"]["method"] = "support_zone";
  let stopLossPct: number | undefined;

  if (slMethod.startsWith("support_zone")) {
    stopLossMethod = "support_zone";
  } else if (slMethod.startsWith("percentage")) {
    stopLossMethod = "percentage";
    const pctRaw = await ask(
      conversation,
      ctx,
      `What % from entry? (e.g. <code>2.5</code> for 2.5%)`
    );
    stopLossPct = parseFloat(pctRaw) || 2.5;
  } else {
    stopLossMethod = "atr";
  }

  // ── Step 7: Max position size ───────────────────────────────────────────
  const sizeRaw = await ask(
    conversation,
    ctx,
    [
      `<b>Step 7/7</b> — Max collateral per trade in USDC?`,
      ``,
      `This is the amount you're willing to put in per position (not notional).`,
      `e.g. <code>500</code>`,
    ].join("\n")
  );

  const maxPositionUSDC = parseFloat(sizeRaw) || 500;

  // ── Build and save profile ──────────────────────────────────────────────
  const profile: StrategyProfile = {
    indicators,
    rsi: {
      period: rsiPeriod,
      oversoldThreshold: rsiOversold,
      overboughtThreshold: rsiOverbought,
    },
    macd: {
      signalType: macdSignalType,
    },
    movingAverages: {
      periods: maPeriods,
      condition: maCondition,
    },
    leverage: {
      min: leverageMin,
      max: leverageMax,
    },
    stopLoss: {
      method: stopLossMethod,
      ...(stopLossPct !== undefined && { percentage: stopLossPct }),
    },
    maxPositionUSDC,
    updatedAt: new Date().toISOString(),
  };

  saveProfile(profile);

  // ── Confirm ─────────────────────────────────────────────────────────────
  await ctx.reply(
    [
      `✅ <b>Strategy profile saved.</b>`,
      ``,
      formatProfile(profile),
      ``,
      `Stratex will now monitor markets against this method and alert you when a high-conviction setup appears.`,
      ``,
      `Use /strategy to review or /setup to update at any time.`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
}
