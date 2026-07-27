const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `[${ts}] ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : combine(colorize(), logFormat)
  ),
  transports: [
    new winston.transports.Console(),
    // In production you'd add File or external transports here
  ],
});

module.exports = logger;
