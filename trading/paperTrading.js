import { PersistentState } from '../storage/persistentState.js';
import fs from 'fs';

export class PaperTradingEngine {
  constructor(
    feeConfigPath = './config/fees.json',
    stateFile = './data/paper-trading.json',
    options = {}
  ) {
    const { persistentStateOptions = {} } = options;

    this.state = new PersistentState(stateFile, persistentStateOptions);
    
    // Učitaj fee config
    this.feeConfig = this.loadFeeConfig(feeConfigPath);
    
    // Učitaj prethodni state ili kreiraj novi
    this.balance = this.state.get('balance') || { USD: 10000 };
    this.trades = this.state.get('trades') || [];
    this.openPositions = this.state.get('openPositions') || [];
    
    console.log('[paper] Paper Trading Engine initialized');
    console.log('[paper] Starting balance:', this.balance.USD, 'USD');
    console.log('[paper] Previous trades:', this.trades.length);
  }

  dispose() {
    if (typeof this.state?.dispose === 'function') {
      this.state.dispose();
    }
  }

  loadFeeConfig(configPath) {
    try {
      const data = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(data);
      console.log('[paper] Loaded fee config for', Object.keys(config.exchanges).length, 'exchanges');
      return config;
    } catch (err) {
      console.error('[paper] Failed to load fee config:', err.message);
      return { exchanges: {} };
    }
  }

  getFee(exchange, type = 'taker') {
    const exchangeConfig = this.feeConfig.exchanges[exchange];
    if (!exchangeConfig) {
      return 10; // 0.10% default
    }
    return exchangeConfig[type] || 10;
  }

  getFees(exchange) {
    const maker = this.getFee(exchange, 'maker');
    const taker = this.getFee(exchange, 'taker');
    return { maker, taker };
  }

  setFees(exchange, fees = {}) {
    if (!this.feeConfig.exchanges[exchange]) {
      this.feeConfig.exchanges[exchange] = {};
    }
    this.feeConfig.exchanges[exchange] = {
      ...this.feeConfig.exchanges[exchange],
      ...fees
    };
  }

  // Simuliraj kupovinu
  async buy(exchange, coin, amount, price) {
    const cost = amount * price;
    const feeBps = this.getFee(exchange, 'taker');
    const fee = cost * (feeBps / 10000);
    const totalCost = cost + fee;

    if (this.balance.USD < totalCost) {
      console.log('[paper] ❌ Insufficient funds. Need:', totalCost, 'Have:', this.balance.USD);
      return { success: false, reason: 'insufficient_funds' };
    }

    // Izvršava "trade"
    this.balance.USD -= totalCost;
    this.balance[coin] = (this.balance[coin] || 0) + amount;

    const trade = {
      id: Date.now(),
      type: 'buy',
      exchange,
      coin,
      amount,
      price,
      fee,
      feeBps,
      totalCost,
      timestamp: new Date().toISOString()
    };

    this.trades.push(trade);
    
    console.log(`[paper] ✅ BUY ${amount.toFixed(6)} ${coin} @ ${exchange} for $${price.toFixed(2)} (fee: $${fee.toFixed(2)})`);
    console.log(`[paper] Balance: $${this.balance.USD.toFixed(2)} USD`);

    // Sačuvaj state
    this.saveState();

    return { success: true, trade };
  }

  // Simuliraj prodaju
  async sell(exchange, coin, amount, price) {
    if (!this.balance[coin] || this.balance[coin] < amount) {
      console.log('[paper] ❌ Insufficient coin balance. Need:', amount, 'Have:', this.balance[coin] || 0);
      return { success: false, reason: 'insufficient_balance' };
    }

    const revenue = amount * price;
    const feeBps = this.getFee(exchange, 'taker');
    const fee = revenue * (feeBps / 10000);
    const netRevenue = revenue - fee;

    this.balance[coin] -= amount;
    this.balance.USD += netRevenue;

    const trade = {
      id: Date.now(),
      type: 'sell',
      exchange,
      coin,
      amount,
      price,
      fee,
      feeBps,
      netRevenue,
      timestamp: new Date().toISOString()
    };

    this.trades.push(trade);
    
    console.log(`[paper] ✅ SELL ${amount.toFixed(6)} ${coin} @ ${exchange} for $${price.toFixed(2)} (fee: $${fee.toFixed(2)})`);
    console.log(`[paper] Balance: $${this.balance.USD.toFixed(2)} USD`);

    // Sačuvaj state
    this.saveState();

    return { success: true, trade };
  }

