# StratEx

**Personal alpha engine for Avantis perpetuals on Base — delivered through Telegram.**

StratEx watches BTC, ETH, and SOL for technical confluence (RSI, MACD, moving averages, support/resistance) against *your own* trading strategy, sizes a position when your setup fires, and sends you a trade proposal on Telegram. You approve or reject — your keys never leave your device.

Built for the OpenPandora Early Forge Hackathon.

## What it does

- **Multi-user strategy profiles** — every Telegram user runs `/setup` and gets their own indicator thresholds, leverage range, stop-loss method, and position size. One bot, many independent traders.
- **Signal detection** — polls BTC/ETH/SOL candles hourly, scores confluence across up to 4 indicators per user's configured strategy, fires a proposal only when your specific thresholds are met.
- **Trade proposals with simulation** — every proposal shows entry, leverage, stop-loss, take-profit, liquidation price, estimated PnL, and funding cost before you approve anything.
- **`/alert`** — set a one-shot price alert (`/alert BTC-USD above 65000`) and get pinged when it crosses, independent of your strategy signals.
- **Position monitoring** — link a wallet with `/wallet 0x...` and get a liquidation warning if any open Avantis position's margin ratio drops below 15%.
- **Non-custodial by design** — the Rust/Aomi backend builds unsigned transaction payloads only. Nothing here ever holds a private key.

## Architecture

```
┌─────────────┐   GET /profiles    ┌──────────────────┐
│     bot     │◄───────────────────│  strategy-engine  │
│  (Telegram, │                    │ (polls prices,    │
│  Node/TS)   │───POST /proposal──►│  scores signals,  │
│             │───POST /liquidation►  sizes positions) │
│             │───POST /alert-     │                    │
│             │    triggered───────►                    │
└─────────────┘                    └──────────────────┘
       │                                     │
       │ unsigned tx payloads                │ REST calls
       ▼                                     ▼
┌─────────────┐                    ┌──────────────────┐
│stratex-backend│                  │   Avantis API /   │
│ (Rust, Aomi   │                  │   CoinGecko        │
│  SDK plugin)  │                  └──────────────────┘
└─────────────┘
```

Bot and engine run as **separate services** (currently on Railway) with separate filesystems. They talk to each other over HTTP using each other's internal hostname — the engine has no direct database access to the bot's saved profiles, it pulls them fresh via `GET /profiles` every poll cycle.

## Repo structure

```
bot/                  Telegram frontend (grammY)
  src/
    index.ts          HTTP server + bot bootstrap
    handlers.ts        Telegram commands
    onboarding.ts       /setup wizard
    store.ts            Per-user profile + wallet storage
    proposal.ts          Message formatters
    types.ts

strategy-engine/       Signal detection + position sizing (Node/TS)
  src/
    index.ts            Poll loop, multi-user orchestration
    confluence.ts         Indicator scoring
    indicators.ts          RSI / MACD / MA / S-R math
    positionSizer.ts        Leverage + stop-loss sizing (clamped)
    positionMonitor.ts       Liquidation checks
    alerts.ts                 Price alert storage + firing
    priceData.ts               CoinGecko candle fetching
    config.ts                   Pulls user profiles from bot
    api.ts                       Express endpoints
    proposalBuilder.ts

backend/                Rust/Aomi SDK plugin — builds unsigned Avantis tx payloads
  src/
    lib.rs               Tool registration
    avantis.rs             Avantis REST client
    tools.rs                 5 exposed tools
    types.rs
```

## Quick start

See [HOWTO.md](./HOWTO.md) for local setup and deployment.
See [USER-MANUAL.md](./USER-MANUAL.md) for the full Telegram command reference.

## Tech stack

Telegram bot: grammY, Node.js, TypeScript
Strategy engine: Node.js, TypeScript, Express, Axios, CoinGecko public API
Backend: Rust, Aomi SDK, Avantis REST API
Chain: Base (Avantis perpetuals)
Hosting: Railway (two services, persistent volumes for profile/cooldown storage)

## Safety notes

- Leverage is clamped to 1–100x and stop-loss to 0.1–20% both at onboarding time and again in the engine's position sizer, so a malformed or stale profile can never produce a nonsensical trade proposal.
- The bot token should be rotated if it's ever exposed in a chat log, doc, or commit — treat it like a password.
