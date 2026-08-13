const Journal = require('../models/Journal');
const logger = require('../utils/logger');

/**
 * Determines the trade outcome classification.
 * NEAR_MISS: Position closed within 2% of target price — a psychological learning moment.
 *
 * @param {import('../models/Position').default} position - The closed position document.
 * @returns {'WIN' | 'LOSS' | 'NEAR_MISS'}
 */
const classifyOutcome = (position) => {
  
  
  if (position.pl > 0) {
    // Check for NEAR_MISS on the downside? Actually NEAR_MISS applies to a loss
    // that was very close to the target (within 2% of target profit potential)
    const maxPotentialProfit =
      position.tradeType === 'BUY'
        ? (position.targetPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - position.targetPrice) * position.quantity;

    const nearMissThreshold = maxPotentialProfit * 0.98;
    if (position.pl >= nearMissThreshold) {
      return 'WIN'; // Full win
    }
    return 'WIN';
  }

  if (position.pl < 0) {
    // Check if the loss was close to a win (price came very near target before reversing)
    const maxPotentialProfit =
      position.tradeType === 'BUY'
        ? (position.targetPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - position.targetPrice) * position.quantity;

    // Near miss: loss but we're within 2% of having hit the target
    // In practice this means the SL was very tight and the trade almost worked
    const nearMissMaxLoss = (position.stopLoss - position.entryPrice) * position.quantity;
    if (Math.abs(position.pl) < Math.abs(nearMissMaxLoss) * 0.1) {
      return 'NEAR_MISS';
    }
    return 'LOSS';
  }

  return 'LOSS'; // Breakeven treated as loss for learning purposes
};

/**
 * Generates a dynamic behavioral reflection prompt based on trade outcome.
 *
 * @param {import('../models/Position').default} position - The closed position.
 * @returns {string} The reflection prompt to show the user.
 */
const generatePrompt = (position) => {
  const outcome = classifyOutcome(position);

  const prompts = {
    WIN: [
      `Great win on ${position.symbol}! What specific indicator or news gave you the conviction to hold until target? Write it down before you forget.`,
      `You hit your target on ${position.symbol}. Did you follow your original plan, or did you adjust mid-trade? What would you do the same next time?`,
      `Profitable trade on ${position.symbol} (+₹${position.pl.toFixed(2)}). What was the one thing you did right here that you should repeat?`,
    ],
    LOSS: [
      `Stop loss hit on ${position.symbol} (₹${Math.abs(position.pl).toFixed(2)} loss). Did you miss any macro headlines or sector trends that affected this stock today?`,
      `Loss on ${position.symbol}. Was your stop loss level based on technical analysis or was it arbitrary? How would you set it differently next time?`,
      `Tough trade on ${position.symbol}. Looking back, what was the earliest signal that this trade wasn't going your way?`,
    ],
    NEAR_MISS: [
      `You almost hit your target on ${position.symbol}! The trade came very close. What would you do differently to capture that last mile of the move?`,
      `Near miss on ${position.symbol} — the price reversed just before your target. Was there a signal you missed that could have told you to exit earlier?`,
    ],
  };

  const outcomePrompts = prompts[outcome];
  const randomPrompt = outcomePrompts[Math.floor(Math.random() * outcomePrompts.length)];
  return randomPrompt;
};

/**
 * Creates a Journal entry for a closed position.
 * Called automatically by the Risk Engine after every trade closure.
 *
 * @param {import('../models/Position').default} position - The closed position document.
 * @returns {Promise<import('../models/Journal').default>} The created journal entry.
 */
const createJournalEntry = async (position) => {
  try {
    const outcome = classifyOutcome(position);
    const autoPrompt = generatePrompt(position);

    const entry = await Journal.create({
      userId: position.userId,
      positionId: position._id,
      autoPrompt,
      tradeOutcome: outcome,
    });

    logger.info(
      `Journal entry created for position ${position._id} | Outcome: ${outcome} | User: ${position.userId}`
    );

    return entry;
  } catch (error) {
    // Non-fatal — log and continue. Trade is already closed.
    logger.error(`Failed to create journal entry for position ${position._id}: ${error.message}`);
    return null;
  }
};

module.exports = { generatePrompt, createJournalEntry, classifyOutcome };
