const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TradeVed Paper Trading API',
      version: '1.0.0',
      description:
        'Backend API for TradeVed Paper Trading — practice NSE/BSE trading with virtual money, real price feeds, automatic SL/TP triggers, and behavioral journaling.',
      contact: {
        name: 'TradeVed Team',
        url: 'https://tradeved.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:{port}/api',
        description: 'Local Development Server',
        variables: {
          port: { default: '5000' },
        },
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from /auth/login',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js', './src/models/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