  // Sačuvaj trenutno stanje
  saveState() {
    this.state.update({
      balance: this.balance,
      trades: this.trades,
      openPositions: this.openPositions
    });
    this.state.save();
  }

  // Izračunaj profit za određeni period
  getProfitForPeriod(hours) {
    const now = Date.now();
    const periodStart = now - (hours * 60 * 60 * 1000);
    
    const tradesInPeriod = this.trades.filter(t => {
      const tradeTime = new Date(t.timestamp).getTime();
      return tradeTime >= periodStart;
    });
    
    if (tradesInPeriod.length === 0) return 0;
    
    // Izračunaj profit iz sell trade-ova u periodu
    let periodProfit = 0;
    for (let i = 0; i < tradesInPeriod.length; i++) {
      const trade = tradesInPeriod[i];
      if (trade.type === 'sell') {
        // Nađi odgovarajući buy trade
        const buyTrade = this.trades.find(t => 
          t.type === 'buy' && 
          t.coin === trade.coin && 
          t.id < trade.id &&
          !this.trades.some(st => st.type === 'sell' && st.coin === t.coin && st.id > t.id && st.id < trade.id)
        );
        
        if (buyTrade) {
          const profit = (trade.price - buyTrade.price) * trade.amount - (trade.fee + buyTrade.fee);
          periodProfit += profit;
        }
      }
    }
    
    return periodProfit;
  }

  // Izračunaj performance
  getPerformance() {
    const startingBalance = 10000;
    const totalTrades = this.trades.length;
    const totalFees = this.trades.reduce((sum, t) => sum + t.fee, 0);
    
    // Trenutna vrednost = USD + vrednost svih coina (pretpostavljamo da su svi prodati po trenutnoj ceni)
    const currentValue = this.balance.USD;
    
    const profit = currentValue - startingBalance;
    const profitPercent = (profit / startingBalance) * 100;
    
    // Win rate
    const profitableTrades = this.trades.filter((t, i) => {
      if (i === 0 || t.type !== 'sell') return false;
      const buyTrade = this.trades[i - 1];
      if (buyTrade.type !== 'buy' || buyTrade.coin !== t.coin) return false;
      return (t.price - buyTrade.price) * t.amount > (t.fee + buyTrade.fee);
    });
    
    const winRate = totalTrades > 0 ? (profitableTrades.length / (totalTrades / 2)) * 100 : 0;

    // Period profits
    const profit24h = this.getProfitForPeriod(24);
    const profit7d = this.getProfitForPeriod(24 * 7);
    const profit30d = this.getProfitForPeriod(24 * 30);

    return {
      startingBalance,
      currentBalance: currentValue,
      profit,
      profitPercent,
      totalTrades,
      totalFees,
      winRate,
      avgProfitPerTrade: totalTrades > 0 ? profit / (totalTrades / 2) : 0,
      profit24h,
      profit7d,
      profit30d,
      wallets: this.balance // Wallet info
    };
  }

  // Prikaži statistiku
  printStats() {
    const perf = this.getPerformance();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 PAPER TRADING PERFORMANCE');
    console.log('='.repeat(60));
    console.log(`Starting Balance:     $${perf.startingBalance.toFixed(2)}`);
    console.log(`Current Balance:      $${perf.currentBalance.toFixed(2)}`);
    console.log(`Profit/Loss:          $${perf.profit.toFixed(2)} (${perf.profitPercent.toFixed(2)}%)`);
    console.log(`Total Trades:         ${perf.totalTrades}`);
    console.log(`Total Fees Paid:      $${perf.totalFees.toFixed(2)}`);
    console.log(`Win Rate:             ${perf.winRate.toFixed(1)}%`);
    console.log(`Avg Profit/Trade:     $${perf.avgProfitPerTrade.toFixed(2)}`);
    console.log('='.repeat(60) + '\n');
  }
}
