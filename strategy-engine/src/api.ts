import express from "express";
import { TradeProposal } from "./proposalBuilder";
import { addAlert } from "./alerts";
import { getPositionsForWallet } from "./positionMonitor";
import { PriceAlert } from "./types";

const app = express();
app.use(express.json());

const executionLog: Array<{
  proposalId: string;
  decision: string;
  at: string;
}> = [];

// ── POST /execute — bot approved or rejected a trade ─────────────────────────
app.post("/execute", (req, res) => {
  const { proposalId, decision, proposal } = req.body as {
    proposalId: string;
    decision: "approved" | "rejected";
    proposal: TradeProposal;
  };

  console.log(`[engine] /execute → ${decision.toUpperCase()} for ${proposalId}`);
  console.log(`  ${proposal.direction} ${proposal.pair} @ $${proposal.entryPrice} ${proposal.leverage}x (user ${proposal.userId})`);

  executionLog.push({ proposalId, decision, at: new Date().toISOString() });

  if (decision === "approved") {
    // TODO: call Rust backend to submit tx to Avantis
    console.log(`[engine] → Forwarding to Rust agent for Avantis execution...`);
  }

  res.json({ ok: true, proposalId, decision });
});

// ── POST /close — bot requested a position close ──────────────────────────────
app.post("/close", (req, res) => {
  const { positionId } = req.body as { positionId: string };
  console.log(`[engine] /close → position ${positionId}`);
  // TODO: call Rust backend exit_position tool
  res.json({ ok: true, positionId });
});

// ── GET /positions?wallet=0x... — bot fetches active positions for a user ────
app.get("/positions", async (req, res) => {
  const wallet = req.query.wallet as string | undefined;
  if (!wallet) {
    res.json([]);
    return;
  }
  console.log(`[engine] /positions requested for ${wallet}`);
  const positions = await getPositionsForWallet(wallet);
  res.json(positions);
});

// ── POST /alerts — bot forwards a user's /alert command here ─────────────────
app.post("/alerts", (req, res) => {
  const alert = req.body as PriceAlert;
  if (!alert.userId || !alert.pair || !alert.direction || !alert.targetPrice) {
    res.status(422).send("Missing required alert fields");
    return;
  }
  addAlert({ ...alert, createdAt: new Date().toISOString() });
  console.log(`[engine] Alert stored — user ${alert.userId}: ${alert.pair} ${alert.direction} ${alert.targetPrice}`);
  res.json({ ok: true });
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), executions: executionLog.length });
});

export function startApiServer(port: number): void {
  app.listen(port, () => {
    console.log(`[engine] API server running on port ${port}`);
  });
}
