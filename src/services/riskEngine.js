const cron = require('node-cron');
const mongoose = require('mongoose');
const Position = require('../models/Position');
const Account = require('../models/Account');
const marketDataService = require('./marketDataService');
const { createJournalEntry } = require('./journalService');
const { isMarketOpen, getISTTimeString } = require('../config/marketHours');
const logger = require('../utils/logger');

/**
 * Idempotency guard: tracks position IDs currently being processed.
 * Prevents double-closure if cron overlaps (e.g., slow DB writes on next tick).
 * @type {Set<string>}
 */
const processingPositions = new Set();

/**
 * Calculates P&L for a closed position.
 * BUY:  profit when price rises → (closePrice - entryPrice) * qty
 * SELL: profit when price falls → (entryPrice - closePrice) * qty
 *
 * @param {object} position - Position document
 * @param {number} currentPrice - Current market price
 * @returns {number} P&L rounded to 2 decimal places
 */


const calculatePL = (position, currentPrice) => {
  let pl;
  if (position.tradeType === 'BUY') {
    pl = (currentPrice - position.entryPrice) * position.quantity;
  } else {
    pl = (position.entryPrice - currentPrice) * position.quantity;
  }
  return Math.round(pl * 100) / 100;
};

/**
 * Closes a position atomically using a Mongoose session transaction.
 * Updates the position status, calculates P&L, and adjusts the user's account balance.
 * Then triggers auto-journal creation.
 *
 * @param {object} position - The open Position document to close.
 * @param {number} currentPrice - The market price that triggered the closure.
 * @param {'STOP_LOSS' | 'TARGET'} trigger - What triggered the closure.
 * @returns {Promise<{ position: object, pl: number } | null>}
 */
const closePosition = async (position, currentPrice, trigger) => {
  const positionId = position._id.toString();

  // Idempotency check — skip if already being processed
  if (processingPositions.has(positionId)) {
    logger.warn(`Position ${positionId} is already being processed. Skipping duplicate.`);
    return null;
  }

  processingPositions.add(positionId);

  // Use transactions only in production/staging (Atlas supports them).
  // MongoMemoryServer (test env) does not support retryable writes.
  const useTransactions = process.env.NODE_ENV !== 'test';
  let session = null;

  try {
    const pl = calculatePL(position, currentPrice);

    if (useTransactions) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
      } catch {
        logger.warn('Could not start MongoDB transaction; falling back to direct updates.');
        session = null;
      }
    }

    const sessionOpts = session ? { session } : {};

    // 1. Update the Position (only if still OPEN — extra safety against race conditions)
    const updatedPosition = await Position.findOneAndUpdate(
      { _id: position._id, status: 'OPEN' },
      {
        status: 'CLOSED',
        closedPrice: Math.round(currentPrice * 100) / 100,
        pl,
        closedAt: new Date(),
      },
      { returnDocument: 'after', ...sessionOpts }
    );

    if (!updatedPosition) {
      if (session) await session.abortTransaction();
      logger.warn(`Position ${positionId} was already closed. Aborting.`);
      return null;
    }

    // 2. Return capital + P&L to the user's account
    const positionCost = position.entryPrice * position.quantity;
    
    
    const returnAmount = Math.round((positionCost + pl) * 100) / 100;

    const updatedAccount = await Account.findOneAndUpdate(
      { userId: position.userId },
      { $inc: { balance: returnAmount, buyingPower: returnAmount } },
      { returnDocument: 'after', ...sessionOpts }
    );

    if (session) await session.commitTransaction();

    logger.info(
      `✅ Position CLOSED | ${position.symbol} | Trigger: ${trigger} | ` +
      `Price: ₹${currentPrice} | P&L: ₹${pl} | ` +
      `New Balance: ₹${updatedAccount?.balance} | Time: ${getISTTimeString()}`
    );

    // 3. Auto-journal entry (non-fatal)
    await createJournalEntry(updatedPosition);

    
    
    return { position: updatedPosition, pl };
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    logger.error(`closePosition failed for ${positionId}: ${error.message}`);
    return null;
  } finally {
    if (session) session.endSession();
    processingPositions.delete(positionId);
  }
};


