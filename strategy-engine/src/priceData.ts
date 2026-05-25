import axios from "axios";
import { Candle } from "./types";

// CoinGecko public API — no key required, works globally
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// Map trading pair symbols to CoinGecko IDs
const SYMBOL_TO_ID: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  ARBUSDT: "arbitrum",
};

// Map candle interval to CoinGecko days parameter
// CoinGecko returns hourly data for <=90 days, daily for more
function intervalToDays(interval: string): number {
  switch (interval) {
    case "1m":  return 1;
    case "5m":  return 1;
    case "15m": return 3;
    case "30m": return 7;
    case "1h":  return 30;
    case "4h":  return 90;
    case "1d":  return 365;
    default:    return 30;
  }
}

/**
 * Fetches OHLCV candles from CoinGecko.
 * Works globally with no API key.
 */
export async function fetchCandles(
  symbol: string,
  interval: string,
  limit: number = 200
): Promise<Candle[]> {
  const coinId = SYMBOL_TO_ID[symbol.toUpperCase()];
  if (!coinId) throw new Error(`Unknown symbol: ${symbol}. Add it to SYMBOL_TO_ID map.`);

  const days = intervalToDays(interval);

  const response = await axios.get(
    `${COINGECKO_BASE}/coins/${coinId}/ohlc`,
    {
      params: { vs_currency: "usd", days },
      timeout: 15_000,
    }
  );

  // CoinGecko OHLC returns: [timestamp, open, high, low, close]
  const raw = response.data as number[][];

  // Take the last `limit` candles
  const sliced = raw.slice(-limit);

  return sliced.map((k, i) => ({
    openTime:  k[0],
    open:      k[1],
    high:      k[2],
    low:       k[3],
    close:     k[4],
    volume:    0, // CoinGecko OHLC doesn't include volume — use 0 for MVP
    closeTime: sliced[i + 1]?.[0] ?? k[0] + 3_600_000,
  }));
}

/**
 * Returns the current price for a symbol via CoinGecko simple price endpoint.
 */
export async function fetchCurrentPrice(symbol: string): Promise<number> {
  const coinId = SYMBOL_TO_ID[symbol.toUpperCase()];
  if (!coinId) throw new Error(`Unknown symbol: ${symbol}`);

  const response = await axios.get(`${COINGECKO_BASE}/simple/price`, {
    params: { ids: coinId, vs_currencies: "usd" },
    timeout: 5_000,
  });

  const data = response.data as Record<string, { usd: number }>;
  return data[coinId].usd;
}

/**
 * Mock funding rate — real value injected by Rust backend layer.
 */
export function getMockFundingRate(): number {
  return 0.0003;
}
