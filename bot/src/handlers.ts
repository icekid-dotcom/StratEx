import { Bot, Context, InlineKeyboard } from "grammy";
import { loadProfile, formatProfile, hasProfile } from "./store";
import { formatProposalCard, proposalKeyboard, formatPositionsList } from "./proposal";
import { TradeProposal, ActivePosition } from "./types";

// In-memory pending proposals map — keyed by proposal ID
// In production you'd persist this, but for the hackathon in-memory is fine
export const pendingProposals = new Map<string, TradeProposal>();

// Approved/rejected proposal audit trail
export const proposalHistory: Array<{
  id: string;
  decision: "approved" | "rejected";
  at: string;
}> = [];

// ─── Auth guard ───────────────────────────────────────────────────────────────

export function isAuthorized(ctx: Context): boolean {
  const authorizedId = parseInt(process.env.AUTHORIZED_USER_ID ?? "0");
  if (authorizedId === 0) return true; // not set → open (dev mode)
  return ctx.from?.id === authorizedId;
}

// ─── Register all handlers ────────────────────────────────────────────────────

export function registerHandlers(bot: Bot<Context>): void {

  // /start
  bot.command("start", async (ctx) => {
    if (!isAuthorized(ctx)) return;

    const hasStrat = hasProfile();
    await ctx.reply(
      [
        `⚡ <b>Stratex — Personal Alpha Engine</b>`,
        ``,
        `Your 24/7 strategy execution agent on Avantis perps.`,
        ``,
        hasStrat
          ? `Your strategy profile is active. I'm watching the markets.`
          : `You haven't set up your strategy yet. Run /setup to onboard your TA method.`,
        ``,
        `<b>Commands</b>`,
        `/setup — onboard or update your strategy`,
        `/strategy — view your current strategy profile`,
        `/positions — view open positions`,
        `/help — command list`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  // /help
  bot.command("help", async (ctx) => {
    if (!isAuthorized(ctx)) return;

    await ctx.reply(
      [
        `<b>Stratex Commands</b>`,
        ``,
        `/setup — run the strategy onboarding wizard`,
        `/strategy — view your saved strategy profile`,
        `/positions — list your active Avantis positions`,
        `/cancel — cancel the current wizard`,
        ``,
        `Trade proposals arrive automatically when the signal engine detects confluence.`,
        `You approve or reject each trade — your keys never leave your device.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  // /strategy
  bot.command("strategy", async (ctx) => {
    if (!isAuthorized(ctx)) return;

    const profile = loadProfile();
    if (!profile) {
      await ctx.reply(
        `No strategy profile found. Run /setup to create one.`
      );
      return;
    }

    await ctx.reply(formatProfile(profile), { parse_mode: "HTML" });
  });

  // /positions — calls out to the strategy engine's position endpoint
  // For the hackathon, returns mock data if the engine isn't running
  bot.command("positions", async (ctx) => {
    if (!isAuthorized(ctx)) return;

    await ctx.reply(`⏳ Fetching your open positions from Avantis...`);

    try {
      const positions = await fetchPositions();
      await ctx.reply(formatPositionsList(positions), { parse_mode: "HTML" });
    } catch (err) {
      await ctx.reply(
        `⚠️ Could not reach the strategy engine. Make sure it's running.\n\n<code>${err}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // ── Callback queries (inline keyboard buttons) ────────────────────────────

  // APPROVE trade
  bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
    if (!isAuthorized(ctx)) return;

    const proposalId = ctx.match[1];
    const proposal = pendingProposals.get(proposalId);

    if (!proposal) {
      await ctx.answerCallbackQuery({ text: "This proposal has already been handled." });
      return;
    }

    // Remove from pending
    pendingProposals.delete(proposalId);
    proposalHistory.push({ id: proposalId, decision: "approved", at: new Date().toISOString() });

    await ctx.answerCallbackQuery({ text: "✅ Approved — sending to Avantis..." });

    // Notify the strategy engine to execute
    await notifyExecution(proposal, "approved");

    // Edit the message to show approved state
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
    if (!isAuthorized(ctx)) return;

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
    if (!isAuthorized(ctx)) return;

    const positionId = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "Closing position..." });
    await notifyClose(positionId);

    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    await ctx.reply(
      `🚪 Close order submitted for position <code>${positionId}</code>.\n\nThe agent will confirm once the tx is settled.`,
      { parse_mode: "HTML" }
    );
  });

  // Dismiss liquidation warning
  bot.callbackQuery(/^dismiss_warning:(.+)$/, async (ctx) => {
    if (!isAuthorized(ctx)) return;
    await ctx.answerCallbackQuery({ text: "Dismissed." });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  });
}

// ─── Send a proposal card to the user ────────────────────────────────────────

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

// ─── Internal calls to the strategy engine ───────────────────────────────────

const ENGINE_BASE = `http://localhost:${process.env.STRATEGY_ENGINE_PORT ?? "3000"}`;

async function fetchPositions(): Promise<ActivePosition[]> {
  const res = await fetch(`${ENGINE_BASE}/positions`);
  if (!res.ok) throw new Error(`Engine returned ${res.status}`);
  return res.json() as Promise<ActivePosition[]>;
}

async function notifyExecution(
  proposal: TradeProposal,
  decision: "approved" | "rejected"
): Promise<void> {
  try {
    await fetch(`${ENGINE_BASE}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, decision, proposal }),
    });
  } catch {
    // Strategy engine might not be running in dev — log and continue
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