/**
 * Checks all SL/TP conditions for a single position against its current market price.
 *
 * @param {object} position - An OPEN position document.
 * @returns {Promise<void>}
 */
const checkPosition = async (position) => {
  try {
    const currentPrice = await marketDataService.getLivePrice(position.symbol);

    logger.debug(
      `Checking ${position.symbol} | LTP: ₹${currentPrice} | ` +
      `SL: ₹${position.stopLoss} | TP: ₹${position.targetPrice} | ` +
      `Type: ${position.tradeType}`
    );

    if (position.tradeType === 'BUY') {
      // BUY: Stop Loss fires when price drops to or below SL
      if (currentPrice <= position.stopLoss) {
        logger.warn(`🔴 STOP LOSS HIT | ${position.symbol} | LTP: ₹${currentPrice} ≤ SL: ₹${position.stopLoss}`);
        await closePosition(position, currentPrice, 'STOP_LOSS');
        return;
      }
      // BUY: Target fires when price rises to or above TP
      if (currentPrice >= position.targetPrice) {
        logger.info(`🟢 TARGET HIT | ${position.symbol} | LTP: ₹${currentPrice} ≥ TP: ₹${position.targetPrice}`);
        await closePosition(position, currentPrice, 'TARGET');
      }
    } else {
      // SELL (short): Stop Loss fires when price rises to or above SL
      if (currentPrice >= position.stopLoss) {
        logger.warn(`🔴 STOP LOSS HIT (SHORT) | ${position.symbol} | LTP: ₹${currentPrice} ≥ SL: ₹${position.stopLoss}`);
        await closePosition(position, currentPrice, 'STOP_LOSS');
        return;
      }
      // SELL (short): Target fires when price drops to or below TP
      if (currentPrice <= position.targetPrice) {
        logger.info(`🟢 TARGET HIT (SHORT) | ${position.symbol} | LTP: ₹${currentPrice} ≤ TP: ₹${position.targetPrice}`);
        await closePosition(position, currentPrice, 'TARGET');
      }
    }
  } catch (error) {
    logger.error(`Error checking position ${position._id} (${position.symbol}): ${error.message}`);
  }
};

/**
 * The main risk engine loop.
 * Fetches all OPEN positions and checks each one against SL/TP conditions.
 * Exposed for manual triggering in tests.
 *
 * @returns {Promise<void>}
 */
const runEngineCheck = async () => {
  try {
    const openPositions = await Position.find({ status: 'OPEN' });

    if (openPositions.length === 0) {
      logger.debug(`Risk Engine: No open positions to check. [${getISTTimeString()}]`);
      return;
    }

    logger.info(`Risk Engine: Checking ${openPositions.length} open position(s) at ${getISTTimeString()}`);

    // Check all positions concurrently — each has its own idempotency guard
    await Promise.allSettled(openPositions.map(checkPosition));
  } catch (error) {
    logger.error(`Risk Engine loop error: ${error.message}`);
  }
};

/**
 * Starts the background cron job that powers the risk engine.
 * Runs every 3 seconds. Skips execution if market is closed.
 */
const startRiskEngine = () => {
  logger.info('🚀 Risk Engine started — monitoring every 3 seconds.');

  // node-cron doesn't support sub-minute precisely, so we use setInterval for 3s
  // But we wrap it as a cron-like pattern for code consistency
  cron.schedule('* * * * * *', async () => {
    // This fires every second; we throttle to every 3 seconds via a counter
  });

  // Use setInterval for precise 3-second intervals
  setInterval(async () => {
    if (!isMarketOpen()) {
      logger.debug(`Market Closed — Risk Engine idle. [${getISTTimeString()}]`);
      return;
    }
    await runEngineCheck();
  }, 3000);
};

module.exports = { startRiskEngine, runEngineCheck, closePosition, calculatePL };
