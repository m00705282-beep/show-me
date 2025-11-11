/**
 * Batch Processor for API Requests
 * Reduces API calls by 100× using fetchTickers instead of individual fetchTicker calls
 */

export class BatchProcessor {
  constructor(exchanges, healthMonitor = null) {
    this.exchanges = exchanges;
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 seconds cache
    this.healthMonitor = healthMonitor;
  }

  /**
   * Fetch all tickers for multiple coins in one API call
   * @param {Array} coins - List of coin symbols
   * @returns {Object} Map of exchange -> coin -> ticker data
   */
  async fetchAllTickers(coins) {
    const results = {};
    const startTime = Date.now();
    
    // Parallel fetch from all exchanges
    const promises = this.exchanges.map(async (exchange) => {
      const fetchStart = Date.now();
      
      try {
        // Check if exchange supports fetchTickers with multiple symbols
        if (exchange.has['fetchTickers']) {
          try {
            // Try batch fetch (no symbols argument = fetch all)
            const tickers = await exchange.fetchTickers();
            const fetchLatency = Date.now() - fetchStart;
            
            // Record successful fetch
            if (this.healthMonitor) {
              this.healthMonitor.recordFetch(exchange.id, true, fetchLatency);
            }
            
            // Process results - filter for our coins
            const exchangeData = {};
            for (const [symbol, ticker] of Object.entries(tickers)) {
              const coin = symbol.split('/')[0];
              const quote = symbol.split('/')[1];
              
              // Only USDT pairs
              if (quote === 'USDT' && coins.includes(coin) && ticker?.bid && ticker?.ask) {
                exchangeData[coin] = {
                  bid: ticker.bid,
                  ask: ticker.ask,
                  timestamp: ticker.timestamp || Date.now()
                };
              }
            }
            
            return { exchange: exchange.id, data: exchangeData };
          } catch (err) {
            const fetchLatency = Date.now() - fetchStart;
            
            // Record failed fetch
            if (this.healthMonitor) {
              this.healthMonitor.recordFetch(exchange.id, false, fetchLatency, err.message);
            }
            
            // Fallback to individual calls if batch fails
            return this.fetchIndividualTickers(exchange, coins);
          }
        } else {
          // Fallback to individual fetchTicker calls
          return this.fetchIndividualTickers(exchange, coins);
        }
      } catch (err) {
        const fetchLatency = Date.now() - fetchStart;
        
        // Record failed fetch
        if (this.healthMonitor) {
          this.healthMonitor.recordFetch(exchange.id, false, fetchLatency, err.message);
        }
        
        console.error(`[batch] Failed to fetch tickers from ${exchange.id}:`, err.message);
        return { exchange: exchange.id, data: {} };
      }
    });
    
    const exchangeResults = await Promise.all(promises);
    
    // Organize results by exchange
    for (const result of exchangeResults) {
      if (result && result.data) {
        results[result.exchange] = result.data;
      }
    }
    
    const duration = Date.now() - startTime;
    const totalCoins = Object.values(results).reduce((sum, data) => sum + Object.keys(data).length, 0);
    console.log(`[batch] Fetched ${totalCoins} coin prices from ${this.exchanges.length} exchanges in ${duration}ms`);
    
    return results;
  }

  /**
   * Fallback: Fetch individual tickers for exchanges that don't support fetchTickers
   * @param {Object} exchange - CCXT exchange instance
   * @param {Array} coins - List of coin symbols
   * @returns {Object} Exchange data
   */
  async fetchIndividualTickers(exchange, coins) {
    const data = {};
    
    for (const coin of coins) {
      try {
        const ticker = await exchange.fetchTicker(`${coin}/USDT`);
        if (ticker?.bid && ticker?.ask) {
          data[coin] = {
            bid: ticker.bid,
            ask: ticker.ask,
            timestamp: ticker.timestamp || Date.now()
          };
        }
      } catch (err) {
        // Ignore errors (pair doesn't exist on this exchange)
      }
    }
    
    return { exchange: exchange.id, data };
  }

  /**
   * Get cached ticker or fetch new one
   * @param {string} exchange - Exchange ID
   * @param {string} coin - Coin symbol
   * @returns {Object|null} Ticker data
   */
  getCachedTicker(exchange, coin) {
    const key = `${exchange}:${coin}`;
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    return null;
  }

  /**
   * Update cache with new ticker data
   * @param {string} exchange - Exchange ID
   * @param {string} coin - Coin symbol
   * @param {Object} data - Ticker data
   */
  updateCache(exchange, coin, data) {
    const key = `${exchange}:${coin}`;
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear old cache entries
   */
  clearOldCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Find arbitrage opportunities from batch data
   * @param {Object} batchData - Data from fetchAllTickers
   * @param {Array} coins - List of coins to analyze
   * @returns {Array} List of arbitrage opportunities
   */
  findArbitrageOpportunities(batchData, coins) {
    const opportunities = [];
    
    for (const coin of coins) {
      const prices = [];
      
      // Collect prices from all exchanges
      for (const [exchange, data] of Object.entries(batchData)) {
        if (data[coin]) {
          prices.push({
            exchange,
            bid: data[coin].bid,
            ask: data[coin].ask
          });
        }
      }
      
      if (prices.length < 2) continue;
      
      // Find best buy and sell prices
      const bestBid = Math.max(...prices.map(p => p.bid));
      const bestAsk = Math.min(...prices.map(p => p.ask));
      const buyMarket = prices.find(p => p.ask === bestAsk)?.exchange;
      const sellMarket = prices.find(p => p.bid === bestBid)?.exchange;
      
      if (buyMarket && sellMarket && buyMarket !== sellMarket) {
        const grossSpread = ((bestBid - bestAsk) / bestAsk) * 100;
        
        if (grossSpread > 0) {
          opportunities.push({
            coin,
            buyMarket,
            sellMarket,
            buyPrice: bestAsk,
            sellPrice: bestBid,
            grossSpread
          });
        }
      }
    }
    
    return opportunities.sort((a, b) => b.grossSpread - a.grossSpread);
  }

  /**
   * Get statistics about batch processing
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout,
      exchanges: this.exchanges.length
    };
  }
}
