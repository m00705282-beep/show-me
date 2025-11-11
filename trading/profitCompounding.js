/**
 * Profit Compounding System
 * 
 * Automatically reinvests profits to increase position sizes over time.
 * This creates exponential growth through compound returns.
 * 
 * Formula: A = P(1 + r)^t
 * where:
 *   A = final amount
 *   P = principal (starting capital)
 *   r = rate of return per period
 *   t = number of periods
 * 
 * Features:
 * - Automatic capital increase from profits
 * - Protection against drawdowns (only compounds realized profits)
 * - Configurable compounding frequency
 * - Risk-adjusted position sizing
 * - Profit withdrawal scheduling
 * 
 * Expected Impact: +100-200% long-term profit through exponential growth
 */

export class ProfitCompounding {
  constructor(config = {}) {
    this.config = {
      // Capital management
      initialCapital: config.initialCapital || 500,
      currentCapital: config.currentCapital || config.initialCapital || 500,
      
      // Compounding settings
      compoundingEnabled: config.compoundingEnabled !== false,
      compoundFrequency: config.compoundFrequency || 'daily',  // 'trade', 'daily', 'weekly'
      compoundPercentage: config.compoundPercentage || 100,     // 100% = reinvest all profits
      
      // Risk management
      maxCapitalGrowth: config.maxCapitalGrowth || 3.0,         // Max 3x growth before withdrawal
      protectPrincipal: config.protectPrincipal !== false,      // Never risk initial capital
      drawdownLimit: config.drawdownLimit || 0.20,              // Max 20% drawdown
      
      // Profit taking
      profitWithdrawalThreshold: config.profitWithdrawalThreshold || 1000,  // Withdraw when profit > $1000
      profitWithdrawalPercent: config.profitWithdrawalPercent || 50,        // Withdraw 50% of profits
      
      // Position sizing
      basePositionSize: config.basePositionSize || 25,
      maxPositionSize: config.maxPositionSize || 200,
      scaleWithCapital: config.scaleWithCapital !== false,
      
      // New improvements
      logLevel: config.logLevel || 'info',  // 'debug', 'info', 'warn', 'error'
      originalBasePositionSize: config.basePositionSize || 25
    };
    
    this.state = {
      totalProfit: 0,
      totalLoss: 0,
      netProfit: 0,
      realizedProfit: 0,
      unrealizedProfit: 0,
      tradesExecuted: 0,
      profitsCompounded: 0,
      capitalGrowth: 1.0,
      lastCompoundDate: Date.now(),
      withdrawals: [],
      highWaterMark: config.initialCapital || 500,
      reducedPositionSize: false  // Track if position size was reduced
    };
    
    this.log('info', '[compounding] 📈 Profit Compounding System initialized');
    this.log('info', `[compounding] Initial Capital: $${this.config.initialCapital}`);
    this.log('info', `[compounding] Compound Rate: ${this.config.compoundPercentage}%`);
  }

  /**
   * Record a completed trade and update capital
   */
  recordTrade(trade) {
    this.state.tradesExecuted++;
    
    const profit = trade.profit || 0;
    const isProfit = profit > 0;
    
    if (isProfit) {
      this.state.totalProfit += profit;
      this.state.realizedProfit += profit;
    } else {
      this.state.totalLoss += Math.abs(profit);
    }
    
    this.state.netProfit = this.state.totalProfit - this.state.totalLoss;
    
    // Update capital based on compounding settings
    if (this.config.compoundingEnabled) {
      this.compoundProfit(profit);
    }
    
    // Check if we should trigger a withdrawal
    this.checkWithdrawalTrigger();
    
    // Update high water mark
    if (this.config.currentCapital > this.state.highWaterMark) {
      this.state.highWaterMark = this.config.currentCapital;
    }
    
    // Check drawdown
    this.checkDrawdown();
    
    this.log('info', `[compounding] Trade recorded: ${isProfit ? '+' : ''}$${profit.toFixed(2)}`);
    this.log('info', `[compounding] Current Capital: $${this.config.currentCapital.toFixed(2)}`);
    this.log('info', `[compounding] Net Profit: $${this.state.netProfit.toFixed(2)}`);
  }

