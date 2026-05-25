import express from "express";
import { TradeProposal } from "./proposalBuilder";

const app = express();
app.use(express.json());

// Tracks pending executions — in production this would hit the Rust backend
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
  console.log(`  ${proposal.direction} ${proposal.pair} @ $${proposal.entryPrice} ${proposal.leverage}x`);

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

// ── GET /positions — bot fetches active positions ─────────────────────────────
app.get("/positions", (_req, res) => {
  // TODO: call Rust backend get_positions tool
  // For MVP return empty array — positions come from Avantis via Rust layer
  console.log(`[engine] /positions requested`);
  res.json([]);
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
