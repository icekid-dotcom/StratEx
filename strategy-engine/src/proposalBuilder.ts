import { randomUUID } from "crypto";
import axios from "axios";
import { ConfluenceResult, SizedPosition, SimulationResult } from "./types";

// Was hardcoded to "stratex.railway.internal" — only resolved if the bot's
// Railway service was literally named "stratex". Now configurable via env so
// it matches whatever the bot service is actually named on Railway.
const BOT_INTERNAL_URL =
  process.env.BOT_INTERNAL_URL ?? "http://stratex-bot.railway.internal:3001";
const BOT_PROPOSAL_URL = `${BOT_INTERNAL_URL}/proposal`;

export interface TradeProposal {
  id: string;
  userId: number;
  pair: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  leverage: number;
  collateralUSDC: number;
  notionalUSDC: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
  simulation: SimulationResult;
  confluence: Array<{ indicator: string; value: string; passed: boolean }>;
  detectedAt: string;
}

export function buildProposal(
  userId: number,
  pair: string,
  confluence: ConfluenceResult,
  position: SizedPosition,
  simulation: SimulationResult
): TradeProposal {
  return {
    id: randomUUID(),
    userId,
    pair,
    direction: position.direction,
    entryPrice: position.entryPrice,
    leverage: position.leverage,
    collateralUSDC: position.collateralUSDC,
    notionalUSDC: position.notionalUSDC,
    stopLossPrice: position.stopLossPrice,
    takeProfitPrice: position.takeProfitPrice,
    stopLossPct: position.stopLossPct,
    takeProfitPct: position.takeProfitPct,
    simulation,
    confluence: confluence.checks,
    detectedAt: new Date().toISOString(),
  };
}

export async function sendProposalToBot(proposal: TradeProposal): Promise<void> {
  try {
    const res = await axios.post(BOT_PROPOSAL_URL, proposal, {
      timeout: 5_000,
      headers: { "Content-Type": "application/json" },
    });
    console.log(`[engine] Proposal ${proposal.id} sent to user ${proposal.userId} → ${res.status}`);
  } catch (err) {
    console.error(`[engine] Failed to send proposal to bot:`, err);
    throw err;
  }
}