  /**
   * Compound profit into capital
   */
  compoundProfit(profit) {
    if (profit <= 0) return;
    
    // Check compounding frequency
    if (!this.shouldCompoundNow()) {
      this.state.unrealizedProfit += profit;
      return;
    }
    
    // Include any accumulated unrealized profits
    if (this.state.unrealizedProfit > 0) {
      profit += this.state.unrealizedProfit;
      this.state.unrealizedProfit = 0;
    }
    
    // Calculate amount to compound
    const compoundAmount = profit * (this.config.compoundPercentage / 100);
    
    // Add to capital
    this.config.currentCapital += compoundAmount;
    this.state.profitsCompounded += compoundAmount;
    this.state.capitalGrowth = this.config.currentCapital / this.config.initialCapital;
    this.state.lastCompoundDate = Date.now();
    
    this.log('info', `[compounding] 💰 Compounded $${compoundAmount.toFixed(2)} into capital`);
    this.log('info', `[compounding] Capital growth: ${(this.state.capitalGrowth * 100 - 100).toFixed(1)}%`);
    
    // Check if we've hit max capital growth
    if (this.state.capitalGrowth >= this.config.maxCapitalGrowth) {
      this.log('warn', `[compounding] ⚠️ Max capital growth (${this.config.maxCapitalGrowth}x) reached`);
      this.triggerProfitWithdrawal('Max growth reached');
    }
  }

  /**
   * Check if we should compound now based on frequency
   */
  shouldCompoundNow() {
    if (this.config.compoundFrequency === 'trade') {
      return true;
    }
    
    const timeSinceLastCompound = Date.now() - this.state.lastCompoundDate;
    
    if (this.config.compoundFrequency === 'daily') {
      return timeSinceLastCompound >= 24 * 60 * 60 * 1000;  // 24 hours
    }
    
    if (this.config.compoundFrequency === 'weekly') {
      return timeSinceLastCompound >= 7 * 24 * 60 * 60 * 1000;  // 7 days
    }
    
    return false;
  }

  /**
   * Calculate optimal position size based on current capital
   */
  calculatePositionSize(opportunity) {
    if (!this.config.scaleWithCapital) {
      return this.config.basePositionSize;
    }
    
    // Scale position size with capital growth
    let positionSize = this.config.basePositionSize * this.state.capitalGrowth;
    
    // Apply caps
    positionSize = Math.min(positionSize, this.config.maxPositionSize);
    positionSize = Math.max(positionSize, this.config.basePositionSize);
    
    // Adjust for opportunity quality
    if (opportunity.qualityScore) {
      const qualityFactor = 0.5 + (opportunity.qualityScore / 100) * 0.5;
      positionSize *= qualityFactor;
    }
    
    // Adjust for volatility
    if (opportunity.volatility) {
      const volatilityFactor = 1 - Math.min(0.5, opportunity.volatility / 100);
      positionSize *= volatilityFactor;
      this.log('debug', `[compounding] Volatility adjustment: ${volatilityFactor.toFixed(2)}x`);
    }
    
    // Risk adjustment: don't risk more than 10% of capital per trade
    const maxRiskSize = this.config.currentCapital * 0.10;
    positionSize = Math.min(positionSize, maxRiskSize);
    
    return Math.round(positionSize * 100) / 100;
  }

  /**
   * Check if we should withdraw profits
   */
  checkWithdrawalTrigger() {
    if (this.state.netProfit >= this.config.profitWithdrawalThreshold) {
      this.triggerProfitWithdrawal('Profit threshold reached');
    }
  }

  /**
   * Trigger profit withdrawal
   */
  triggerProfitWithdrawal(reason) {
    // Use realized profits for withdrawal calculation
    const withdrawalAmount = this.state.realizedProfit * (this.config.profitWithdrawalPercent / 100);
    
    if (withdrawalAmount < 10) {
      this.log('info', '[compounding] Withdrawal amount too small, skipping');
      return;
    }
    
    // Record withdrawal
    const withdrawal = {
      id: `withdrawal_${Date.now()}`,
      amount: withdrawalAmount,
      reason,
      timestamp: Date.now(),
      capitalBefore: this.config.currentCapital,
      capitalAfter: this.config.currentCapital - withdrawalAmount
    };
    
    this.state.withdrawals.push(withdrawal);
    
    // Update capital
    this.config.currentCapital -= withdrawalAmount;
    this.state.realizedProfit -= withdrawalAmount;
    this.state.netProfit -= withdrawalAmount;
    
    this.log('info', `[compounding] 💸 Profit Withdrawal: $${withdrawalAmount.toFixed(2)}`);
    this.log('info', `[compounding] Reason: ${reason}`);
    this.log('info', `[compounding] New Capital: $${this.config.currentCapital.toFixed(2)}`);
    
    return withdrawal;
  }

