import { InlineKeyboard } from "grammy";
import { TradeProposal, ActivePosition, TriggeredAlert } from "./types";

// ─── Trade Proposal Card ─────────────────────────────────────────────────────

export function formatProposalCard(p: TradeProposal): string {
  const dirEmoji = p.direction === "LONG" ? "🟢" : "🔴";
  const fundingSign = p.simulation.funding8h >= 0 ? "+" : "";
  const pnlTPSign = p.simulation.estimatedPnlTP >= 0 ? "+" : "";

  const confluenceLines = p.confluence
    .map((c) => `${c.passed ? "✅" : "❌"} ${c.indicator}: ${c.value}`)
    .join("\n");

  return [
    `${dirEmoji} <b>TRADE PROPOSAL — ${p.pair}</b>`,
    ``,
    `<b>Direction:</b>   ${p.direction}`,
    `<b>Entry:</b>       $${fmt(p.entryPrice)}`,
    `<b>Leverage:</b>    ${p.leverage}x`,
    `<b>Collateral:</b>  $${fmt(p.collateralUSDC)} USDC`,
    `<b>Notional:</b>    $${fmt(p.notionalUSDC)} USDC`,
    ``,
    `<b>Stop-Loss:</b>   $${fmt(p.stopLossPrice)}  <i>(${p.stopLossPct.toFixed(1)}% from entry)</i>`,
    `<b>Take-Profit:</b> $${fmt(p.takeProfitPrice)}  <i>(${p.takeProfitPct.toFixed(1)}% upside)</i>`,
    ``,
    `📊 <b>Simulation (Anvil fork)</b>`,
    `Est. PnL @ TP:    ${pnlTPSign}$${fmt(Math.abs(p.simulation.estimatedPnlTP))}`,
    `Est. PnL @ SL:    -$${fmt(Math.abs(p.simulation.estimatedPnlSL))}`,
    `Liquidation:      $${fmt(p.simulation.liquidationPrice)}`,
    `Funding (8h):     ${fundingSign}$${Math.abs(p.simulation.funding8h).toFixed(4)}`,
    `Gas est.:         ~$${p.simulation.gasEstimateUSD.toFixed(3)}`,
    ``,
    `🔍 <b>Signal Confluence</b>`,
    confluenceLines,
    ``,
    `<i>Signal detected: ${new Date(p.detectedAt).toUTCString()}</i>`,
  ].join("\n");
}

export function proposalKeyboard(proposalId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅  APPROVE", `approve:${proposalId}`)
    .text("❌  REJECT", `reject:${proposalId}`);
}

// ─── Positions List ──────────────────────────────────────────────────────────

export function formatPositionsList(positions: ActivePosition[]): string {
  if (positions.length === 0) {
    return "📭 <b>No open positions.</b>";
  }

  const cards = positions.map((pos) => {
    const dirEmoji = pos.direction === "LONG" ? "🟢" : "🔴";
    const pnlSign = pos.unrealizedPnl >= 0 ? "+" : "";
    const marginWarning = pos.marginRatio < 0.15 ? " ⚠️ LOW MARGIN" : "";

    return [
      `${dirEmoji} <b>${pos.pair}</b> ${pos.direction} @ $${fmt(pos.entryPrice)}${marginWarning}`,
      `Current: $${fmt(pos.currentPrice)}  |  ${pos.leverage}x`,
      `Unrealized PnL: ${pnlSign}$${fmt(Math.abs(pos.unrealizedPnl))}`,
      `Margin ratio: ${(pos.marginRatio * 100).toFixed(1)}%  |  Liq: $${fmt(pos.liquidationPrice)}`,
    ].join("\n");
  });

  return `📂 <b>Open Positions (${positions.length})</b>\n\n` + cards.join("\n\n─────────────\n\n");
}

// ─── Liquidation Warning ─────────────────────────────────────────────────────

export function formatLiquidationWarning(pos: ActivePosition): string {
  return [
    `⚠️ <b>LIQUIDATION WARNING — ${pos.pair}</b>`,
    ``,
    `Your ${pos.direction} position is approaching liquidation.`,
    `Margin ratio: <b>${(pos.marginRatio * 100).toFixed(1)}%</b>`,
    `Liquidation price: <b>$${fmt(pos.liquidationPrice)}</b>`,
    `Current price: $${fmt(pos.currentPrice)}`,
    ``,
    `Consider closing or adding margin to protect your position.`,
  ].join("\n");
}

export function closePositionKeyboard(positionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚪 Close Position", `close:${positionId}`)
    .text("Dismiss", `dismiss_warning:${positionId}`);
}

// ─── Price Alert Triggered ────────────────────────────────────────────────────

export function formatAlertTriggered(a: TriggeredAlert): string {
  const arrow = a.direction === "above" ? "📈" : "📉";
  return [
    `${arrow} <b>PRICE ALERT — ${a.pair}</b>`,
    ``,
    `Price moved ${a.direction} your target of $${fmt(a.targetPrice)}.`,
    `Current price: <b>$${fmt(a.currentPrice)}</b>`,
    ``,
    `<i>Triggered: ${new Date(a.triggeredAt).toUTCString()}</i>`,
  ].join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
