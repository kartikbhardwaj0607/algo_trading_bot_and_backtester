const Position = require('../models/Position');
const Account = require('../models/Account');
const Journal = require('../models/Journal');
const { getLivePrice } = require('../services/marketDataService');
const logger = require('../utils/logger');

/**
 * POST /api/trades
 * Places a new paper trade (opens a position).
 * Validates user balance, deducts trade cost, creates OPEN position.
 */
const placeTrade = async (req, res) => {
  try {
    const { symbol, quantity, entryPrice, stopLoss, targetPrice, tradeType = 'BUY' } = req.body;
    const { userId } = req.user;

    // Ensure symbol has .NS suffix for NSE (append if missing)
    const formattedSymbol = symbol.toUpperCase().includes('.')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}.NS`;

    const tradeCost = Math.round(entryPrice * quantity * 100) / 100;

    // Fetch user account
    const account = await Account.findOne({ userId });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Trading account not found.' });
    }

    // Validate buying power
    if (account.buyingPower < tradeCost) {
      return res.status(400).json({
        success: false,
        message: `Insufficient buying power. Required: ₹${tradeCost}, Available: ₹${account.buyingPower}.`,
      });
    }

    // Validate SL/TP direction for trade type
    if (tradeType === 'BUY') {
      if (stopLoss >= entryPrice) {
        return res.status(400).json({ success: false, message: 'Stop Loss must be below entry price for a BUY trade.' });
      }
      if (targetPrice <= entryPrice) {
        return res.status(400).json({ success: false, message: 'Target Price must be above entry price for a BUY trade.' });
      }
    } else {
      if (stopLoss <= entryPrice) {
        return res.status(400).json({ success: false, message: 'Stop Loss must be above entry price for a SELL trade.' });
      }
      if (targetPrice >= entryPrice) {
        return res.status(400).json({ success: false, message: 'Target Price must be below entry price for a SELL trade.' });
      }
    }

    // Deduct trade cost from buying power (balance stays; buyingPower is what we track)
    account.buyingPower = Math.round((account.buyingPower - tradeCost) * 100) / 100;
    account.balance = Math.round((account.balance - tradeCost) * 100) / 100;
    await account.save();

    // Create the position
    const position = await Position.create({
      userId,
      symbol: formattedSymbol,
      quantity,
      entryPrice: Math.round(entryPrice * 100) / 100,
      stopLoss: Math.round(stopLoss * 100) / 100,
      targetPrice: Math.round(targetPrice * 100) / 100,
      tradeType,
      status: 'OPEN',
    });

    logger.info(
      `New position opened | User: ${userId} | ${formattedSymbol} | ` +
      `${tradeType} ${quantity}@₹${entryPrice} | SL: ₹${stopLoss} | TP: ₹${targetPrice} | Cost: ₹${tradeCost}`
    );

    res.status(201).json({
      success: true,
      message: 'Trade placed successfully.',
      position,
      account: {
        balance: account.balance,
        buyingPower: account.buyingPower,
      },
    });
  } catch (error) {
    logger.error(`Place trade error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error while placing trade.' });
  }
};

/**
 * GET /api/portfolio
 * Returns the user's full portfolio:
 * - Open positions with live LTP and unrealised P&L
 * - Closed positions with realised P&L
 * - Account summary (cash + total portfolio value)
 */
