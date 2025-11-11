import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Coin Rotation System
 * - Tracks coin performance (volume, spread opportunities)
 * - Removes underperforming coins
 * - Makes room for new trending coins
 */
export class CoinRotationSystem {
  constructor(options = {}) {
    this.dataFile = options.dataFile || join(__dirname, '../data/coin-performance.json');
    this.dataDir = dirname(this.dataFile);
    this.ensureDataDir();
    this.performanceData = this.loadPerformanceData();
    this.rotationHistory = [];
  }

  ensureDataDir() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadPerformanceData() {
    try {
      if (existsSync(this.dataFile)) {
        const data = readFileSync(this.dataFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[rotation] Failed to load performance data:', err.message);
    }
    return {
      coins: {},
      lastUpdate: new Date().toISOString()
    };
  }

  savePerformanceData() {
    try {
      writeFileSync(this.dataFile, JSON.stringify(this.performanceData, null, 2));
    } catch (err) {
      console.error('[rotation] Failed to save performance data:', err.message);
    }
  }

  /**
   * Track coin performance
   * @param {string} symbol - Coin symbol
   * @param {object} metrics - Performance metrics
   */
  trackPerformance(symbol, metrics) {
    if (!this.performanceData.coins[symbol]) {
      this.performanceData.coins[symbol] = {
        symbol,
        addedAt: new Date().toISOString(),
        totalOpportunities: 0,
        totalVolume: 0,
        bestSpread: 0,
        lastSeen: new Date().toISOString(),
        daysTracked: 0
      };
    }

    const coin = this.performanceData.coins[symbol];
    
    // Update metrics
    if (metrics.opportunities) coin.totalOpportunities += metrics.opportunities;
    if (metrics.volume) coin.totalVolume += metrics.volume;
    if (metrics.spread && metrics.spread > coin.bestSpread) {
      coin.bestSpread = metrics.spread;
    }
    
    coin.lastSeen = new Date().toISOString();
    
    // Calculate days tracked
    const addedDate = new Date(coin.addedAt);
    const now = new Date();
    coin.daysTracked = Math.floor((now - addedDate) / (1000 * 60 * 60 * 24));
    
    this.performanceData.lastUpdate = new Date().toISOString();
  }

  /**
   * Calculate coin score based on performance
   * @param {object} coinData - Coin performance data
   * @returns {number} Score (0-100)
   */
  calculateScore(coinData) {
    let score = 0;
    
    // Opportunities per day (max 30 points)
    const opportunitiesPerDay = coinData.totalOpportunities / Math.max(coinData.daysTracked, 1);
    score += Math.min(opportunitiesPerDay * 2, 30);
    
    // Average volume (max 30 points)
    const avgVolume = coinData.totalVolume / Math.max(coinData.daysTracked, 1);
    const volumeScore = Math.min(avgVolume / 100000, 30); // $100k = 30 points
    score += volumeScore;
    
    // Best spread (max 20 points)
    score += Math.min(coinData.bestSpread * 10, 20);
    
    // Recency bonus (max 20 points)
    const daysSinceLastSeen = Math.floor((Date.now() - new Date(coinData.lastSeen)) / (1000 * 60 * 60 * 24));
    const recencyScore = Math.max(20 - daysSinceLastSeen * 2, 0);
    score += recencyScore;
    
    return Math.min(score, 100);
  }

  /**
   * Get underperforming coins
   * @param {number} minScore - Minimum score threshold
   * @param {number} minDays - Minimum days tracked
   * @returns {Array} List of underperforming coins
   */
  getUnderperformingCoins(minScore = 20, minDays = 3) {
    const underperforming = [];
    
    for (const [symbol, data] of Object.entries(this.performanceData.coins)) {
      // Skip coins tracked less than minDays
      if (data.daysTracked < minDays) continue;
      
      const score = this.calculateScore(data);
      
      if (score < minScore) {
        underperforming.push({
          symbol,
          score,
          daysTracked: data.daysTracked,
          totalOpportunities: data.totalOpportunities,
          avgVolume: data.totalVolume / Math.max(data.daysTracked, 1)
        });
      }
    }
    
    // Sort by score (lowest first)
    return underperforming.sort((a, b) => a.score - b.score);
  }

  /**
   * Get top performing coins
   * @param {number} limit - Number of top coins to return
   * @returns {Array} List of top coins
   */
  getTopPerformers(limit = 10) {
    const performers = [];
    
    for (const [symbol, data] of Object.entries(this.performanceData.coins)) {
      const score = this.calculateScore(data);
      performers.push({
        symbol,
        score,
        daysTracked: data.daysTracked,
        totalOpportunities: data.totalOpportunities,
        avgVolume: data.totalVolume / Math.max(data.daysTracked, 1)
      });
    }
    
    // Sort by score (highest first)
    return performers.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Rotate coins: Remove underperforming, add new trending
   * @param {Array} currentCoins - Current coin list
   * @param {Array} trendingCoins - New trending coins
   * @param {number} maxCoins - Maximum coins allowed
   * @returns {object} Rotation result
   */
  rotateCoin(currentCoins, trendingCoins, maxCoins = 100) {
    const removed = [];
    const added = [];
    
    // Get underperforming coins
    const underperforming = this.getUnderperformingCoins(20, 3);
    
    if (underperforming.length === 0) {
      console.log('[rotation] No underperforming coins to remove');
      return { removed, added, message: 'No rotation needed' };
    }
    
    // Calculate available slots
    let availableSlots = maxCoins - currentCoins.length;
    
    // Remove underperforming coins to make room
    for (const coin of underperforming) {
      if (currentCoins.includes(coin.symbol)) {
        const index = currentCoins.indexOf(coin.symbol);
        currentCoins.splice(index, 1);
        removed.push(coin);
        availableSlots++;
        
        console.log(`[rotation] Removed underperforming: ${coin.symbol} (score: ${coin.score.toFixed(2)})`);
        
        // Record rotation
        this.rotationHistory.push({
          timestamp: new Date().toISOString(),
          action: 'removed',
          symbol: coin.symbol,
          reason: 'underperforming',
          score: coin.score
        });
        
        // Stop if we have enough slots
        if (availableSlots >= 5) break;
      }
    }
    
    // Add new trending coins
    for (const coin of trendingCoins) {
      if (availableSlots <= 0) break;
      
      if (!currentCoins.includes(coin.symbol)) {
        // Check if coin has good metrics
        if (coin.volume24h && coin.volume24h > 1000000) {
          currentCoins.push(coin.symbol);
          added.push(coin);
          availableSlots--;
          
          const coinScore = typeof coin.score === 'number' ? coin.score.toFixed(2) : 'n/a';
          console.log(`[rotation] Added trending: ${coin.symbol} (score: ${coinScore})`);
          
          // Record rotation
          this.rotationHistory.push({
            timestamp: new Date().toISOString(),
            action: 'added',
            symbol: coin.symbol,
            reason: 'trending',
            score: coin.score
          });
        }
      }
    }
    
    this.savePerformanceData();
    
    return {
      removed,
      added,
      message: `Rotated ${removed.length} out, ${added.length} in`
    };
  }

  /**
   * Get rotation statistics
   * @returns {object} Rotation stats
   */
  getStats() {
    const totalCoins = Object.keys(this.performanceData.coins).length;
    const topPerformers = this.getTopPerformers(10);
    const underperforming = this.getUnderperformingCoins(20, 3);
    
    return {
      totalTracked: totalCoins,
      topPerformers: topPerformers.slice(0, 5),
      underperforming: underperforming.slice(0, 5),
      recentRotations: this.rotationHistory.slice(-10),
      lastUpdate: this.performanceData.lastUpdate
    };
  }

  /**
   * Clean up old performance data (>30 days)
   */
  cleanup() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [symbol, data] of Object.entries(this.performanceData.coins)) {
      const lastSeen = new Date(data.lastSeen).getTime();
      
      if (lastSeen < thirtyDaysAgo) {
        delete this.performanceData.coins[symbol];
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[rotation] Cleaned up ${cleaned} old coins (>30 days)`);
      this.savePerformanceData();
    }
  }
}
