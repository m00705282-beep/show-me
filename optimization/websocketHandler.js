/**
 * WebSocket Handler for Real-time Price Updates
 * Reduces latency from 30s to <1s
 */

export class WebSocketHandler {
  constructor(exchanges) {
    this.exchanges = exchanges;
    this.connections = new Map();
    this.priceCache = new Map();
    this.subscribers = [];
  }

  /**
   * Initialize WebSocket connections for supported exchanges
   * @param {Array} coins - List of coins to watch
   */
  async initialize(coins) {
    console.log('[ws] Initializing WebSocket connections...');
    
    // Priority exchanges with best WebSocket support
    const priorityExchanges = [
      'binance', 'kraken', 'coinbase', 'bitfinex', 'kucoin',
      'okx', 'bybit', 'gateio', 'huobi'
    ];
    
    let connected = 0;
    
    for (const exchange of this.exchanges) {
      // Only connect to priority exchanges for now
      if (!priorityExchanges.includes(exchange.id)) {
        continue;
      }
      
      // Check if exchange supports WebSocket
      if (exchange.has['watchTicker'] || exchange.has['watchTickers']) {
        try {
          await this.connectExchange(exchange, coins);
          connected++;
          console.log(`[ws] ✅ Connected to ${exchange.id}`);
        } catch (err) {
          console.error(`[ws] ❌ Failed to connect ${exchange.id}:`, err.message);
        }
      }
    }
    
    console.log(`[ws] Connected to ${connected}/${priorityExchanges.length} priority exchanges`);
  }

  /**
   * Connect to exchange WebSocket
   * @param {Object} exchange - CCXT exchange instance
   * @param {Array} coins - List of coins to watch
   */
  async connectExchange(exchange, coins) {
    // Only watch top 5 coins for WebSocket (to reduce load)
    const topCoins = ['BTC', 'ETH', 'XRP', 'BNB', 'SOL'];
    const watchCoins = coins.filter(c => topCoins.includes(c)).slice(0, 5);
    const symbols = watchCoins.map(coin => `${coin}/USDT`);
    
    // Start watching tickers (non-blocking)
    for (const symbol of symbols) {
      try {
        // Don't await - let it run in background
        this.watchTicker(exchange, symbol);
      } catch (err) {
        // Ignore errors for unsupported pairs
      }
    }
    
    this.connections.set(exchange.id, {
      exchange,
      symbols,
      connected: true,
      lastUpdate: Date.now()
    });
  }

  /**
   * Watch ticker updates for a symbol
   * @param {Object} exchange - CCXT exchange instance
   * @param {string} symbol - Trading pair symbol
   */
  async watchTicker(exchange, symbol) {
    try {
      while (this.connections.get(exchange.id)?.connected) {
        const ticker = await exchange.watchTicker(symbol);
        
        if (ticker?.bid && ticker?.ask) {
          this.updatePrice(exchange.id, symbol, {
            bid: ticker.bid,
            ask: ticker.ask,
            timestamp: ticker.timestamp || Date.now()
          });
        }
      }
    } catch (err) {
      console.error(`[ws] Error watching ${symbol} on ${exchange.id}:`, err.message);
      const connection = this.connections.get(exchange.id);
      if (connection) {
        connection.connected = false;
      }
    }
  }

  /**
   * Update price cache and notify subscribers
   * @param {string} exchangeId - Exchange ID
   * @param {string} symbol - Trading pair symbol
   * @param {Object} price - Price data
   */
  updatePrice(exchangeId, symbol, price) {
    const key = `${exchangeId}:${symbol}`;
    this.priceCache.set(key, price);
    
    // Notify subscribers
    this.notifySubscribers({
      exchange: exchangeId,
      symbol,
      price
    });
  }

  /**
   * Get latest price from cache
   * @param {string} exchangeId - Exchange ID
   * @param {string} symbol - Trading pair symbol
   * @returns {Object|null} Price data
   */
  getPrice(exchangeId, symbol) {
    const key = `${exchangeId}:${symbol}`;
    return this.priceCache.get(key) || null;
  }

  /**
   * Subscribe to price updates
   * @param {Function} callback - Callback function
   */
  subscribe(callback) {
    this.subscribers.push(callback);
  }

  /**
   * Notify all subscribers of price update
   * @param {Object} update - Price update
   */
  notifySubscribers(update) {
    for (const callback of this.subscribers) {
      try {
        callback(update);
      } catch (err) {
        console.error('[ws] Subscriber callback error:', err.message);
      }
    }
  }

  /**
   * Find arbitrage opportunities from WebSocket data
   * @param {string} coin - Coin symbol
   * @returns {Object|null} Arbitrage opportunity
   */
  findOpportunity(coin) {
    const symbol = `${coin}/USDT`;
    const prices = [];
    
    // Collect prices from all exchanges
    for (const [exchangeId] of this.connections) {
      const price = this.getPrice(exchangeId, symbol);
      if (price) {
        prices.push({
          exchange: exchangeId,
          bid: price.bid,
          ask: price.ask
        });
      }
    }
    
    if (prices.length < 2) return null;
    
    // Find best buy and sell prices
    const bestBid = Math.max(...prices.map(p => p.bid));
    const bestAsk = Math.min(...prices.map(p => p.ask));
    const buyMarket = prices.find(p => p.ask === bestAsk)?.exchange;
    const sellMarket = prices.find(p => p.bid === bestBid)?.exchange;
    
    if (buyMarket && sellMarket && buyMarket !== sellMarket) {
      const grossSpread = ((bestBid - bestAsk) / bestAsk) * 100;
      
      if (grossSpread > 0) {
        return {
          coin,
          buyMarket,
          sellMarket,
          buyPrice: bestAsk,
          sellPrice: bestBid,
          grossSpread,
          timestamp: Date.now()
        };
      }
    }
    
    return null;
  }

  /**
   * Close all WebSocket connections
   */
  async close() {
    console.log('[ws] Closing WebSocket connections...');
    
    for (const [exchangeId, connection] of this.connections) {
      try {
        if (connection.exchange.close) {
          await connection.exchange.close();
        }
      } catch (err) {
        console.error(`[ws] Error closing ${exchangeId}:`, err.message);
      }
    }
    
    this.connections.clear();
    this.priceCache.clear();
    console.log('[ws] All connections closed');
  }

  /**
   * Get WebSocket statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      connections: this.connections.size,
      cachedPrices: this.priceCache.size,
      subscribers: this.subscribers.length,
      exchanges: Array.from(this.connections.keys())
    };
  }
}
