/**
 * Cache Manager
 * In-memory caching for improved performance
 */

import NodeCache from 'node-cache';

export class CacheManager {
  constructor(options = {}) {
    // Default cache settings
    this.caches = {
      // Snapshot cache (30 seconds)
      snapshot: new NodeCache({
        stdTTL: options.snapshotTTL || 30,
        checkperiod: 10,
        useClones: false
      }),
      
      // Opportunity cache (60 seconds)
      opportunities: new NodeCache({
        stdTTL: options.opportunitiesTTL || 60,
        checkperiod: 15,
        useClones: false
      }),
      
      // Performance metrics cache (5 minutes)
      performance: new NodeCache({
        stdTTL: options.performanceTTL || 300,
        checkperiod: 60,
        useClones: false
      }),
      
      // Exchange prices cache (15 seconds)
      prices: new NodeCache({
        stdTTL: options.pricesTTL || 15,
        checkperiod: 5,
        useClones: false
      }),
      
      // Analytics cache (10 minutes)
      analytics: new NodeCache({
        stdTTL: options.analyticsTTL || 600,
        checkperiod: 120,
        useClones: false
      }),
      
      // System stats cache (1 minute)
      system: new NodeCache({
        stdTTL: options.systemTTL || 60,
        checkperiod: 15,
        useClones: false
      })
    };
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
    
    // Setup event listeners
    this.setupEventListeners();
    
    console.log('[cache] Cache Manager initialized');
    console.log('[cache] Cache TTLs:', {
      snapshot: options.snapshotTTL || 30,
      opportunities: options.opportunitiesTTL || 60,
      performance: options.performanceTTL || 300,
      prices: options.pricesTTL || 15,
      analytics: options.analyticsTTL || 600,
      system: options.systemTTL || 60
    });
  }

  /**
   * Setup event listeners for cache statistics
   */
  setupEventListeners() {
    Object.entries(this.caches).forEach(([name, cache]) => {
      cache.on('set', (key, value) => {
        this.stats.sets++;
        console.debug(`[cache] set:${name}:${key}`, value);
      });
      
      cache.on('del', (key, value) => {
        this.stats.deletes++;
        console.debug(`[cache] del:${name}:${key}`, value);
      });
      
      cache.on('expired', (key, value) => {
        console.log(`[cache] Expired: ${name}:${key}`);
        if (value !== undefined) {
          console.debug(`[cache] expired value:${name}:${key}`, value);
        }
      });
    });
  }

  /**
   * Get value from cache
   */
  get(cacheName, key) {
    if (!this.caches[cacheName]) {
      console.error(`[cache] Unknown cache: ${cacheName}`);
      return null;
    }
    
    const value = this.caches[cacheName].get(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      return value;
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Set value in cache
   */
  set(cacheName, key, value, ttl = null) {
    if (!this.caches[cacheName]) {
      console.error(`[cache] Unknown cache: ${cacheName}`);
      return false;
    }
    
    if (ttl !== null) {
      return this.caches[cacheName].set(key, value, ttl);
    }
    
    return this.caches[cacheName].set(key, value);
  }

  /**
   * Delete key from cache
   */
  delete(cacheName, key) {
    if (!this.caches[cacheName]) {
      return false;
    }
    
    return this.caches[cacheName].del(key);
  }

  /**
   * Clear entire cache
   */
  clear(cacheName) {
    if (cacheName) {
      if (this.caches[cacheName]) {
        this.caches[cacheName].flushAll();
        console.log(`[cache] Cleared cache: ${cacheName}`);
        return true;
      }
      return false;
    }
    
    // Clear all caches
    Object.values(this.caches).forEach(cache => cache.flushAll());
    console.log('[cache] Cleared all caches');
    return true;
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet(cacheName, key, fetchFunction, ttl = null) {
    // Try to get from cache first
    const cached = this.get(cacheName, key);
    if (cached !== null) {
      return cached;
    }
    
    // Cache miss - fetch fresh data
    try {
      const value = await fetchFunction();
      this.set(cacheName, key, value, ttl);
      return value;
    } catch (err) {
      console.error(`[cache] Error fetching data for ${cacheName}:${key}:`, err.message);
      throw err;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const cacheStats = {};
    
    Object.entries(this.caches).forEach(([name, cache]) => {
      const stats = cache.getStats();
      cacheStats[name] = {
        keys: cache.keys().length,
        hits: stats.hits,
        misses: stats.misses,
        ksize: stats.ksize,
        vsize: stats.vsize
      };
    });
    
    return {
      global: this.stats,
      caches: cacheStats,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Get all keys from a cache
   */
  keys(cacheName) {
    if (!this.caches[cacheName]) {
      return [];
    }
    
    return this.caches[cacheName].keys();
  }

  /**
   * Check if key exists in cache
   */
  has(cacheName, key) {
    if (!this.caches[cacheName]) {
      return false;
    }
    
    return this.caches[cacheName].has(key);
  }

  /**
   * Get multiple keys at once
   */
  mget(cacheName, keys) {
    if (!this.caches[cacheName]) {
      return {};
    }
    
    return this.caches[cacheName].mget(keys);
  }

  /**
   * Set multiple keys at once
   */
  mset(cacheName, keyValuePairs) {
    if (!this.caches[cacheName]) {
      return false;
    }
    
    return this.caches[cacheName].mset(keyValuePairs);
  }

  /**
   * Close all caches
   */
  close() {
    Object.values(this.caches).forEach(cache => cache.close());
    console.log('[cache] All caches closed');
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
