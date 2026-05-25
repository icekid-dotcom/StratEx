#!/usr/bin/env node
/**
 * stratex/bot/scripts/mock-proposal.js
 *
 * Fires a fake trade proposal at the bot's HTTP listener so you can test
 * the Telegram card without the full strategy engine running.
 *
 * Usage:
 *   node scripts/mock-proposal.js
 *   node scripts/mock-proposal.js liquidation   # send a liquidation warning instead
 */

const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PROPOSAL_PORT || 3001;
const MODE = process.argv[2] || "proposal";

// ─── Mock trade proposal ──────────────────────────────────────────────────────
const PROPOSAL = {
  id: crypto.randomUUID(),
  pair: "BTC-USD",
  direction: "LONG",
  entryPrice: 68_420.5,
  leverage: 4,
  collateralUSDC: 500,
  notionalUSDC: 2000,
  stopLossPrice: 66_730.0,
  takeProfitPrice: 72_100.0,
  stopLossPct: 2.47,
  takeProfitPct: 5.39,
  simulation: {
    estimatedPnlTP: 107.8,
    estimatedPnlSL: -50.3,
    liquidationPrice: 53_218.4,
    funding8h: 0.0312,
    gasEstimateUSD: 0.004,
  },
  confluence: [
    { indicator: "RSI(14)",         value: "27.3 — oversold",         passed: true },
    { indicator: "MACD",            value: "bullish crossover",        passed: true },
    { indicator: "200MA filter",    value: "price above $65,100",      passed: true },
    { indicator: "Demand zone",     value: "$68,100–$68,500",          passed: true },
    { indicator: "Funding rate",    value: "+0.003% (longs favoured)", passed: true },
  ],
  detectedAt: new Date().toISOString(),
};

// ─── Mock liquidation warning ─────────────────────────────────────────────────
const LIQUIDATION = {
  positionId: "pos_abc123",
  pair: "ETH-USD",
  direction: "LONG",
  entryPrice: 3_412.0,
  currentPrice: 3_151.0,
  leverage: 5,
  collateralUSDC: 300,
  unrealizedPnl: -94.5,
  marginRatio: 0.09,
  liquidationPrice: 3_062.0,
  openedAt: new Date(Date.now() - 3600_000).toISOString(),
};

// ─── Fire the request ─────────────────────────────────────────────────────────
const path    = MODE === "liquidation" ? "/liquidation" : "/proposal";
const payload = MODE === "liquidation" ? LIQUIDATION : PROPOSAL;
const body    = JSON.stringify(payload);

const options = {
  hostname: "localhost",
  port: PORT,
  path,
  method: "POST",
  headers: {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(body),
  },
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    console.log(`[mock] ${path} → ${res.statusCode} ${data}`);
  });
});

req.on("error", (err) => {
  console.error("[mock] Request failed:", err.message);
  console.error("Is the bot running? (npm run dev)");
});

req.write(body);
req.end();
