const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  placeTrade,
  getPortfolio,
  getPosition,
  cancelPosition,
  getJournal,
  updateReflection,
} = require('../controllers/tradeController');
const { protect } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');

// All trade routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Trades
 *   description: Paper trading — place orders, manage positions
 */

/**
 * @swagger
 * /trades:
 *   post:
 *     summary: Place a new paper trade
 *     tags: [Trades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [symbol, quantity, entryPrice, stopLoss, targetPrice]
 *             properties:
 *               symbol:
 *                 type: string
 *                 example: TCS
 *               quantity:
 *                 type: integer
 *                 example: 10
 *               entryPrice:
 *                 type: number
 *                 example: 3800
 *               stopLoss:
 *                 type: number
 *                 example: 3750
 *               targetPrice:
 *                 type: number
 *                 example: 3900
 *               tradeType:
 *                 type: string
 *                 enum: [BUY, SELL]
 *                 default: BUY
 *     responses:
 *       201:
 *         description: Trade placed successfully
 *       400:
 *         description: Insufficient balance or invalid SL/TP
 */
router.post(
  '/',
  [
    body('symbol').trim().notEmpty().withMessage('Symbol is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
    body('entryPrice').isFloat({ min: 0.01 }).withMessage('Entry price must be a positive number'),
    body('stopLoss').isFloat({ min: 0.01 }).withMessage('Stop loss must be a positive number'),
    body('targetPrice').isFloat({ min: 0.01 }).withMessage('Target price must be a positive number'),
    body('tradeType').optional().isIn(['BUY', 'SELL']).withMessage('Trade type must be BUY or SELL'),
  ],
  validate,
  placeTrade
);

/**
 * @swagger
 * /portfolio:
 *   get:
 *     summary: Get full portfolio — open positions, closed history, account summary
 *     tags: [Trades]
 *     responses:
 *       200:
 *         description: Portfolio data with live LTP and unrealised P&L
 */
router.get('/portfolio', getPortfolio);

/**
 * @swagger
 * /trades/{id}:
 *   get:
 *     summary: Get a specific position by ID
 *     tags: [Trades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Position details
 *       404:
 *         description: Position not found
 */
router.get('/:id', getPosition);

/**
 * @swagger
 * /trades/{id}:
 *   delete:
 *     summary: Manually cancel an open position
 *     tags: [Trades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Position cancelled and capital returned
 *       404:
 *         description: Open position not found
 */
router.delete('/:id', cancelPosition);

/**
 * @swagger
 * tags:
 *   name: Journal
 *   description: Trade journal — behavioral reflection prompts
 */

/**
 * @swagger
 * /journal:
 *   get:
 *     summary: Get all journal entries for the current user
 *     tags: [Journal]
 *     responses:
 *       200:
 *         description: List of journal entries with position details
 */
router.get('/journal', getJournal);

/**
 * @swagger
 * /journal/{id}:
 *   put:
 *     summary: Submit a reflection for a journal entry
 *     tags: [Journal]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reflection]
 *             properties:
 *               reflection:
 *                 type: string
 *                 example: I didn't check the IT sector sentiment before entering.
 *     responses:
 *       200:
 *         description: Reflection saved successfully
 *       404:
 *         description: Journal entry not found
 */
router.put(
  '/journal/:id',
  [
    body('reflection')
      .trim()
      .notEmpty()
      .withMessage('Reflection cannot be empty')
      .isLength({ max: 2000 })
      .withMessage('Reflection cannot exceed 2000 characters'),
  ],
  validate,
  updateReflection
);

module.exports = router;
