import { Conversation } from "@grammyjs/conversations";
import { Context } from "grammy";
import { StrategyProfile } from "./store";
import { saveProfile, formatProfile } from "./store";

async function ask(conversation: Conversation<Context>, ctx: Context, question: string): Promise<string> {
  await ctx.reply(question, { parse_mode: "HTML" });
  const reply = await conversation.waitFor("message:text");
  return reply.message.text.trim();
}

async function askWithOptions(conversation: Conversation<Context>, ctx: Context, question: string, options: string[]): Promise<string> {
  const optionList = options.map((o, i) => `  <b>${i + 1}.</b> ${o}`).join("\n");
  await ctx.reply(`${question}\n\n${optionList}`, { parse_mode: "HTML" });
  while (true) {
    const reply = await conversation.waitFor("message:text");
    const input = reply.message.text.trim();
    const idx = parseInt(input) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];
    const match = options.find((o) => o.toLowerCase().startsWith(input.toLowerCase()));
    if (match) return match;
    await ctx.reply(`⚠️ Please reply with a number (1–${options.length}) or the option text.`);
  }
}

function parseNumbers(input: string): number[] {
  return input.split(/[\s,]+/).map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n > 0);
}

export async function onboardingConversation(conversation: Conversation<Context>, ctx: Context): Promise<void> {
  const userId = ctx.from?.id ?? 0;

  await ctx.reply(
    [`👋 <b>Welcome to Stratex onboarding.</b>`, ``, `I'll learn your TA method in a few questions. This takes ~2 minutes.`, `Type /cancel at any time to stop.`].join("\n"),
    { parse_mode: "HTML" }
  );

  // Step 1: Indicators
  const indicatorAnswer = await askWithOptions(conversation, ctx, `<b>Step 1/7</b> — Which indicators are core to your entries?`, [
    "RSI + MACD + MA", "RSI + MACD only", "RSI + MA only", "MACD + MA only", "RSI only",
  ]);
  const indicators: string[] = [];
  if (indicatorAnswer.includes("RSI")) indicators.push("RSI");
  if (indicatorAnswer.includes("MACD")) indicators.push("MACD");
  if (indicatorAnswer.includes("MA")) indicators.push("MA");

  // Step 2: RSI
  let rsiPeriod = 14, rsiOversold = 30, rsiOverbought = 70;
  if (indicators.includes("RSI")) {
    rsiPeriod = parseInt(await ask(conversation, ctx, `<b>Step 2/7</b> — RSI period? (default: <b>14</b>)`)) || 14;
    rsiOversold = parseInt(await ask(conversation, ctx, `Oversold threshold for <b>long entries</b>? (default: <b>30</b>)`)) || 30;
    rsiOverbought = parseInt(await ask(conversation, ctx, `Overbought threshold for <b>short entries</b>? (default: <b>70</b>)`)) || 70;
  }

  // Step 3: MACD
  let macdSignalType: StrategyProfile["macd"]["signalType"] = "crossover";
  if (indicators.includes("MACD")) {
    const macdAnswer = await askWithOptions(conversation, ctx, `<b>Step 3/7</b> — How do you read MACD signals?`, ["crossover", "histogram", "both"]);
    macdSignalType = macdAnswer as typeof macdSignalType;
  }

  // Step 4: MA
  let maPeriods = [50, 200];
  let maCondition: StrategyProfile["movingAverages"]["condition"] = "price_above_all";
  if (indicators.includes("MA")) {
    const raw = await ask(conversation, ctx, `<b>Step 4/7</b> — MA periods? (e.g. <code>50, 200</code>)`);
    maPeriods = parseNumbers(raw);
    if (maPeriods.length === 0) maPeriods = [50, 200];
    const cond = await askWithOptions(conversation, ctx, `How do you use these MAs?`, ["price_above_all", "price_above_any", "ma_cross"]);
    maCondition = cond as typeof maCondition;
  }

  // Step 5: Leverage
  const leverageRaw = await ask(conversation, ctx, `<b>Step 5/7</b> — Leverage range? (e.g. <code>3-5</code> or <code>4</code>)`);
  let leverageMin = 3, leverageMax = 5;
  if (leverageRaw.includes("-")) {
    const parts = leverageRaw.split("-").map((s) => parseInt(s.trim()));
    leverageMin = parts[0] || 3;
    leverageMax = parts[1] || leverageMin + 2;
  } else {
    const single = parseInt(leverageRaw);
    if (!isNaN(single)) { leverageMin = single; leverageMax = single; }
  }

  // Step 6: Stop-loss
  const slMethod = await askWithOptions(conversation, ctx, `<b>Step 6/7</b> — Stop-loss method?`, [
    "support_zone — below nearest S/R level", "percentage — fixed % from entry", "atr — ATR-based",
  ]);
  let stopLossMethod: StrategyProfile["stopLoss"]["method"] = "support_zone";
  let stopLossPct: number | undefined;
  if (slMethod.startsWith("support_zone")) { stopLossMethod = "support_zone"; }
  else if (slMethod.startsWith("percentage")) {
    stopLossMethod = "percentage";
    stopLossPct = parseFloat(await ask(conversation, ctx, `What % from entry? (e.g. <code>2.5</code>)`)) || 2.5;
  } else { stopLossMethod = "atr"; }

  // Step 7: Position size
  const maxPositionUSDC = parseFloat(await ask(conversation, ctx, `<b>Step 7/7</b> — Max collateral per trade in USDC? (e.g. <code>500</code>)`)) || 500;

  const profile: StrategyProfile = {
    indicators, rsi: { period: rsiPeriod, oversoldThreshold: rsiOversold, overboughtThreshold: rsiOverbought },
    macd: { signalType: macdSignalType }, movingAverages: { periods: maPeriods, condition: maCondition },
    leverage: { min: leverageMin, max: leverageMax },
    stopLoss: { method: stopLossMethod, ...(stopLossPct !== undefined && { percentage: stopLossPct }) },
    maxPositionUSDC, updatedAt: new Date().toISOString(),
  };

  saveProfile(userId, profile);

  await ctx.reply(
    [`✅ <b>Strategy profile saved.</b>`, ``, formatProfile(profile), ``, `Stratex will now monitor BTC, ETH, and SOL against your method.`, ``, `Use /strategy to review or /setup to update at any time.`].join("\n"),
    { parse_mode: "HTML" }
  );
}
