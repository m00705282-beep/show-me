/**
 * Manual LEO Sell Script - Ascendex
 * Sells LEO coins for USDT
 */

import ccxt from 'ccxt';
import { readFileSync } from 'fs';

console.log('🔥 Starting LEO sell on Ascendex...\n');

// Load config
const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const ascendexConfig = config.exchanges.ascendex;

if (!ascendexConfig || !ascendexConfig.enabled) {
  console.error('❌ Ascendex not configured or disabled!');
  process.exit(1);
}

// Initialize Ascendex exchange
const ascendex = new ccxt.ascendex({
  apiKey: ascendexConfig.apiKey,
  secret: ascendexConfig.secret,
  enableRateLimit: true,
  options: {
    defaultType: 'spot'
  }
});

async function sellLEO() {
  try {
    console.log('📊 Fetching current balance...');
    const balance = await ascendex.fetchBalance();
    
    const leoBalance = balance['LEO']?.free || 0;
    const usdtBalance = balance['USDT']?.free || 0;
    
    console.log(`Current Balance:`);
    console.log(`  LEO:  ${leoBalance} coins`);
    console.log(`  USDT: $${usdtBalance.toFixed(2)}`);
    console.log('');
    
    if (leoBalance < 0.01) {
      console.log('❌ Insufficient LEO balance to sell!');
      return;
    }
    
    // Fetch LEO/USDT ticker to get current price
    console.log('💱 Fetching LEO/USDT market price...');
    const ticker = await ascendex.fetchTicker('LEO/USDT');
    const currentPrice = ticker.last;
    
    console.log(`  LEO Price: $${currentPrice.toFixed(4)}`);
    console.log(`  Total Value: $${(leoBalance * currentPrice).toFixed(2)}`);
    console.log('');
    
    // Confirmation
    console.log('⚠️  SELLING LEO:');
    console.log(`  Amount: ${leoBalance} LEO`);
    console.log(`  Expected: ~$${(leoBalance * currentPrice * 0.998).toFixed(2)} USDT (after 0.2% fee)`);
    console.log('');
    
    // Execute MARKET SELL order
    console.log('🔥 Executing MARKET SELL order...');
    
    const order = await ascendex.createMarketSellOrder(
      'LEO/USDT',
      leoBalance
    );
    
    console.log('✅ Order executed!');
    console.log(`  Order ID: ${order.id}`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Filled: ${order.filled} LEO`);
    console.log(`  Cost: $${order.cost?.toFixed(2) || 'N/A'}`);
    console.log('');
    
    // Wait a bit and check new balance
    console.log('⏳ Waiting 3 seconds for settlement...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const newBalance = await ascendex.fetchBalance();
    const newLeoBalance = newBalance['LEO']?.free || 0;
    const newUsdtBalance = newBalance['USDT']?.free || 0;
    
    console.log('📊 New Balance:');
    console.log(`  LEO:  ${newLeoBalance} coins`);
    console.log(`  USDT: $${newUsdtBalance.toFixed(2)}`);
    console.log('');
    
    const usdtGained = newUsdtBalance - usdtBalance;
    console.log(`✅ SUCCESS! Gained $${usdtGained.toFixed(2)} USDT`);
    console.log('');
    console.log('💰 You can now transfer this USDT to other exchanges!');
    
  } catch (error) {
    console.error('❌ Error selling LEO:', error.message);
    if (error.message.includes('insufficient')) {
      console.error('   → Insufficient balance');
    } else if (error.message.includes('Invalid symbol')) {
      console.error('   → LEO/USDT trading pair not available on Ascendex');
    } else if (error.message.includes('API')) {
      console.error('   → API connection issue. Check credentials.');
    }
    process.exit(1);
  }
}

// Run
sellLEO().then(() => {
  console.log('🎉 LEO sell completed!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
