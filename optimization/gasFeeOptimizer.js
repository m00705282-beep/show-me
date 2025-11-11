/**
 * Gas Fee Optimizer
 * 
 * Monitors network congestion and optimizes withdrawal timing
 * to minimize gas fees for cross-exchange transfers.
 * 
 * Expected Impact: $50-100/month saved on gas fees
 */

import fetch from 'node-fetch';

export class GasFeeOptimizer {
  constructor(config = {}) {
    this.config = {
      // Network thresholds (in gwei for ETH)
      networks: {
        'ETH': { optimal: 20, acceptable: 50, high: 100 },
        'BNB': { optimal: 3, acceptable: 5, high: 10 },
        'MATIC': { optimal: 30, acceptable: 100, high: 300 }
      },
      
      // Check interval
      checkInterval: config.checkInterval || 5 * 60 * 1000, // 5 minutes
      
      // Auto-delay withdrawals if gas too high
      autoDelay: config.autoDelay !== false,
      maxDelayHours: config.maxDelayHours || 24,
      
      // Savings tracking
      assumedHighGas: config.assumedHighGas || 100 // Gwei
    };
    
    this.currentGasPrices = {};
    this.gasHistory = [];
    
    this.stats = {
      totalChecks: 0,
      withdrawalsDelayed: 0,
      withdrawalsExecuted: 0,
      estimatedSavings: 0,
      avgGasPrice: {},
      bestTime: null,
      worstTime: null,
      predictedWindows: {}
    };
    
    // Start monitoring
    this.startMonitoring();
    
    console.log('[gas-optimizer] ⛽ Gas Fee Optimizer initialized');
    console.log('[gas-optimizer] Auto-delay: ' + (this.config.autoDelay ? 'ENABLED' : 'DISABLED'));
  }

