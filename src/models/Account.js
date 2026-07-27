const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Account:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *         balance:
 *           type: number
 *           description: Available virtual cash in INR
 *         buyingPower:
 *           type: number
 *           description: Balance minus value locked in open positions
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const accountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    /**
     * Available virtual cash.
     * Reduced when a trade is placed; restored (with P&L) when trade closes.
     */
    balance: {
      type: Number,
      default: 100000, // ₹1,00,000 starting capital
      min: [0, 'Balance cannot be negative'],
    },
    /**
     * Buying power = balance − cost of all currently open positions.
     * Stored for quick reads; re-calculated and synced on every trade action.
     */
    buyingPower: {
      type: Number,
      default: 100000,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
