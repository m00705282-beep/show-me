import { PaperTradingEngine } from './paperTrading.js';

export class ArbitrageStrategy {
  constructor(config = {}) {
    const {
      minSpread = 0.5,
      maxTradeSize = 1000,
      paperEngineConfig = {}
    } = config;

    const {
      feeConfigPath,
      stateFile,
      options: paperEngineOptions = {}
    } = paperEngineConfig;

    this.paperEngine = new PaperTradingEngine(
      feeConfigPath,
      stateFile,
      paperEngineOptions
    );
    this.minSpread = minSpread; // Minimum 0.5% net spread
    this.maxTradeSize = maxTradeSize; // Max $1000 per trade
    this.isRunning = false;
    this.opportunitiesAnalyzed = 0;
    this.tradesExecuted = 0;
    
    console.log('[strategy] Arbitrage Strategy initialized');
    console.log('[strategy] Min spread:', this.minSpread + '%');
    console.log('[strategy] Max trade size: $' + this.maxTradeSize);
  }

  start() {
    this.isRunning = true;
    console.log('[strategy] ▶️  Arbitrage strategy STARTED (PAPER MODE)');
  }

  stop() {
    this.isRunning = false;
    console.log('[strategy] ⏸️  Arbitrage strategy STOPPED');
    this.printSummary();
  }

  dispose() {
    if (typeof this.paperEngine?.dispose === 'function') {
      this.paperEngine.dispose();
    }
  }

  // Analiziraj priliku i odluči da li da trguje
  async analyzeOpportunity(opp = {}) {
    const decision = {
      opportunity: opp,
      recommended: false,
      reason: null,
      tradeSize: 0,
      coinAmount: 0,
      execution: null
    };

    if (!this.isRunning) {
      decision.reason = 'strategy_inactive';
      return decision;
    }

    this.opportunitiesAnalyzed++;

    if (typeof opp.netSpread !== 'number') {
      decision.reason = 'invalid_opportunity';
      return decision;
    }

    if (opp.netSpread < this.minSpread) {
      decision.reason = `spread ${opp.netSpread}% below minimum ${this.minSpread}%`;
      console.log(`[strategy] ⏭️  Spread too low: ${opp.netSpread.toFixed(3)}% < ${this.minSpread}%`);
      return decision;
    }

    const buyPrice = opp.buyP ?? opp.buyPrice;
    const sellPrice = opp.sellP ?? opp.sellPrice;

    if (typeof buyPrice !== 'number' || typeof sellPrice !== 'number') {
      decision.reason = 'missing_prices';
      return decision;
    }

    const availableFunds = this.paperEngine.balance.USD;
    const tradeSize = Math.min(this.maxTradeSize, availableFunds * 0.1);

    if (tradeSize < 10) {
      decision.reason = 'insufficient_funds';
      console.log('[strategy] ⏭️  Insufficient funds for trading');
      return decision;
    }

    const coinAmount = tradeSize / buyPrice;

    console.log(`\n[strategy] 🎯 OPPORTUNITY DETECTED:`);
    console.log(`[strategy] Coin: ${opp.coin}`);
    console.log(`[strategy] Buy @ ${opp.buyM}: $${buyPrice.toFixed(2)}`);
    console.log(`[strategy] Sell @ ${opp.sellM}: $${sellPrice.toFixed(2)}`);
    console.log(`[strategy] Gross spread: ${opp.grossSpread?.toFixed?.(3) ?? 'n/a'}%`);
    console.log(`[strategy] Net spread: ${opp.netSpread.toFixed(3)}%`);
    console.log(`[strategy] Trade size: $${tradeSize.toFixed(2)}`);
    console.log(`[strategy] Coin amount: ${coinAmount.toFixed(6)}`);

    decision.recommended = true;
    decision.reason = 'criteria_met';
    decision.tradeSize = tradeSize;
    decision.coinAmount = coinAmount;

    decision.execution = await this.executeArbitrage({
      ...opp,
      buyP: buyPrice,
      sellP: sellPrice
    }, coinAmount);

    return decision;
  }

  async executeArbitrage(opp, amount) {
    console.log(`[strategy] 🔄 Executing arbitrage...`);

    if (typeof amount !== 'number' || amount <= 0) {
      return { success: false, reason: 'invalid_trade_amount' };
    }

    const buyPrice = opp.buyP ?? opp.buyPrice;
    const sellPrice = opp.sellP ?? opp.sellPrice;

    if (typeof buyPrice !== 'number' || typeof sellPrice !== 'number') {
      return { success: false, reason: 'missing_prices' };
    }

    const buyResult = await this.paperEngine.buy(
      opp.buyM,
      opp.coin,
      amount,
      buyPrice
    );

    if (!buyResult.success) {
      console.log('[strategy] ❌ Buy failed:', buyResult.reason);
      return { success: false, reason: buyResult.reason };
    }

    const sellResult = await this.paperEngine.sell(
      opp.sellM,
      opp.coin,
      amount,
      sellPrice
    );

    if (!sellResult.success) {
      console.log('[strategy] ❌ Sell failed:', sellResult.reason);
      console.log('[strategy] 🔄 Rolling back...');
      await this.paperEngine.sell(opp.buyM, opp.coin, amount, buyPrice);
      return { success: false, reason: sellResult.reason };
    }

    const grossProfit = (sellResult.trade.price - buyResult.trade.price) * amount;
    const totalFees = buyResult.trade.fee + sellResult.trade.fee;
    const netProfit = grossProfit - totalFees;

    console.log(`[strategy] ✅ ARBITRAGE EXECUTED!`);
    console.log(`[strategy] Gross profit: $${grossProfit.toFixed(2)}`);
    console.log(`[strategy] Total fees: $${totalFees.toFixed(2)}`);
    console.log(`[strategy] Net profit: $${netProfit.toFixed(2)}`);
    console.log(`[strategy] Trades executed: ${this.tradesExecuted}\n`);

    this.tradesExecuted++;

    if (this.tradesExecuted % 10 === 0) {
      this.paperEngine.printStats();
    }

    return {
      success: true,
      grossProfit,
      totalFees,
      netProfit,
      buyResult,
      sellResult
    };
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 STRATEGY SUMMARY');
    console.log('='.repeat(60));
    console.log(`Opportunities Analyzed: ${this.opportunitiesAnalyzed}`);
    console.log(`Trades Executed:        ${this.tradesExecuted}`);
    console.log(`Execution Rate:         ${this.opportunitiesAnalyzed > 0 ? ((this.tradesExecuted / this.opportunitiesAnalyzed) * 100).toFixed(1) : 0}%`);
    console.log('='.repeat(60) + '\n');
    
    this.paperEngine.printStats();
  }

  getPerformance() {
    return {
      ...this.paperEngine.getPerformance(),
      opportunitiesAnalyzed: this.opportunitiesAnalyzed,
      tradesExecuted: this.tradesExecuted,
      executionRate: this.opportunitiesAnalyzed > 0 ? (this.tradesExecuted / this.opportunitiesAnalyzed) * 100 : 0
    };
  }
}