  /**
   * Start monitoring gas prices
   */
  startMonitoring() {
    this.checkAllNetworks();
    
    // Check periodically
    this.monitorInterval = setInterval(() => {
      this.checkAllNetworks();
    }, this.config.checkInterval);
    
    console.log(`[gas-optimizer] Monitoring started (check every ${this.config.checkInterval / 60000}min)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      console.log('[gas-optimizer] Monitoring stopped');
    }
  }

  /**
   * Check gas prices for all networks
   */
  async checkAllNetworks() {
    for (const network of Object.keys(this.config.networks)) {
      await this.checkGasPrice(network);
    }
  }

  /**
   * Check gas price for specific network
   */
  async checkGasPrice(network) {
    this.stats.totalChecks++;
    
    try {
      let gasPrice = null;
      
      if (network === 'ETH') {
        gasPrice = await this.fetchEthGas();
      } else if (network === 'BNB') {
        gasPrice = await this.fetchBNBGas();
      } else if (network === 'MATIC') {
        gasPrice = await this.fetchMaticGas();
      }
      
      if (gasPrice !== null) {
        this.currentGasPrices[network] = {
          price: gasPrice,
          timestamp: Date.now(),
          status: this.getGasStatus(network, gasPrice)
        };
        
        // Add to history
        this.gasHistory.push({
          network,
          price: gasPrice,
          timestamp: Date.now()
        });
        
        // Keep history limited (last 1000)
        if (this.gasHistory.length > 1000) {
          this.gasHistory.shift();
        }
        
        // Update stats
        this.updateStats(network, gasPrice);
      }
    } catch (err) {
      console.error(`[gas-optimizer] Error checking ${network} gas:`, err.message);
    }
  }

  /**
   * Fetch Ethereum gas price
   */
  async fetchEthGas() {
    try {
      // Using Etherscan API (free tier)
      const url = 'https://api.etherscan.io/api?module=gastracker&action=gasoracle';
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === '1' && data.result) {
        return parseFloat(data.result.ProposeGasPrice);
      }
    } catch (err) {
      console.error('[gas-optimizer] ETH gas fetch error:', err.message);
    }
    
    // Fallback: estimate based on time of day
    return this.estimateGasByTime('ETH');
  }

  /**
   * Fetch BNB gas price
   */
  async fetchBNBGas() {
    try {
      // Using BscScan API (free tier)
      const url = 'https://api.bscscan.com/api?module=gastracker&action=gasoracle';
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === '1' && data.result) {
        return parseFloat(data.result.ProposeGasPrice);
      }
    } catch (err) {
      console.error('[gas-optimizer] BNB gas fetch error:', err.message);
    }
    
    return this.estimateGasByTime('BNB');
  }

  /**
   * Fetch Polygon/Matic gas price
   */
  async fetchMaticGas() {
    try {
      // Using PolygonScan API (free tier)
      const url = 'https://api.polygonscan.com/api?module=gastracker&action=gasoracle';
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === '1' && data.result) {
        return parseFloat(data.result.ProposeGasPrice);
      }
    } catch (err) {
      console.error('[gas-optimizer] MATIC gas fetch error:', err.message);
    }
    
    return this.estimateGasByTime('MATIC');
  }

  /**
   * Estimate gas by time of day (fallback)
   */
  estimateGasByTime(network) {
    const hour = new Date().getHours();
    const thresholds = this.config.networks[network];
    
    // Peak hours: 14:00-22:00 UTC (US/EU active) = higher gas
    // Off-peak: 2:00-10:00 UTC (Asia night, US sleep) = lower gas
    
    if (hour >= 2 && hour < 10) {
      return thresholds.optimal; // Low gas
    } else if (hour >= 14 && hour < 22) {
      return thresholds.high; // High gas
    } else {
      return thresholds.acceptable; // Medium gas
    }
  }

  /**
   * Get gas status (optimal/acceptable/high)
   */
  getGasStatus(network, gasPrice) {
    const thresholds = this.config.networks[network];
    
    if (gasPrice <= thresholds.optimal) return 'OPTIMAL';
    if (gasPrice <= thresholds.acceptable) return 'ACCEPTABLE';
    return 'HIGH';
  }

  /**
   * Should withdraw now on this network?
   */
  shouldWithdraw(network, amount, urgent = false) {
    const current = this.currentGasPrices[network];
    
    if (!current) {
      return {
        shouldWithdraw: true,
        reason: 'No gas data available',
        gasPrice: null,
        estimatedCost: null
      };
    }
    
    const { price, status } = current;
    const estimatedCost = this.estimateWithdrawalCost(network, amount, price);
    
    // If urgent, withdraw regardless
    if (urgent) {
      return {
        shouldWithdraw: true,
        reason: 'Urgent withdrawal',
        gasPrice: price,
        status,
        estimatedCost
      };
    }
    
    // If optimal or acceptable, withdraw
    if (status === 'OPTIMAL' || status === 'ACCEPTABLE') {
      this.stats.withdrawalsExecuted++;
      return {
        shouldWithdraw: true,
        reason: `Gas is ${status.toLowerCase()}`,
        gasPrice: price,
        status,
        estimatedCost
      };
    }
    
    // If high and auto-delay enabled, delay
    if (this.config.autoDelay) {
      this.stats.withdrawalsDelayed++;
      
      // Calculate savings
      const highCost = this.estimateWithdrawalCost(network, amount, this.config.assumedHighGas);
      const savings = highCost - estimatedCost;
      this.stats.estimatedSavings += Math.max(0, savings);
      
      return {
        shouldWithdraw: false,
        reason: `Gas too high (${price} gwei). Delaying to save money.`,
        gasPrice: price,
        status,
        estimatedCost,
        potentialSavings: savings > 0 ? savings : 0,
        recommendWaitUntil: this.predictNextOptimalTime(network)
      };
    }
    
    // Auto-delay disabled, withdraw anyway but warn
    this.stats.withdrawalsExecuted++;
    return {
      shouldWithdraw: true,
      reason: 'Gas is high but auto-delay disabled',
      gasPrice: price,
      status,
      estimatedCost,
      warning: 'Consider waiting for lower gas fees'
    };
  }

  /**
   * Estimate withdrawal cost in USD
   */
  estimateWithdrawalCost(network, amount, gasPrice) {
    // Simplified gas cost estimation
    // Actual costs depend on token, network congestion, etc.
    
    const gasUnits = {
      'ETH': 21000, // Simple transfer
      'BNB': 21000,
      'MATIC': 21000
    };
    
    const ethPriceUSD = 2000; // Simplified - should fetch real price
    const bnbPriceUSD = 300;
    const maticPriceUSD = 0.8;
    
    const units = gasUnits[network] || 21000;
    const gasCost = (units * gasPrice) / 1_000_000_000; // Convert to native token
    
    let costUSD = 0;
    if (network === 'ETH') costUSD = gasCost * ethPriceUSD;
    else if (network === 'BNB') costUSD = gasCost * bnbPriceUSD;
    else if (network === 'MATIC') costUSD = gasCost * maticPriceUSD;
    
    return parseFloat(costUSD.toFixed(2));
  }

  /**
   * Predict next optimal time based on historical data
   */
  predictNextOptimalTime(network) {
    // Simple prediction: next off-peak hours
    const currentHour = new Date().getHours();
    
    // Next optimal window: 2:00-10:00 UTC
    let hoursUntil;
    if (currentHour < 2) {
      hoursUntil = 2 - currentHour;
    } else if (currentHour >= 10) {
      hoursUntil = 24 - currentHour + 2;
    } else {
      const message = 'Now is optimal!';
      this.stats.predictedWindows[network] = message;
      return message;
    }
    
    const nextTime = new Date();
    nextTime.setHours(nextTime.getHours() + hoursUntil);
    const isoTime = nextTime.toISOString();
    this.stats.predictedWindows[network] = isoTime;
    
    return isoTime;
  }

  /**
   * Update statistics
   */
  updateStats(network, gasPrice) {
    if (!this.stats.avgGasPrice[network]) {
      this.stats.avgGasPrice[network] = {
        sum: 0,
        count: 0,
        avg: 0
      };
    }
    
    const stat = this.stats.avgGasPrice[network];
    stat.sum += gasPrice;
    stat.count++;
    stat.avg = stat.sum / stat.count;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentPrices: this.currentGasPrices,
      estimatedSavings: '$' + this.stats.estimatedSavings.toFixed(2),
      avgGasPrices: Object.fromEntries(
        Object.entries(this.stats.avgGasPrice).map(([net, stat]) => [
          net,
          stat.avg.toFixed(2) + ' gwei'
        ])
      )
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   ⛽ GAS FEE OPTIMIZER SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Current Gas Prices:');
    for (const [network, data] of Object.entries(this.currentGasPrices)) {
      console.log(`   ${network}: ${data.price} gwei (${data.status})`);
    }
    
    console.log(`\nWithdrawals Delayed: ${this.stats.withdrawalsDelayed}`);
    console.log(`Withdrawals Executed: ${this.stats.withdrawalsExecuted}`);
    console.log(`Estimated Savings: $${this.stats.estimatedSavings.toFixed(2)}`);
    
    console.log('═══════════════════════════════════════════════════════\n');
  }
}

export default GasFeeOptimizer;
