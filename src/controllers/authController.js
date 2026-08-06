const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Account = require('../models/Account');
const logger = require('../utils/logger');

/**
 * Generates a signed JWT for the given userId.
 * @param {string} userId
 * @returns {string}
 */
const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * POST /api/auth/register
 * Creates a new user and initialises their virtual trading account.
 */
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check for existing user
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      return res.status(409).json({
        success: false,
        message: `An account with this ${field} already exists.`,
      });
    }

    // Create user — hashedPassword is hashed by the pre-save hook
    
    
    const user = await User.create({ username, email, hashedPassword: password });

    // Initialise virtual account with ₹1,00,000
    const account = await Account.create({
      userId: user._id,
      balance: 100000,
      buyingPower: 100000,
    });

    const token = signToken(user._id);

    logger.info(`New user registered: ${username} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to TradeVed!',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
      account: {
        balance: account.balance,
        buyingPower: account.buyingPower,
      },
    });
  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken(user._id);
    logger.info(`User logged in: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

/**
 * GET /api/auth/me
 * Returns the current user's profile and account summary.
 */
const getMe = async (req, res) => {
  try {
    const account = await Account.findOne({ userId: req.user.userId });
    res.status(200).json({
      success: true,
      user: req.user,
      account: account
        ? { balance: account.balance, buyingPower: account.buyingPower }
        : null,
    });
  } catch (error) {
    logger.error(`GetMe error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { register, login, getMe };
