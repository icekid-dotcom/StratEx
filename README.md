# ⚡ StratEx — Personal Alpha Engine

> Strategy-Driven Agentic Perpetuals Trading Infrastructure for Base

**Track:** Avantis (Priority Protocol 4) — OpenPandora Early Forge Hackathon

---

## What It Does

StratEx encodes a human trader's TA methodology into an autonomous agent that monitors markets 24/7, detects high-conviction setups, and proposes trades via Telegram — without ever touching the user's private keys.

A skilled perp trader has an edge. Sleep, work, and cognitive fatigue erode it. StratEx fixes that.

---

## How It Works

**1. Onboard your strategy once**

```
Bot: "What indicators do you use for entries?"
User: "RSI below 25, MACD crossover, price above 200MA"

Bot: "What's your leverage range?"
User: "5x to 10x"

Bot: "How do you size stops?"
User: "Below nearest support zone"
```

The agent stores this as a structured strategy profile and applies it on every signal evaluation.

**2. Agent monitors markets around the clock**

The strategy engine polls BTC, ETH, and SOL on 1h candles, computing:
- RSI (configurable period + thresholds)
- MACD (crossover, histogram, or both)
- Moving average confluence (50MA / 200MA)
- Support & resistance zone detection

**3. Signal detected → proposal delivered**

When confluence conditions align, the agent sizes the position, runs a simulation, and fires a trade proposal card to Telegram:

```
🟢 TRADE PROPOSAL — SOL-USD

Direction:   LONG
Entry:       $84.13
Leverage:    40x
Collateral:  $120 USDC

Stop-Loss:   $83.49  (0.8% from entry)
Take-Profit: $85.41  (1.5% upside)

📊 Simulation (Anvil fork)
Est. PnL @ TP:  +$57.60
Est. PnL @ SL:  -$28.80
Liquidation:    $82.00

🔍 Signal Confluence
✅ RSI(14): 41.82 — neutral zone
✅ MACD: bearish histogram
✅ MA (price above all): 55MA@85.41, 210MA@84.13
✅ S/R Zone: demand zone $83.49–$84.33

[✅ APPROVE]  [❌ REJECT]
```

**4. User taps Approve — trade executes on Avantis**

The Aomi agent layer calls the Avantis perpetuals API on Base, submits the unsigned transaction to the user's wallet (wagmi/Para), and executes. Private keys never leave the device.

---

## Architecture

```
┌─────────────────────────────────────┐
│         Telegram Bot (bot/)         │
│  Strategy onboarding, proposal      │
│  cards, approve/reject, alerts      │
└──────────────┬──────────────────────┘
               │ HTTP (proposals)
┌──────────────▼──────────────────────┐
│    Strategy Engine (strategy-engine/)│
│  CoinGecko OHLCV → RSI/MACD/MA/S&R  │
│  Confluence eval → Position sizing  │
│  Polls BTC, ETH, SOL every 60s      │
└──────────────┬──────────────────────┘
               │ /execute signal
┌──────────────▼──────────────────────┐
│    Rust Backend (backend/)          │
│  Aomi plugin (.cdylib)              │
│  5 Avantis tools:                   │
│  get_funding_rates                  │
│  get_market_depth                   │
│  open_position                      │
│  get_positions                      │
│  exit_position                      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Avantis Perps DEX — Base Mainnet   │
│  User wallet signs — no custody     │
└─────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Telegram bot | Node.js + TypeScript (grammY) |
| Strategy engine | Node.js + TypeScript |
| Price data | CoinGecko public API |
| Rust backend | Rust → `.cdylib` (Aomi SDK) |
| On-chain | Avantis perpetuals DEX on Base |
| Wallet | wagmi / Para (user-side, no custody) |
| Simulation | Anvil local fork of Base |

---

## Monorepo Structure

```
stratex/
├── bot/                  # Telegram frontend
│   └── src/
│       ├── index.ts      # Bot entry point + HTTP proposal listener
│       ├── onboarding.ts # Strategy capture wizard
│       ├── handlers.ts   # Commands + callback queries
│       ├── proposal.ts   # Trade card formatter
│       ├── store.ts      # Strategy profile persistence
│       └── types.ts      # Shared types
│
├── strategy-engine/      # Indicator + signal engine
│   └── src/
│       ├── index.ts      # Main polling loop (BTC/ETH/SOL)
│       ├── indicators.ts # RSI, MACD, EMA/SMA, S&R
│       ├── confluence.ts # Signal evaluation
│       ├── positionSizer.ts
│       ├── proposalBuilder.ts
│       ├── priceData.ts  # CoinGecko OHLCV
│       └── config.ts     # Strategy profile loader
│
└── backend/              # Rust Aomi plugin
    └── src/
        ├── lib.rs        # Plugin entry point
        ├── tools.rs      # 5 Avantis tool implementations
        ├── avantis.rs    # Avantis API client
        └── types.rs      # Typed structs
```

---

## Running Locally

**Requirements:** Node.js 18+, Git

**1. Bot**
```bash
cd bot
cp .env.example .env
# Add BOT_TOKEN and AUTHORIZED_USER_ID
npm install
npm run dev
```

**2. Strategy Engine**
```bash
cd strategy-engine
cp .env.example .env
npm install
npm run dev
```

**3. Rust Backend** (requires Rust + Aomi SDK)
```bash
cd backend
cargo build --release
```

---

## Key Design Decisions

**No custody.** The agent never holds or signs with user funds. Every position payload is delivered unsigned to the user's local wallet.

**Strategy-first.** The agent learns the trader's method, not a generic algorithm. RSI thresholds, MA periods, leverage ranges, stop sizing — all configurable per user.

**Simulation before execution.** Every proposal runs through an Anvil fork of Base before reaching the user, validating PnL, liquidation price, gas, and slippage.

**Cooldown per pair.** Each trading pair has an independent 4-hour cooldown to prevent signal spam across BTC, ETH, and SOL.

---

## References

- [Aomi SDK](https://github.com/aomi-labs/aomi-sdk)
- [Aomi Docs](https://aomi.dev/docs/build/overview)
- [Avantis](https://avantisfi.com)
