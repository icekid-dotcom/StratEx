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
import { formatLiquidationWarning, closePositionKeyboard } from "./proposal";
import { TradeProposal, ActivePosition } from "./types";

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

// Register the onboarding wizard as a named conversation
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

// Register all other handlers (start, strategy, positions, callbacks)
registerHandlers(bot as unknown as Bot<Context>);

// ── Error handler ─────────────────────────────────────────────────────────────

bot.catch((err) => {
  console.error("[stratex bot error]", err.message, err.ctx?.update);
});

// ─── HTTP server — receives proposals from the strategy engine ────────────────
//
// The Node.js strategy engine POSTs to this server when it detects a signal.
// Two endpoints:
//   POST /proposal      → push a trade proposal card to the user
//   POST /liquidation   → push a liquidation warning to the user

const PROPOSAL_PORT = parseInt(process.env.PROPOSAL_PORT ?? "3001");
const AUTHORIZED_CHAT_ID = parseInt(process.env.AUTHORIZED_USER_ID ?? "0");

const httpServer = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  // Read body
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

    if (!proposal.id || !proposal.pair || !proposal.direction) {
      res.writeHead(422);
      res.end("Missing required proposal fields");
      return;
    }

    if (AUTHORIZED_CHAT_ID === 0) {
      console.warn(
        "[stratex] AUTHORIZED_USER_ID not set — cannot push proposal. Set it in .env"
      );
      res.writeHead(500);
      res.end("AUTHORIZED_USER_ID not configured");
      return;
    }

    try {
      await sendProposal(bot as unknown as Bot<Context>, AUTHORIZED_CHAT_ID, proposal);
      console.log(`[stratex] Proposal ${proposal.id} pushed to Telegram`);
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

    if (!position.positionId || !position.pair) {
      res.writeHead(422);
      res.end("Missing required position fields");
      return;
    }

    if (AUTHORIZED_CHAT_ID === 0) {
      res.writeHead(500);
      res.end("AUTHORIZED_USER_ID not configured");
      return;
    }

    try {
      await bot.api.sendMessage(
        AUTHORIZED_CHAT_ID,
        formatLiquidationWarning(position),
        {
          parse_mode: "HTML",
          reply_markup: closePositionKeyboard(position.positionId),
        }
      );
      console.log(`[stratex] Liquidation warning sent for ${position.positionId}`);
      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      console.error("[stratex] Failed to send liquidation warning:", err);
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
  // Start the HTTP server first
  await new Promise<void>((resolve) => {
    httpServer.listen(PROPOSAL_PORT, () => {
      console.log(`[stratex] Proposal listener running on port ${PROPOSAL_PORT}`);
      resolve();
    });
  });

  // Set bot commands so they show up in the Telegram UI
  await bot.api.setMyCommands([
    { command: "start",    description: "Welcome and status" },
    { command: "setup",    description: "Onboard or update your TA strategy" },
    { command: "strategy", description: "View your current strategy profile" },
    { command: "positions",description: "View your open Avantis positions" },
    { command: "cancel",   description: "Cancel the current wizard" },
    { command: "help",     description: "Show all commands" },
  ]);

  // Start polling
  await bot.start({
    onStart: (info) => {
      console.log(`[stratex] Bot running as @${info.username}`);
      console.log(`[stratex] Authorized user ID: ${AUTHORIZED_CHAT_ID || "OPEN (dev mode)"}`);
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
