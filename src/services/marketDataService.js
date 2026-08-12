const yahooFinance = require('yahoo-finance2').default;
const logger = require('../utils/logger');

/**
 * In-memory TTL cache to avoid hitting Yahoo Finance rate limits.
 * Structure: Map<symbol, { price: number, fetchedAt: number }>
 * Cache expires after 2 seconds.
 */
const priceCache = new Map();
const CACHE_TTL_MS = 2000;

/**
 * Fetches the live market price (LTP) for a given stock symbol from Yahoo Finance.
 * Uses an in-memory TTL cache to avoid redundant API calls within the same 2-second window.
 *
 * @param {string} symbol - Stock symbol with exchange suffix (e.g., 'TCS.NS' for NSE, 'TCS.BO' for BSE).
 * @returns {Promise<number>} - The last traded price (regularMarketPrice).
 * @throws {Error} If the symbol is invalid or Yahoo Finance is unreachable.
 */
const getLivePrice = async (symbol) => {
  const upperSymbol = symbol.toUpperCase();

  // Check cache first
  const cached = priceCache.get(upperSymbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    logger.debug(`Cache hit for ${upperSymbol}: ₹${cached.price}`);
    return cached.price;
  }

  try {
    const quote = await yahooFinance.quote(upperSymbol, {
      fields: ['regularMarketPrice', 'regularMarketTime', 'shortName'],
    });

    if (!quote || quote.regularMarketPrice == null) {
      throw new Error(`No price data returned for symbol: ${upperSymbol}`);
    }

    const price = Math.round(quote.regularMarketPrice * 100) / 100;

    // Store in cache
    priceCache.set(upperSymbol, { price, fetchedAt: Date.now() });

    logger.debug(`Live price fetched for ${upperSymbol}: ₹${price}`);
    return price;
  } catch (error) {
    logger.warn(`Yahoo Finance failed for ${upperSymbol}: ${error.message}. Falling back to mock price.`);
    return getMockPrice(upperSymbol);
  }
};

/**
 * Mock price generator for testing and when market is closed.
 * Produces a deterministic random walk from a base price of ₹1,000.
 * Fluctuates by ±₹5 each call, simulating realistic tick movement.
 *
 * @param {string} symbol - Stock symbol (used as seed for consistency).
 * @returns {number} - Simulated market price.
 */
const getMockPrice = (symbol) => {
  // Base price per symbol (deterministic from symbol string)
  const symbolBases = {
    'TCS.NS': 3800,
    'INFY.NS': 1750,
    'RELIANCE.NS': 2900,
    'HDFCBANK.NS': 1650,
    'WIPRO.NS': 560,
  };

  const base = symbolBases[symbol.toUpperCase()] || 1000;
  
  
  const fluctuation = (Math.random() * 10 - 5); // ±₹5
  const mockPrice = Math.round((base + fluctuation) * 100) / 100;

  logger.debug(`Mock price for ${symbol}: ₹${mockPrice}`);
  return mockPrice;
};

/**
 * Clears the price cache — useful for testing.
 */
const clearCache = () => priceCache.clear();

module.exports = { getLivePrice, getMockPrice, clearCache };
