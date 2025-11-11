/**
 * Prometheus Metrics Exporter
 * Exports application metrics for Prometheus/Grafana
 */

import client from 'prom-client';

export class PrometheusExporter {
  constructor() {
    // Create a Registry
    this.register = new client.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    client.collectDefaultMetrics({
      register: this.register,
      prefix: 'crypto_arbitrage_'
    });
    
    // Custom metrics
    this.metrics = {
      // Opportunities
      opportunitiesFound: new client.Gauge({
        name: 'crypto_arbitrage_opportunities_total',
        help: 'Total number of arbitrage opportunities found',
        registers: [this.register]
      }),
      
      opportunitySpread: new client.Histogram({
        name: 'crypto_arbitrage_opportunity_spread',
        help: 'Distribution of arbitrage opportunity spreads',
        buckets: [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0],
        registers: [this.register]
      }),
      
      // Trading
      tradesExecuted: new client.Counter({
        name: 'crypto_arbitrage_trades_executed_total',
        help: 'Total number of trades executed',
        labelNames: ['type', 'exchange', 'coin'],
        registers: [this.register]
      }),
      
      tradeProfit: new client.Histogram({
        name: 'crypto_arbitrage_trade_profit_usd',
        help: 'Profit from trades in USD',
        buckets: [-100, -50, -10, 0, 10, 50, 100, 500, 1000],
        registers: [this.register]
      }),
      
      currentBalance: new client.Gauge({
        name: 'crypto_arbitrage_balance_usd',
        help: 'Current balance in USD',
        registers: [this.register]
      }),
      
      totalProfit: new client.Gauge({
        name: 'crypto_arbitrage_profit_total_usd',
        help: 'Total profit in USD',
        registers: [this.register]
      }),
      
      // Exchange Health
      exchangeLatency: new client.Histogram({
        name: 'crypto_arbitrage_exchange_latency_ms',
        help: 'Exchange API latency in milliseconds',
        labelNames: ['exchange'],
        buckets: [100, 500, 1000, 2000, 5000, 10000],
        registers: [this.register]
      }),
      
      exchangeSuccessRate: new client.Gauge({
        name: 'crypto_arbitrage_exchange_success_rate',
        help: 'Exchange API success rate (0-1)',
        labelNames: ['exchange'],
        registers: [this.register]
      }),
      
      exchangeStatus: new client.Gauge({
        name: 'crypto_arbitrage_exchange_healthy',
        help: 'Exchange health status (1=healthy, 0=unhealthy)',
        labelNames: ['exchange'],
        registers: [this.register]
      }),
      
      // Performance
      winRate: new client.Gauge({
        name: 'crypto_arbitrage_win_rate',
        help: 'Trading win rate (0-100)',
        registers: [this.register]
      }),
      
      roiPercent: new client.Gauge({
        name: 'crypto_arbitrage_roi_percent',
        help: 'Return on investment percentage',
        registers: [this.register]
      }),
      
      // Alerts
      alertsSent: new client.Counter({
        name: 'crypto_arbitrage_alerts_sent_total',
        help: 'Total number of alerts sent',
        labelNames: ['type', 'severity'],
        registers: [this.register]
      }),
      
      // API Performance
      httpRequestDuration: new client.Histogram({
        name: 'crypto_arbitrage_http_request_duration_ms',
        help: 'HTTP request duration in milliseconds',
        labelNames: ['method', 'route', 'status'],
        buckets: [10, 50, 100, 500, 1000, 5000],
        registers: [this.register]
      }),
      
      httpRequestsTotal: new client.Counter({
        name: 'crypto_arbitrage_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [this.register]
      }),
      
      // Cache
      cacheHits: new client.Counter({
        name: 'crypto_arbitrage_cache_hits_total',
        help: 'Total cache hits',
        labelNames: ['cache'],
        registers: [this.register]
      }),
      
      cacheMisses: new client.Counter({
        name: 'crypto_arbitrage_cache_misses_total',
        help: 'Total cache misses',
        labelNames: ['cache'],
        registers: [this.register]
      }),
      
      // Coins
      coinsMonitored: new client.Gauge({
        name: 'crypto_arbitrage_coins_monitored',
        help: 'Number of coins being monitored',
        registers: [this.register]
      }),
      
      // WebSocket
      wsConnections: new client.Gauge({
        name: 'crypto_arbitrage_ws_connections_active',
        help: 'Number of active WebSocket connections',
        registers: [this.register]
      }),
      
      wsMessagesReceived: new client.Counter({
        name: 'crypto_arbitrage_ws_messages_received_total',
        help: 'Total WebSocket messages received',
        registers: [this.register]
      })
    };
    
    console.log('[prometheus] Prometheus Exporter initialized');
    console.log('[prometheus] Metrics endpoint ready');
  }

  /**
   * Update opportunity metrics
   */
  recordOpportunity(opportunity) {
    this.metrics.opportunitiesFound.inc();
    this.metrics.opportunitySpread.observe(opportunity.netSpread);
  }

  /**
   * Record trade execution
   */
  recordTrade(trade) {
    this.metrics.tradesExecuted.inc({
      type: trade.type,
      exchange: trade.exchange,
      coin: trade.coin
    });
    
    if (trade.profit !== undefined) {
      this.metrics.tradeProfit.observe(trade.profit);
    }
  }

  /**
   * Update balance metric
   */
  updateBalance(balance) {
    this.metrics.currentBalance.set(balance);
  }

  /**
   * Update profit metric
   */
  updateProfit(profit) {
    this.metrics.totalProfit.set(profit);
  }

  /**
   * Record exchange latency
   */
  recordExchangeLatency(exchange, latency) {
    this.metrics.exchangeLatency.observe({ exchange }, latency);
  }

  /**
   * Update exchange health
   */
  updateExchangeHealth(exchange, successRate, isHealthy) {
    this.metrics.exchangeSuccessRate.set({ exchange }, successRate);
    this.metrics.exchangeStatus.set({ exchange }, isHealthy ? 1 : 0);
  }

  /**
   * Update performance metrics
   */
  updatePerformance(performance) {
    if (performance.winRate !== undefined) {
      this.metrics.winRate.set(performance.winRate);
    }
    if (performance.profitPercent !== undefined) {
      this.metrics.roiPercent.set(performance.profitPercent);
    }
  }

  /**
   * Record alert sent
   */
  recordAlert(type, severity) {
    this.metrics.alertsSent.inc({ type, severity });
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(method, route, status, duration) {
    this.metrics.httpRequestDuration.observe({ method, route, status }, duration);
    this.metrics.httpRequestsTotal.inc({ method, route, status });
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(cache) {
    this.metrics.cacheHits.inc({ cache });
  }

  recordCacheMiss(cache) {
    this.metrics.cacheMisses.inc({ cache });
  }

  /**
   * Update coins monitored
   */
  updateCoinsMonitored(count) {
    this.metrics.coinsMonitored.set(count);
  }

  /**
   * Update WebSocket connections
   */
  updateWsConnections(count) {
    this.metrics.wsConnections.set(count);
  }

  /**
   * Record WebSocket message
   */
  recordWsMessage() {
    this.metrics.wsMessagesReceived.inc();
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics() {
    return await this.register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    return await this.register.getMetricsAsJSON();
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.register.resetMetrics();
    console.log('[prometheus] Metrics reset');
  }
}

// Export singleton
export const prometheusExporter = new PrometheusExporter();
