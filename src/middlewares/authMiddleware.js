const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * JWT Authentication Middleware.
 * Verifies the Bearer token from the Authorization header.
 * Attaches req.user = { userId, username, email } on success.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user to ensure they still exist
    const user = await User.findById(decoded.userId).select('-hashedPassword');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists.',
      });
    }

    req.user = {
      userId: user._id,
      username: user.username,
      email: user.email,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
    }
    logger.error(`Auth middleware error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { protect };
