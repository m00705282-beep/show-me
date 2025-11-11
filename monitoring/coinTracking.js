/**
 * New Coin Tracking System
 * Monitors trending coins and high-volume new listings
 */

import fetch from 'node-fetch';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CoinTrackingSystem {
  constructor(options = {}) {
    this.dataPath = options.dataPath || join(__dirname, '../data/coin-tracking.json');
    this.dataDir = dirname(this.dataPath);
    this.retryOptions = {
      retries: options.retryOptions?.retries ?? 3,
      delayMs: options.retryOptions?.delayMs ?? 1000
    };
    this.fetch = options.fetch || fetch;
    this.trackedCoins = new Set();
    this.trendingHistory = [];
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async fetchJsonWithRetry(url, overrides = {}) {
    const retries = overrides.retries ?? this.retryOptions.retries;
    const delayMs = overrides.delayMs ?? this.retryOptions.delayMs;
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const response = await this.fetch(url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return await response.json();
      } catch (err) {
        attempt++;
        const shouldRetry = attempt <= retries;
        console.error(`[coin-tracking] (${attempt}/${retries}) ${url} failed:`, err.message);
        if (!shouldRetry) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }

    return null;
  }

  async fetchTrendingCoins() {
    try {
      // CoinGecko Trending API (free)
      const data = await this.fetchJsonWithRetry('https://api.coingecko.com/api/v3/search/trending');
      if (!data) return [];
      
      return data.coins.map(item => ({
        id: item.item.id,
        symbol: item.item.symbol.toUpperCase(),
        name: item.item.name,
        marketCapRank: item.item.market_cap_rank,
        priceChange24h: item.item.data?.price_change_percentage_24h?.usd || 0,
        volume24h: item.item.data?.total_volume || 0,
        score: item.item.score,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('[coin-tracking] Failed to fetch trending coins:', err.message);
      return [];
    }
  }

  async fetchNewListings() {
    try {
      // Get recently added coins (last 30 days)
      const data = await this.fetchJsonWithRetry('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false', { retries: 2, delayMs: 1500 });
      if (!data) return [];
      
      // Filter coins added in last 30 days with high volume
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      return data
        .filter(coin => {
          const ath_date = new Date(coin.ath_date).getTime();
          return ath_date > thirtyDaysAgo && coin.total_volume > 1000000; // $1M+ volume
        })
        .map(coin => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          marketCapRank: coin.market_cap_rank,
          priceChange24h: coin.price_change_percentage_24h || 0,
          volume24h: coin.total_volume,
          marketCap: coin.market_cap,
          athDate: coin.ath_date,
          timestamp: new Date().toISOString()
        }))
        .slice(0, 20); // Top 20 new coins
    } catch (err) {
      console.error('[coin-tracking] Failed to fetch new listings:', err.message);
      return [];
    }
  }

  async fetchHighVolatilityCoins() {
    try {
      // Get coins with high 24h price change
      const data = await this.fetchJsonWithRetry('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h', { retries: 2, delayMs: 1500 });
      if (!data) return [];
      
      // Filter coins with >10% price change and high volume
      return data
        .filter(coin => Math.abs(coin.price_change_percentage_24h || 0) > 10 && coin.total_volume > 5000000)
        .map(coin => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          marketCapRank: coin.market_cap_rank,
          priceChange24h: coin.price_change_percentage_24h,
          volume24h: coin.total_volume,
          currentPrice: coin.current_price,
          reason: 'High volatility',
          timestamp: new Date().toISOString()
        }))
        .slice(0, 15);
    } catch (err) {
      console.error('[coin-tracking] Failed to fetch high volatility coins:', err.message);
      return [];
    }
  }

  loadData() {
    try {
      const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
      this.trendingHistory = data.history || [];
      this.trackedCoins = new Set(data.tracked || []);
    } catch (err) {
      this.trendingHistory = [];
      this.trackedCoins = new Set();
    }
  }

  saveData() {
    try {
      const data = {
        tracked: Array.from(this.trackedCoins),
        history: this.trendingHistory.slice(-100), // Keep last 100 entries
        lastUpdate: new Date().toISOString()
      };
      writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[coin-tracking] Failed to save data:', err.message);
    }
  }

  async scan() {
    console.log('[coin-tracking] Starting coin scan...');
    
    this.loadData();

    const [trending, newListings, highVolatility] = await Promise.all([
      this.fetchTrendingCoins(),
      this.fetchNewListings(),
      this.fetchHighVolatilityCoins()
    ]);

    const opportunities = {
      timestamp: new Date().toISOString(),
      trending: trending.slice(0, 10),
      newListings: newListings.slice(0, 10),
      highVolatility: highVolatility.slice(0, 10),
      summary: {
        trendingCount: trending.length,
        newListingsCount: newListings.length,
        highVolatilityCount: highVolatility.length
      }
    };

    // Add to history
    this.trendingHistory.push(opportunities);

    // Update tracked coins
    [...trending, ...newListings, ...highVolatility].forEach(coin => {
      this.trackedCoins.add(coin.symbol);
    });

    this.saveData();

    console.log('[coin-tracking] Scan complete:');
    console.log(`  - Trending: ${trending.length} coins`);
    console.log(`  - New listings: ${newListings.length} coins`);
    console.log(`  - High volatility: ${highVolatility.length} coins`);
    console.log(`  - Total tracked: ${this.trackedCoins.size} coins`);

    return opportunities;
  }

  getTopOpportunities() {
    if (this.trendingHistory.length === 0) return null;
    
    const latest = this.trendingHistory[this.trendingHistory.length - 1];
    
    // Combine and rank by multiple factors
    const allCoins = [
      ...latest.trending.map(c => ({ ...c, source: 'trending', score: c.score || 0 })),
      ...latest.newListings.map(c => ({ ...c, source: 'new', score: Math.abs(c.priceChange24h) })),
      ...latest.highVolatility.map(c => ({ ...c, source: 'volatile', score: Math.abs(c.priceChange24h) }))
    ];

    // Remove duplicates and sort by score
    const uniqueCoins = Array.from(
      new Map(allCoins.map(c => [c.symbol, c])).values()
    ).sort((a, b) => b.score - a.score);

    return {
      timestamp: latest.timestamp,
      topOpportunities: uniqueCoins.slice(0, 20),
      summary: latest.summary
    };
  }
}

export { CoinTrackingSystem };
