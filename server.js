require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./src/config/database');
const swaggerSpec = require('./src/config/swagger');
const logger = require('./src/utils/logger');
const { generalLimiter } = require('./src/middlewares/rateLimiter');
const { startRiskEngine } = require('./src/services/riskEngine');

const authRoutes = require('./src/routes/authRoutes');
const tradeRoutes = require('./src/routes/tradeRoutes');

const app = express();

// ── Security Middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body Parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ──────────────────────────────────────────────────────────────
app.use('/api', generalLimiter);

// ── API Documentation ──────────────────────────────────────────────────────────
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'TradeVed Paper Trading API',
    customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
  })
);

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    service: 'TradeVed Paper Trading API',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);

// Journal routes are mounted on tradeRoutes but need a separate portfolio entry point
app.use('/api', tradeRoutes); // exposes /api/portfolio and /api/journal

// ── 404 Handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global Error Handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ── Start Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚀  TradeVed Paper Trading API is running
  📡  Port     : ${PORT}
  🌍  Mode     : ${process.env.NODE_ENV || 'development'}
  📖  API Docs : http://localhost:${PORT}/api/docs
  ❤️  Health   : http://localhost:${PORT}/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    // Start the background risk engine
    startRiskEngine();
  });
};

startServer();

module.exports = app; // exported for testing
