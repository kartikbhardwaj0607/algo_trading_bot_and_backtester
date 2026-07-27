/**
 * Integration Test: Arjun's TCS Trade Story
 *
 * Simulates the exact scenario from the TradeVed product spec:
 * Arjun buys 10 TCS shares @ ₹3,800 with Target ₹3,900 and Stop Loss ₹3,750.
 * TCS drops to ₹3,730 (below SL). The system should:
 *   1. Auto-close the position
 *   2. Calculate P&L = -₹700
 *   3. Return capital (minus loss) to account
 *   4. Create a journal entry with tradeOutcome = 'LOSS'
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Models
const User = require('../models/User');
const Account = require('../models/Account');
const Position = require('../models/Position');
const Journal = require('../models/Journal');

// Services
const { runEngineCheck } = require('../services/riskEngine');
const marketDataService = require('../services/marketDataService');

let mongoServer;

// ── Setup & Teardown ───────────────────────────────────────────────────────────

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean all collections between tests
  await Promise.all([
    User.deleteMany({}),
    Account.deleteMany({}),
    Position.deleteMany({}),
    Journal.deleteMany({}),
  ]);
});

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("Arjun's TCS Trade Story", () => {
  let userId;
  let positionId;

  /**
   * STEP 1: Setup — Create user with ₹1,00,000 account
   */
  test('Step 1: Should create a user with ₹1,00,000 virtual account', async () => {
    const user = await User.create({
      username: 'arjun_trader',
      email: 'arjun@tradeved.com',
      hashedPassword: 'TestPass123',
    });
    userId = user._id;

    await Account.create({
      userId,
      balance: 100000,
      buyingPower: 100000,
    });

    const account = await Account.findOne({ userId });
    expect(account).toBeDefined();
    expect(account.balance).toBe(100000);
    expect(account.buyingPower).toBe(100000);
  });

  /**
   * STEP 2: Arjun places a TCS trade
   * Buy 10 shares @ ₹3,800 | SL: ₹3,750 | TP: ₹3,900
   * Cost = ₹38,000 deducted from account
   */
  test('Step 2: Should place a TCS trade and deduct trade cost from account', async () => {
    const user = await User.create({
      username: 'arjun_trader',
      email: 'arjun@tradeved.com',
      hashedPassword: 'TestPass123',
    });
    userId = user._id;

    await Account.create({ userId, balance: 100000, buyingPower: 100000 });

    const tradeCost = 3800 * 10; // ₹38,000

    // Simulate placing a trade (deduct from account)
    await Account.findOneAndUpdate(
      { userId },
      { $inc: { balance: -tradeCost, buyingPower: -tradeCost } }
    );

    const position = await Position.create({
      userId,
      symbol: 'TCS.NS',
      quantity: 10,
      entryPrice: 3800,
      stopLoss: 3750,
      targetPrice: 3900,
      tradeType: 'BUY',
      status: 'OPEN',
    });
    positionId = position._id;

    // Assertions
    expect(position.status).toBe('OPEN');
    expect(position.symbol).toBe('TCS.NS');
    expect(position.quantity).toBe(10);
    expect(position.entryPrice).toBe(3800);
    expect(position.stopLoss).toBe(3750);
    expect(position.targetPrice).toBe(3900);

    const account = await Account.findOne({ userId });
    expect(account.balance).toBe(62000); // 1,00,000 - 38,000
  });

  /**
   * STEP 3 & 4: TCS disappoints — price drops to ₹3,730 (below SL of ₹3,750)
   * Mock the market data service and trigger the risk engine manually.
   * STEP 5: Assert position is CLOSED with P&L = -₹700
   */
  test('Step 3-5: Risk engine should close position when SL is hit (₹3,730 < ₹3,750)', async () => {
    // Seed user + account + position
    const user = await User.create({
      username: 'arjun_trader',
      email: 'arjun@tradeved.com',
      hashedPassword: 'TestPass123',
    });
    userId = user._id;

    await Account.create({ userId, balance: 62000, buyingPower: 62000 });

    const position = await Position.create({
      userId,
      symbol: 'TCS.NS',
      quantity: 10,
      entryPrice: 3800,
      stopLoss: 3750,
      targetPrice: 3900,
      tradeType: 'BUY',
      status: 'OPEN',
    });
    positionId = position._id;

    // Mock getLivePrice to return ₹3,730 (below SL of ₹3,750)
    const mockGetLivePrice = jest
      .spyOn(marketDataService, 'getLivePrice')
      .mockResolvedValue(3730);

    // Manually trigger the risk engine
    await runEngineCheck();

    // Fetch updated position
    const closedPosition = await Position.findById(positionId);

    // Assertions — Position should be CLOSED
    expect(closedPosition.status).toBe('CLOSED');
    expect(closedPosition.closedPrice).toBe(3730);

    // P&L = (3730 - 3800) * 10 = -70 * 10 = -700
    expect(closedPosition.pl).toBe(-700);
    expect(closedPosition.closedAt).not.toBeNull();

    mockGetLivePrice.mockRestore();
  });

  /**
   * STEP 6: Journal entry should be auto-created after position closes
   * tradeOutcome = 'LOSS', autoPrompt should not be empty
   */
  test('Step 6: Should auto-create a LOSS journal entry after SL is hit', async () => {
    // Full setup
    const user = await User.create({
      username: 'arjun_trader',
      email: 'arjun@tradeved.com',
      hashedPassword: 'TestPass123',
    });
    userId = user._id;

    await Account.create({ userId, balance: 62000, buyingPower: 62000 });

    const position = await Position.create({
      userId,
      symbol: 'TCS.NS',
      quantity: 10,
      entryPrice: 3800,
      stopLoss: 3750,
      targetPrice: 3900,
      tradeType: 'BUY',
      status: 'OPEN',
    });

    // Mock price below SL
    jest.spyOn(marketDataService, 'getLivePrice').mockResolvedValue(3730);

    await runEngineCheck();

    // Query journal
    const journalEntries = await Journal.find({ userId });

    expect(journalEntries.length).toBe(1);

    const entry = journalEntries[0];
    expect(entry.tradeOutcome).toBe('LOSS');
    expect(entry.autoPrompt).toBeTruthy();
    expect(entry.autoPrompt.length).toBeGreaterThan(0);
    expect(entry.positionId.toString()).toBe(position._id.toString());
    expect(entry.reflection).toBeNull(); // User hasn't reflected yet

    jest.restoreAllMocks();
  });

  /**
   * BONUS: Target Price scenario — TCS rises to ₹3,910
   */
  test('Bonus: Risk engine should close position as WIN when TP is hit (₹3,910 ≥ ₹3,900)', async () => {
    const user = await User.create({
      username: 'arjun_trader',
      email: 'arjun@tradeved.com',
      hashedPassword: 'TestPass123',
    });
    userId = user._id;

    await Account.create({ userId, balance: 62000, buyingPower: 62000 });

    const position = await Position.create({
      userId,
      symbol: 'TCS.NS',
      quantity: 10,
      entryPrice: 3800,
      stopLoss: 3750,
      targetPrice: 3900,
      tradeType: 'BUY',
      status: 'OPEN',
    });

    // Mock price above target
    jest.spyOn(marketDataService, 'getLivePrice').mockResolvedValue(3910);

    await runEngineCheck();

    const closedPosition = await Position.findById(position._id);
    expect(closedPosition.status).toBe('CLOSED');
    // P&L = (3910 - 3800) * 10 = 110 * 10 = ₹1,100
    expect(closedPosition.pl).toBe(1100);

    const journal = await Journal.findOne({ userId });
    expect(journal).toBeDefined();
    expect(journal.tradeOutcome).toBe('WIN');

    jest.restoreAllMocks();
  });

  /**
   * BONUS: Idempotency test — engine should not double-close a position
   */
  test('Idempotency: Position should only be closed once even if engine fires twice simultaneously', async () => {
    const user = await User.create({
      username: 'arjun_trader',
      email: 'arjun@tradeved.com',
      hashedPassword: 'TestPass123',
    });
    userId = user._id;

    await Account.create({ userId, balance: 62000, buyingPower: 62000 });

    await Position.create({
      userId,
      symbol: 'TCS.NS',
      quantity: 10,
      entryPrice: 3800,
      stopLoss: 3750,
      targetPrice: 3900,
      tradeType: 'BUY',
      status: 'OPEN',
    });

    jest.spyOn(marketDataService, 'getLivePrice').mockResolvedValue(3730);

    // Fire engine twice concurrently
    await Promise.all([runEngineCheck(), runEngineCheck()]);

    // Should still only have one journal entry
    const journals = await Journal.find({ userId });
    expect(journals.length).toBe(1);

    const closedPositions = await Position.find({ userId, status: 'CLOSED' });
    expect(closedPositions.length).toBe(1);

    jest.restoreAllMocks();
  });
});
