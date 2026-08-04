const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connects to MongoDB using URI from environment variables.
 * Implements retry logic on failure.
 */
const connectDB = async () => {
  const MONGO_URI = process.env.MONGODB_URI;

  
  if (!MONGO_URI) {
    logger.error('MONGODB_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(MONGO_URI);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    // Retry after 5 seconds
    logger.info('Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

// Graceful shutdown


process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed due to app termination.');
  process.exit(0);
});

module.exports = connectDB;
