import { randomUUID } from "crypto";
import axios from "axios";
import { ConfluenceResult, SizedPosition, SimulationResult } from "./types";

const BOT_PORT = process.env.BOT_PROPOSAL_PORT ?? "3001";
const BOT_URL = `http://localhost:${BOT_PORT}/proposal`;

export interface TradeProposal {
  id: string;
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
  pair: string,
  confluence: ConfluenceResult,
  position: SizedPosition,
  simulation: SimulationResult
): TradeProposal {
  return {
    id: randomUUID(),
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
    const res = await axios.post(BOT_URL, proposal, {
      timeout: 5_000,
      headers: { "Content-Type": "application/json" },
    });
    console.log(`[engine] Proposal ${proposal.id} sent to bot → ${res.status}`);
  } catch (err) {
    console.error(`[engine] Failed to send proposal to bot:`, err);
    throw err;
  }
}