const getPortfolio = async (req, res) => {
  try {
    const { userId } = req.user;

    const [account, openPositions, closedPositions] = await Promise.all([
      Account.findOne({ userId }),
      Position.find({ userId, status: 'OPEN' }).sort({ openedAt: -1 }),
      Position.find({ userId, status: 'CLOSED' }).sort({ closedAt: -1 }).limit(20),
    ]);

    // Enrich open positions with live LTP and unrealised P&L
    const enrichedOpen = await Promise.all(
      openPositions.map(async (pos) => {
        let ltp, unrealisedPL;
        try {
          ltp = await getLivePrice(pos.symbol);
          unrealisedPL =
            pos.tradeType === 'BUY'
              ? Math.round((ltp - pos.entryPrice) * pos.quantity * 100) / 100
              : Math.round((pos.entryPrice - ltp) * pos.quantity * 100) / 100;
        } catch {
          ltp = null;
          unrealisedPL = null;
        }
        return { ...pos.toObject(), ltp, unrealisedPL };
      })
    );

    // Total realised P&L from closed positions
    const totalRealisedPL = closedPositions.reduce((sum, p) => sum + (p.pl || 0), 0);
    const totalUnrealisedPL = enrichedOpen.reduce((sum, p) => sum + (p.unrealisedPL || 0), 0);

    res.status(200).json({
      success: true,
      account: {
        balance: account?.balance ?? 0,
        buyingPower: account?.buyingPower ?? 0,
      },
      summary: {
        openPositions: enrichedOpen.length,
        closedPositions: closedPositions.length,
        totalRealisedPL: Math.round(totalRealisedPL * 100) / 100,
        totalUnrealisedPL: Math.round(totalUnrealisedPL * 100) / 100,
      },
      openPositions: enrichedOpen,
      closedPositions,
    });
  } catch (error) {
    logger.error(`Get portfolio error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error while fetching portfolio.' });
  }
};

/**
 * GET /api/trades/:id
 * Returns a single position by ID (must belong to the authenticated user).
 */
const getPosition = async (req, res) => {
  try {
    const position = await Position.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!position) {
      return res.status(404).json({ success: false, message: 'Position not found.' });
    }
    res.status(200).json({ success: true, position });
  } catch (error) {
    logger.error(`Get position error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/trades/:id
 * Manually cancels an OPEN position. Returns the locked capital to the user's account.
 */
const cancelPosition = async (req, res) => {
  try {
    const { userId } = req.user;

    const position = await Position.findOne({ _id: req.params.id, userId, status: 'OPEN' });
    if (!position) {
      return res.status(404).json({ success: false, message: 'Open position not found.' });
    }

    // Return the locked capital (no P&L on manual cancel)
    const refund = Math.round(position.entryPrice * position.quantity * 100) / 100;

    await Promise.all([
      
      Position.findByIdAndUpdate(position._id, { status: 'CANCELLED', closedAt: new Date() }),
      Account.findOneAndUpdate(
        { userId },
        { $inc: { balance: refund, buyingPower: refund } }
      ),
    ]);

    logger.info(`Position CANCELLED | ${position.symbol} | User: ${userId} | Refund: ₹${refund}`);

    res.status(200).json({
      success: true,
      message: `Position on ${position.symbol} cancelled. ₹${refund} returned to your account.`,
    });
  } catch (error) {
    logger.error(`Cancel position error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error while cancelling position.' });
  }
};

/**
 * GET /api/journal
 * Returns all journal entries for the authenticated user, newest first.
 */
const getJournal = async (req, res) => {
  try {
    const entries = await Journal.find({ userId: req.user.userId })
      .populate('positionId', 'symbol quantity entryPrice closedPrice pl tradeType')
      .sort({ createdAt: -1 });

    // Mark all as read on fetch
    await Journal.updateMany({ userId: req.user.userId, isRead: false }, { isRead: true });

    res.status(200).json({ success: true, count: entries.length, entries });
  } catch (error) {
    logger.error(`Get journal error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/journal/:id
 * Submits the user's reflection for a journal entry.
 */
const updateReflection = async (req, res) => {
  try {
    const { reflection } = req.body;
    const { userId } = req.user;

    const entry = await Journal.findOneAndUpdate(
      { _id: req.params.id, userId },
      { reflection: reflection.trim(), isRead: true },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Journal entry not found.' });
    }

    logger.info(`Reflection added to journal entry ${entry._id} by user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Reflection saved.',
      entry,
    });
  } catch (error) {
    logger.error(`Update reflection error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { placeTrade, getPortfolio, getPosition, cancelPosition, getJournal, updateReflection };