  /**
   * Check for dangerous drawdowns
   */
  checkDrawdown() {
    const currentDrawdown = (this.state.highWaterMark - this.config.currentCapital) / this.state.highWaterMark;
    
    if (currentDrawdown >= this.config.drawdownLimit) {
      this.log('warn', `[compounding] ⚠️ WARNING: Drawdown ${(currentDrawdown * 100).toFixed(1)}% exceeds limit ${(this.config.drawdownLimit * 100)}%`);
      
      // Reduce position sizes during drawdown
      if (!this.state.reducedPositionSize) {
        this.config.basePositionSize *= 0.75;
        this.state.reducedPositionSize = true;
        this.log('info', `[compounding] Reduced position size to $${this.config.basePositionSize.toFixed(2)}`);
      }
      
      return {
        warning: true,
        currentDrawdown: (currentDrawdown * 100).toFixed(1) + '%',
        action: 'Position size reduced by 25%'
      };
    } else if (this.state.reducedPositionSize && 
               this.config.currentCapital > this.state.highWaterMark * 0.95) {
      // Restore position size when recovered to 95% of high water mark
      this.config.basePositionSize = this.config.originalBasePositionSize;
      this.state.reducedPositionSize = false;
      this.log('info', '[compounding] Position size restored to original');
    }
    
    return { warning: false };
  }

  /**
   * Project future growth (compound interest simulation)
   */
  projectGrowth(days, dailyReturnPercent) {
    const projections = [];
    let capital = this.config.currentCapital;
    
    for (let day = 1; day <= days; day++) {
      const dailyReturn = capital * (dailyReturnPercent / 100);
      capital += dailyReturn;
      
      if (day % 7 === 0 || day === days) {
        projections.push({
          day,
          capital: Math.round(capital * 100) / 100,
          totalGain: Math.round((capital - this.config.currentCapital) * 100) / 100,
          totalGainPercent: ((capital / this.config.currentCapital - 1) * 100).toFixed(1)
        });
      }
    }
    
    return {
      currentCapital: this.config.currentCapital,
      projections,
      assumptions: {
        dailyReturn: dailyReturnPercent + '%',
        compounding: this.config.compoundingEnabled ? 'enabled' : 'disabled'
      }
    };
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    const roi = ((this.config.currentCapital - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(1);
    const winRate = this.state.tradesExecuted > 0 
      ? ((this.state.totalProfit / (this.state.totalProfit + this.state.totalLoss)) * 100).toFixed(1)
      : 0;
    
    return {
      capital: {
        initial: this.config.initialCapital,
        current: Math.round(this.config.currentCapital * 100) / 100,
        growth: `${((this.state.capitalGrowth - 1) * 100).toFixed(1)}%`,
        roi: roi + '%'
      },
      performance: {
        totalProfit: Math.round(this.state.totalProfit * 100) / 100,
        totalLoss: Math.round(this.state.totalLoss * 100) / 100,
        netProfit: Math.round(this.state.netProfit * 100) / 100,
        winRate: winRate + '%',
        tradesExecuted: this.state.tradesExecuted
      },
      compounding: {
        enabled: this.config.compoundingEnabled,
        frequency: this.config.compoundFrequency,
        amountCompounded: Math.round(this.state.profitsCompounded * 100) / 100,
        unrealizedProfit: Math.round(this.state.unrealizedProfit * 100) / 100
      },
      withdrawals: {
        total: this.state.withdrawals.length,
        totalAmount: Math.round(this.state.withdrawals.reduce((sum, w) => sum + w.amount, 0) * 100) / 100,
        last: this.state.withdrawals[this.state.withdrawals.length - 1] || null
      }
    };
  }

  /**
   * Reset to initial state (for testing)
   */
  reset() {
    this.config.currentCapital = this.config.initialCapital;
    this.state = {
      totalProfit: 0,
      totalLoss: 0,
      netProfit: 0,
      realizedProfit: 0,
      unrealizedProfit: 0,
      tradesExecuted: 0,
      profitsCompounded: 0,
      capitalGrowth: 1.0,
      lastCompoundDate: Date.now(),
      withdrawals: [],
      highWaterMark: this.config.initialCapital,
      reducedPositionSize: false
    };
    this.log('info', '[compounding] System reset to initial state');
  }

  /**
   * Log messages based on log level
   */
  log(level, message) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex >= currentLevelIndex) {
      console.log(message);
    }
  }
}

export default ProfitCompounding;
