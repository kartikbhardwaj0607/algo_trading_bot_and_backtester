const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Position:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         userId:
 *           type: string
 *         symbol:
 *           type: string
 *           example: TCS.NS
 *         quantity:
 *           type: integer
 *           example: 10
 *         entryPrice:
 *           type: number
 *           example: 3800
 *         stopLoss:
 *           type: number
 *           example: 3750
 *         targetPrice:
 *           type: number
 *           example: 3900
 *         tradeType:
 *           type: string
 *           enum: [BUY, SELL]
 *         status:
 *           type: string
 *           enum: [OPEN, CLOSED, CANCELLED]
 *         closedPrice:
 *           type: number
 *         pl:
 *           type: number
 *           description: Profit/Loss in INR (negative = loss)
 *         openedAt:
 *           type: string
 *           format: date-time
 *         closedAt:
 *           type: string
 *           format: date-time
 */
const positionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    symbol: {
      type: String,
      required: [true, 'Symbol is required'],
      uppercase: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    entryPrice: {
      type: Number,
      required: [true, 'Entry price is required'],
      min: [0.01, 'Entry price must be positive'],
    },
    stopLoss: {
      type: Number,
      required: [true, 'Stop loss is required'],
    },
    targetPrice: {
      type: Number,
      required: [true, 'Target price is required'],
    },
    /**
     * BUY: Profit when price rises above targetPrice.
     * SELL (short): Profit when price falls below targetPrice.
     */
    tradeType: {
      type: String,
      enum: ['BUY', 'SELL'],
      default: 'BUY',
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED', 'CANCELLED'],
      default: 'OPEN',
    },
    closedPrice: {
      type: Number,
      default: null,
    },
    /**
     * Profit/Loss in INR.
     * BUY:  (closedPrice - entryPrice) * quantity
     * SELL: (entryPrice - closedPrice) * quantity
     * Rounded to 2 decimal places.
     */
    pl: {
      type: Number,
      default: 0,
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for fast engine queries: all OPEN positions per user
positionSchema.index({ userId: 1, status: 1 });
// Index for quick single-symbol lookups
positionSchema.index({ symbol: 1, status: 1 });

module.exports = mongoose.model('Position', positionSchema);
