import "dotenv/config";
import http from "http";
import { Bot, Context, session, SessionFlavor } from "grammy";
import {
  conversations,
  createConversation,
  ConversationFlavor,
} from "@grammyjs/conversations";

import { onboardingConversation } from "./onboarding";
import { registerHandlers, sendProposal, isAuthorized } from "./handlers";
import { formatLiquidationWarning, closePositionKeyboard, formatAlertTriggered } from "./proposal";
import { listUserIds, loadProfile, loadWallet } from "./store";
import { TradeProposal, ActivePosition, TriggeredAlert } from "./types";

// ─── Session + Context types ──────────────────────────────────────────────────

interface SessionData {}
type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;

// ─── Bot init ─────────────────────────────────────────────────────────────────

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("[stratex] BOT_TOKEN is not set. Add it to your .env file.");
  process.exit(1);
}

const bot = new Bot<BotContext>(token);

// ── Middleware ────────────────────────────────────────────────────────────────

bot.use(session({ initial: (): SessionData => ({}) }));
bot.use(conversations());
bot.use(createConversation(onboardingConversation, "onboarding"));

// ── Commands ──────────────────────────────────────────────────────────────────

bot.command("setup", async (ctx) => {
  if (!isAuthorized(ctx)) return;
  await ctx.conversation.enter("onboarding");
});

bot.command("cancel", async (ctx) => {
  if (!isAuthorized(ctx)) return;
  await ctx.conversation.exit();
  await ctx.reply("Cancelled.");
});

registerHandlers(bot as unknown as Bot<Context>);

bot.catch((err) => {
  console.error("[stratex bot error]", err.message, err.ctx?.update);
});

// ─── HTTP server ────────────────────────────────────────────────────────────
//
// Endpoints consumed by the strategy engine:
//   GET  /profiles       → every user's strategy profile + wallet (engine pulls this each poll cycle)
//   POST /proposal       → push a trade proposal to a specific user (body includes userId)
//   POST /liquidation    → push a liquidation warning to a specific user (body includes userId)
//   POST /alert-triggered→ push a price alert notification to a specific user

const PROPOSAL_PORT = parseInt(process.env.PROPOSAL_PORT ?? "3001");

const httpServer = http.createServer(async (req, res) => {
  // ── GET /profiles ───────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/profiles") {
    const bundles = listUserIds()
      .map((userId) => ({
        userId,
        profile: loadProfile(userId),
        walletAddress: loadWallet(userId),
      }))
      .filter((b) => b.profile !== null);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(bundles));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const body = await readBody(req);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400);
    res.end("Invalid JSON");
    return;
  }

  // ── POST /proposal ────────────────────────────────────────────────────────
  if (req.url === "/proposal") {
    const proposal = parsed as TradeProposal;

    if (!proposal.id || !proposal.userId || !proposal.pair || !proposal.direction) {
      res.writeHead(422);
      res.end("Missing required proposal fields (id, userId, pair, direction)");
      return;
    }

    try {
      await sendProposal(bot as unknown as Bot<Context>, proposal.userId, proposal);
      console.log(`[stratex] Proposal ${proposal.id} pushed to user ${proposal.userId}`);
      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      console.error("[stratex] Failed to send proposal:", err);
      res.writeHead(500);
      res.end("Failed to send");
    }
    return;
  }

  // ── POST /liquidation ─────────────────────────────────────────────────────
  if (req.url === "/liquidation") {
    const position = parsed as ActivePosition;

    if (!position.userId || !position.positionId || !position.pair) {
      res.writeHead(422);
      res.end("Missing required position fields (userId, positionId, pair)");
      return;
    }

    try {
      await bot.api.sendMessage(
        position.userId,
        formatLiquidationWarning(position),
        {
          parse_mode: "HTML",
          reply_markup: closePositionKeyboard(position.positionId),
        }
      );
      console.log(`[stratex] Liquidation warning sent to ${position.userId} for ${position.positionId}`);
      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      console.error("[stratex] Failed to send liquidation warning:", err);
      res.writeHead(500);
      res.end("Failed to send");
    }
    return;
  }

  // ── POST /alert-triggered ─────────────────────────────────────────────────
  if (req.url === "/alert-triggered") {
    const alert = parsed as TriggeredAlert;

    if (!alert.userId || !alert.pair) {
      res.writeHead(422);
      res.end("Missing required alert fields (userId, pair)");
      return;
    }

    try {
      await bot.api.sendMessage(alert.userId, formatAlertTriggered(alert), { parse_mode: "HTML" });
      console.log(`[stratex] Alert triggered for user ${alert.userId}: ${alert.pair} ${alert.direction} ${alert.targetPrice}`);
      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      console.error("[stratex] Failed to send alert notification:", err);
      res.writeHead(500);
      res.end("Failed to send");
    }
    return;
  }

  // ── Health check ──────────────────────────────────────────────────────────
  if (req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await new Promise<void>((resolve) => {
    httpServer.listen(PROPOSAL_PORT, () => {
      console.log(`[stratex] Proposal listener running on port ${PROPOSAL_PORT}`);
      resolve();
    });
  });

  await bot.api.setMyCommands([
    { command: "start",    description: "Welcome and status" },
    { command: "setup",    description: "Onboard or update your TA strategy" },
    { command: "strategy", description: "View your current strategy profile" },
    { command: "wallet",   description: "Link your wallet for position monitoring" },
    { command: "alert",    description: "Set a price alert" },
    { command: "positions",description: "View your open Avantis positions" },
    { command: "cancel",   description: "Cancel the current wizard" },
    { command: "help",     description: "Show all commands" },
  ]);

  await bot.start({
    onStart: (info) => {
      console.log(`[stratex] Bot running as @${info.username}`);
      console.log(`[stratex] Multi-user mode — profiles served at GET /profiles`);
    },
  });
}

main().catch((err) => {
  console.error("[stratex] Fatal error:", err);
  process.exit(1);
});

// ─── Util ─────────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
