/**
 * Swagger API Documentation Configuration
 */

export const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Crypto Arbitrage Monitoring API',
    version: '2.0.0',
    description: 'Real-time cryptocurrency arbitrage monitoring and trading system with paper trading, alerts, and analytics',
    contact: {
      name: 'API Support',
      email: 'support@crypto-arbitrage.local'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:8080',
      description: 'Development server'
    },
    {
      url: 'https://api.crypto-arbitrage.local',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for authentication. Can also be passed as query parameter `api_key`.'
      }
    },
    schemas: {
      Opportunity: {
        type: 'object',
        properties: {
          coin: { type: 'string', example: 'BTC' },
          buyExchange: { type: 'string', example: 'binance' },
          buyPrice: { type: 'number', example: 50000 },
          sellExchange: { type: 'string', example: 'coinbase' },
          sellPrice: { type: 'number', example: 51000 },
          grossSpread: { type: 'number', example: 2.0 },
          netSpread: { type: 'number', example: 1.8 },
          qualityScore: { type: 'integer', example: 75 }
        }
      },
      Trade: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          type: { type: 'string', enum: ['buy', 'sell'] },
          exchange: { type: 'string', example: 'binance' },
          coin: { type: 'string', example: 'BTC' },
          amount: { type: 'number', example: 0.01 },
          price: { type: 'number', example: 50000 },
          fee: { type: 'number', example: 5 },
          profit: { type: 'number', example: 100 }
        }
      },
      Performance: {
        type: 'object',
        properties: {
          currentBalance: { type: 'number', example: 10500 },
          profit: { type: 'number', example: 500 },
          profitPercent: { type: 'number', example: 5.0 },
          totalTrades: { type: 'integer', example: 42 },
          winRate: { type: 'number', example: 65.5 },
          profit24h: { type: 'number', example: 120 },
          profit7d: { type: 'number', example: 350 },
          profit30d: { type: 'number', example: 500 }
        }
      },
      Alert: {
        type: 'object',
        properties: {
          type: { type: 'string', example: 'balance_drop' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          message: { type: 'string', example: 'Balance dropped by 10%' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  },
  tags: [
    { name: 'Monitoring', description: 'Real-time arbitrage monitoring endpoints' },
    { name: 'Trading', description: 'Paper trading operations and statistics' },
    { name: 'Alerts', description: 'Alert system and notification management' },
    { name: 'Analytics', description: 'Performance analytics and reporting' },
    { name: 'System', description: 'System management and health' },
    { name: 'Authentication', description: 'API authentication and authorization' }
  ]
};

export const swaggerOptions = {
  swaggerDefinition,
  apis: ['./docs/api/*.yaml', './server.js'] // Path to API docs
};
