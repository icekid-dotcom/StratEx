//! Stratex Backend — Aomi Plugin
//!
//! Exposes 5 Avantis perpetuals tools to the Aomi agent runtime:
//!   1. get_funding_rates   — fetch current funding rates across pairs
//!   2. get_market_depth    — order book depth + open interest
//!   3. open_position       — build unsigned long/short position payload
//!   4. get_positions       — fetch active positions with margin + liquidation data
//!   5. exit_position       — build unsigned close payload

mod avantis;
mod tools;
mod types;

pub use tools::*;
