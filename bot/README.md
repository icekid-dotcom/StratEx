# stratex/bot

Telegram frontend for Stratex. Handles strategy onboarding, trade proposal cards,
approve/reject, and liquidation warnings.

## Stack

- [grammY](https://grammy.dev/) — Telegram bot framework (TypeScript-first)
- `@grammyjs/conversations` — multi-step wizard for onboarding
- Plain Node.js `http` server — receives proposals from the strategy engine

## Setup

```bash
cd bot
cp .env.example .env
# Fill in BOT_TOKEN and AUTHORIZED_USER_ID
npm install
npm run dev
```

### Environment variables

| Variable              | Required | Description                                              |
|-----------------------|----------|----------------------------------------------------------|
| `BOT_TOKEN`           | ✅        | From @BotFather                                         |
| `AUTHORIZED_USER_ID`  | ✅        | Your Telegram user ID (from @userinfobot). Locks the bot to you only. |
| `STRATEGY_STORE_PATH` | ❌        | Path for strategy JSON (default: `./data/strategy.json`) |
| `PROPOSAL_PORT`       | ❌        | Port for the internal HTTP server (default: `3001`)      |
| `STRATEGY_ENGINE_PORT`| ❌        | Port the strategy engine listens on (default: `3000`)    |

## Directory

```
bot/
├── src/
│   ├── index.ts        # Entry point — bot init, HTTP server, boot sequence
│   ├── onboarding.ts   # Multi-step strategy capture wizard
│   ├── handlers.ts     # Command + callback query handlers
│   ├── proposal.ts     # Trade card + liquidation warning formatters
│   ├── store.ts        # Strategy profile read/write (JSON file)
│   └── types.ts        # Shared TypeScript types
├── scripts/
│   └── mock-proposal.js  # Dev helper — fires a fake proposal for testing
├── .env.example
├── package.json
└── tsconfig.json
```

## Commands

| Command     | Description                          |
|-------------|--------------------------------------|
| `/start`    | Welcome message + status             |
| `/setup`    | Run the strategy onboarding wizard   |
| `/strategy` | View your saved strategy profile     |
| `/positions`| List open Avantis positions          |
| `/cancel`   | Cancel an in-progress wizard         |
| `/help`     | Show all commands                    |

## Testing without the strategy engine

Use the mock script to push a fake trade proposal card to Telegram:

```bash
# Make sure the bot is running first (npm run dev)

# Send a trade proposal card
node scripts/mock-proposal.js

# Send a liquidation warning
node scripts/mock-proposal.js liquidation
```

## How proposals flow in

The strategy engine POSTs to the bot's internal HTTP server:

```
POST http://localhost:3001/proposal      ← TradeProposal JSON
POST http://localhost:3001/liquidation   ← ActivePosition JSON
GET  http://localhost:3001/health        ← uptime check
```

The bot pushes the card to Telegram and stores the proposal in memory.
When the user taps Approve, the bot POSTs back to the strategy engine:

```
POST http://localhost:3000/execute  ← { proposalId, decision, proposal }
POST http://localhost:3000/close    ← { positionId }
```

The Rust agent layer handles the actual Avantis execution from there.
