import { Bot, Context, InlineKeyboard } from "grammy";
import { loadProfile, formatProfile, hasProfile, saveWallet, loadWallet } from "./store";
import { formatProposalCard, proposalKeyboard, formatPositionsList } from "./proposal";
import { TradeProposal, ActivePosition, PriceAlert } from "./types";

export const pendingProposals = new Map<string, TradeProposal>();
export const proposalHistory: Array<{ id: string; decision: "approved" | "rejected"; at: string }> = [];

// Open to all users — each gets their own strategy profile via /setup.
export function isAuthorized(_ctx: Context): boolean {
  return true;
}

const ENGINE_BASE = `http://${process.env.ENGINE_INTERNAL_HOST ?? "localhost"}:${process.env.STRATEGY_ENGINE_PORT ?? "3000"}`;

export function registerHandlers(bot: Bot<Context>): void {

  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    const hasStrat = hasProfile(userId);
    const name = ctx.from?.first_name ?? "trader";

    await ctx.reply(
      [
        `⚡ <b>Stratex — Personal Alpha Engine</b>`,
        ``,
        `Hey ${name}! Your 24/7 strategy execution agent on Avantis perps.`,
        ``,
        hasStrat
          ? `Your strategy profile is active. I'm watching BTC, ETH, and SOL for setups.`
          : `You haven't set up your strategy yet. Run /setup to onboard your TA method.`,
        ``,
        `<b>Commands</b>`,
        `/setup — onboard or update your strategy`,
        `/strategy — view your current strategy profile`,
        `/wallet — link your wallet address for position monitoring`,
        `/alert — set a price alert (e.g. /alert BTC-USD above 65000)`,
        `/positions — view open positions`,
        `/help — command list`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        `<b>Stratex Commands</b>`,
        ``,
        `/setup — run the strategy onboarding wizard`,
        `/strategy — view your saved strategy profile`,
        `/wallet 0xYourAddress — link your wallet for liquidation monitoring`,
        `/alert PAIR above|below PRICE — get pinged when price crosses a level`,
        `  e.g. <code>/alert BTC-USD above 65000</code>`,
        `/positions — list your active Avantis positions`,
        `/cancel — cancel the current wizard`,
        ``,
        `Trade proposals arrive automatically when the signal engine detects confluence.`,
        `You approve or reject each trade — your keys never leave your device.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  bot.command("strategy", async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    const profile = loadProfile(userId);
    if (!profile) {
      await ctx.reply(`No strategy profile found. Run /setup to create one.`);
      return;
    }
    await ctx.reply(formatProfile(profile), { parse_mode: "HTML" });
  });

  // ── /wallet — link a wallet address for position/liquidation monitoring ────
  bot.command("wallet", async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    const arg = ctx.match?.toString().trim();

    if (!arg) {
      const current = loadWallet(userId);
      await ctx.reply(
        current
          ? `Your linked wallet: <code>${current}</code>\n\nSend <code>/wallet 0xNewAddress</code> to update it.`
          : `No wallet linked yet. Send <code>/wallet 0xYourAddress</code> to link one.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(arg)) {
      await ctx.reply(`⚠️ That doesn't look like a valid EVM address. Expected format: <code>0x...</code> (42 chars).`, { parse_mode: "HTML" });
      return;
    }

    saveWallet(userId, arg);
    await ctx.reply(`✅ Wallet linked: <code>${arg}</code>\n\nStratex will now monitor this address for open Avantis positions and warn you before liquidation.`, { parse_mode: "HTML" });
  });

  // ── /alert — set a one-shot price alert, forwarded to the strategy engine ──
  bot.command("alert", async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    const raw = ctx.match?.toString().trim() ?? "";
    const parts = raw.split(/\s+/);

    if (parts.length !== 3 || !["above", "below"].includes(parts[1].toLowerCase())) {
      await ctx.reply(
        `Usage: <code>/alert PAIR above|below PRICE</code>\ne.g. <code>/alert BTC-USD above 65000</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const [pairRaw, dirRaw, priceRaw] = parts;
    const pair = pairRaw.toUpperCase();
    const direction = dirRaw.toLowerCase() as "above" | "below";
    const targetPrice = parseFloat(priceRaw);

    if (isNaN(targetPrice) || targetPrice <= 0) {
      await ctx.reply(`⚠️ Invalid price: <code>${priceRaw}</code>`, { parse_mode: "HTML" });
      return;
    }

    const alert: PriceAlert = { userId, pair, direction, targetPrice };

    try {
      const res = await fetch(`${ENGINE_BASE}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alert),
      });
      if (!res.ok) throw new Error(`Engine returned ${res.status}`);
      await ctx.reply(
        `🔔 Alert set: <b>${pair}</b> ${direction} <b>$${targetPrice.toLocaleString()}</b>. I'll ping you when it crosses.`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await ctx.reply(`⚠️ Could not reach the strategy engine to set the alert.\n\n<code>${err}</code>`, { parse_mode: "HTML" });
    }
  });

  bot.command("positions", async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    const wallet = loadWallet(userId);

    if (!wallet) {
      await ctx.reply(`No wallet linked. Run <code>/wallet 0xYourAddress</code> first.`, { parse_mode: "HTML" });
      return;
    }

    await ctx.reply(`⏳ Fetching your open positions from Avantis...`);
    try {
      const positions = await fetchPositions(wallet);
      await ctx.reply(formatPositionsList(positions), { parse_mode: "HTML" });
    } catch (err) {
      await ctx.reply(
        `⚠️ Could not reach the strategy engine.\n\n<code>${err}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // APPROVE trade
  bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
    const proposalId = ctx.match[1];
    const proposal = pendingProposals.get(proposalId);
    if (!proposal) {
      await ctx.answerCallbackQuery({ text: "This proposal has already been handled." });
      return;
    }
    pendingProposals.delete(proposalId);
    proposalHistory.push({ id: proposalId, decision: "approved", at: new Date().toISOString() });
    await ctx.answerCallbackQuery({ text: "✅ Approved — sending to Avantis..." });
    await notifyExecution(proposal, "approved");
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    await ctx.reply(
      [
        `✅ <b>Trade approved — executing on Avantis</b>`,
        ``,
        `${proposal.direction} ${proposal.pair} @ $${proposal.entryPrice.toLocaleString()}`,
        `${proposal.leverage}x  ·  $${proposal.collateralUSDC} USDC collateral`,
        ``,
        `The Aomi agent is signing and submitting the transaction to Base.`,
        `You'll receive a confirmation once the position is open.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  // REJECT trade
  bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
    const proposalId = ctx.match[1];
    const proposal = pendingProposals.get(proposalId);
    if (!proposal) {
      await ctx.answerCallbackQuery({ text: "This proposal has already been handled." });
      return;
    }
    pendingProposals.delete(proposalId);
    proposalHistory.push({ id: proposalId, decision: "rejected", at: new Date().toISOString() });
    await ctx.answerCallbackQuery({ text: "❌ Rejected." });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    await ctx.reply(`❌ Trade rejected. Continuing to monitor.`);
  });

  // CLOSE position
  bot.callbackQuery(/^close:(.+)$/, async (ctx) => {
    const positionId = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "Closing position..." });
    await notifyClose(positionId);
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    await ctx.reply(
      `🚪 Close order submitted for position <code>${positionId}</code>.`,
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery(/^dismiss_warning:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Dismissed." });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  });
}

export async function sendProposal(
  bot: Bot<Context>,
  chatId: number,
  proposal: TradeProposal
): Promise<void> {
  pendingProposals.set(proposal.id, proposal);
  await bot.api.sendMessage(chatId, formatProposalCard(proposal), {
    parse_mode: "HTML",
    reply_markup: proposalKeyboard(proposal.id),
  });
}

async function fetchPositions(wallet: string): Promise<ActivePosition[]> {
  const res = await fetch(`${ENGINE_BASE}/positions?wallet=${wallet}`);
  if (!res.ok) throw new Error(`Engine returned ${res.status}`);
  return res.json() as Promise<ActivePosition[]>;
}

async function notifyExecution(proposal: TradeProposal, decision: "approved" | "rejected"): Promise<void> {
  try {
    await fetch(`${ENGINE_BASE}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, decision, proposal }),
    });
  } catch {
    console.warn(`[bot] Could not notify strategy engine of decision for ${proposal.id}`);
  }
}

async function notifyClose(positionId: string): Promise<void> {
  try {
    await fetch(`${ENGINE_BASE}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
    });
  } catch {
    console.warn(`[bot] Could not notify strategy engine to close ${positionId}`);
  }
}
