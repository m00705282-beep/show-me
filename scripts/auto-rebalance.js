/**
 * AUTO-REBALANCE Script
 * Automatski redistributira USDT prema optimalnoj raspodeli
 */

import ccxt from 'ccxt';
import { readFileSync } from 'fs';

console.log('🤖 AI Auto-Rebalance Agent Starting...\n');

// Load config
const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));

// Target allocation (from optimization plan)
const TARGET_ALLOCATION = {
  binance: 80,
  kraken: 55,
  coinbase: 40,
  gateio: 30,
  ascendex: 20,
  kucoin: 12,
  okx: 6
};

// Withdrawal plan
const TRANSFERS = [
  { from: 'ascendex', to: 'kraken', amount: 55, network: 'TRC20' },
  { from: 'ascendex', to: 'coinbase', amount: 8, network: 'TRC20' },
  { from: 'binance', to: 'coinbase', amount: 32, network: 'TRC20' },
  { from: 'gateio', to: 'okx', amount: 6, network: 'TRC20' }
];

// Initialize exchanges
const exchanges = {};
for (const [name, cfg] of Object.entries(config.exchanges)) {
  if (cfg.apiKey && cfg.secret) {
    const ExchangeClass = ccxt[name];
    exchanges[name] = new ExchangeClass({
      apiKey: cfg.apiKey,
      secret: cfg.secret,
      password: cfg.password,
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
  }
}

// Get deposit addresses
async function getDepositAddress(exchange, coin, network) {
  try {
    const address = await exchange.fetchDepositAddress(coin, { network });
    return address;
  } catch (err) {
    console.error(`❌ Failed to get ${coin} deposit address from ${exchange.id}:`, err.message);
    return null;
  }
}

// Fetch current balances
async function getCurrentBalances() {
  console.log('📊 Fetching current balances...\n');
  const balances = {};
  
  for (const [name, exchange] of Object.entries(exchanges)) {
    try {
      const balance = await exchange.fetchBalance();
      const usdt = balance['USDT']?.free || 0;
      balances[name] = usdt;
      console.log(`  ${name.padEnd(10)}: $${usdt.toFixed(2)}`);
    } catch (err) {
      console.error(`  ${name.padEnd(10)}: ERROR - ${err.message}`);
      balances[name] = 0;
    }
  }
  
  const total = Object.values(balances).reduce((a, b) => a + b, 0);
  console.log(`  ${'TOTAL'.padEnd(10)}: $${total.toFixed(2)}\n`);
  
  return balances;
}

// Execute single transfer
async function executeTransfer(transfer, depositAddresses) {
  const { from, to, amount, network } = transfer;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💸 Transfer: ${from} → ${to}`);
  console.log(`   Amount: $${amount} USDT`);
  console.log(`   Network: ${network}`);
  
  const sourceExchange = exchanges[from];
  if (!sourceExchange) {
    console.error(`❌ Source exchange ${from} not configured!`);
    return null;
  }
  
  // Get destination address
  const destAddress = depositAddresses[to];
  if (!destAddress) {
    console.error(`❌ Destination address for ${to} not available!`);
    return null;
  }
  
  console.log(`   To Address: ${destAddress.address}`);
  if (destAddress.tag) {
    console.log(`   Tag/Memo: ${destAddress.tag}`);
  }
  
  try {
    // Execute withdrawal
    console.log(`\n🔥 Executing withdrawal...`);
    
    const withdrawal = await sourceExchange.withdraw(
      'USDT',
      amount,
      destAddress.address,
      destAddress.tag,
      {
        network: network
      }
    );
    
    console.log(`✅ Withdrawal submitted!`);
    console.log(`   TX ID: ${withdrawal.id}`);
    console.log(`   Status: ${withdrawal.status}`);
    
    // Track on blockchain
    if (withdrawal.txid) {
      console.log(`   Track: https://tronscan.org/#/transaction/${withdrawal.txid}`);
    }
    
    return {
      success: true,
      txid: withdrawal.id,
      from,
      to,
      amount,
      timestamp: Date.now()
    };
    
  } catch (err) {
    console.error(`❌ Withdrawal failed: ${err.message}`);
    
    if (err.message.includes('insufficient')) {
      console.error(`   → Insufficient balance on ${from}`);
    } else if (err.message.includes('whitelist')) {
      console.error(`   → Address not whitelisted. Add ${destAddress.address} to withdrawal whitelist on ${from}`);
    } else if (err.message.includes('permission')) {
      console.error(`   → API key lacks withdrawal permissions`);
    }
    
    return {
      success: false,
      error: err.message,
      from,
      to,
      amount
    };
  }
}

// Main rebalance function
async function rebalance(dryRun = true) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   🤖 AI AUTO-REBALANCE AGENT');
  console.log('═══════════════════════════════════════════════════════\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No actual transfers will be executed!\n');
  } else {
    console.log('🔥 LIVE MODE - Real transfers will be executed!\n');
  }
  
  // Step 1: Check current balances
  const currentBalances = await getCurrentBalances();
  const targetDiffs = [];

  console.log('🎯 Comparing against target allocation:\n');

  for (const [exchange, targetAmount] of Object.entries(TARGET_ALLOCATION)) {
    const currentAmount = currentBalances[exchange] || 0;
    const diff = targetAmount - currentAmount;
    targetDiffs.push({ exchange, currentAmount, targetAmount, diff });

    const statusIcon = diff > 0 ? '⬆️' : diff < 0 ? '⬇️' : '✅';
    console.log(`  ${exchange.padEnd(10)} | Current: $${currentAmount.toFixed(2).padStart(7)} | Target: $${targetAmount.toFixed(2).padStart(7)} | ${statusIcon} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`);
  }

  console.log('');
  
  // Step 2: Get deposit addresses for destinations
  console.log('📍 Fetching deposit addresses...\n');
  
  const depositAddresses = {};
  const destinations = [...new Set(TRANSFERS.map(t => t.to))];
  
  for (const dest of destinations) {
    const exchange = exchanges[dest];
    if (!exchange) {
      console.error(`❌ ${dest} exchange not configured!`);
      continue;
    }
    
    console.log(`  Fetching ${dest} USDT (TRC20) address...`);
    const address = await getDepositAddress(exchange, 'USDT', 'TRC20');
    
    if (address) {
      depositAddresses[dest] = address;
      console.log(`  ✅ ${dest}: ${address.address}`);
    } else {
      console.error(`  ❌ ${dest}: Failed to get address!`);
    }
  }
  
  console.log('');
  
  // Step 3: Verify we have all addresses
  const missingAddresses = destinations.filter(d => !depositAddresses[d]);
  if (missingAddresses.length > 0) {
    console.error('❌ Missing deposit addresses for:', missingAddresses.join(', '));
    console.error('Cannot proceed without all addresses!');
    return;
  }
  
  // Step 4: Execute transfers
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💸 EXECUTING TRANSFERS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (dryRun) {
    console.log('DRY RUN - Simulating transfers:\n');
    TRANSFERS.forEach((t, i) => {
      console.log(`${i + 1}. ${t.from} → ${t.to}: $${t.amount} (${t.network})`);
      console.log(`   To: ${depositAddresses[t.to].address}\n`);
    });
    console.log('✅ Dry run complete - all parameters verified!');
    console.log('\n💡 To execute for real, run: node scripts/auto-rebalance.js --live');
    return;
  }
  
  const results = [];
  
  for (let i = 0; i < TRANSFERS.length; i++) {
    const transfer = TRANSFERS[i];
    console.log(`\n[${i + 1}/${TRANSFERS.length}] Processing transfer...`);
    
    const result = await executeTransfer(transfer, depositAddresses);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ Transfer ${i + 1} complete!`);
    } else {
      console.log(`❌ Transfer ${i + 1} failed!`);
    }
    
    // Wait between transfers
    if (i < TRANSFERS.length - 1) {
      console.log('\n⏳ Waiting 5 seconds before next transfer...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('   📊 REBALANCE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total Transfers: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}\n`);
  
  if (successful > 0) {
    console.log('Successful transfers:');
    results.filter(r => r.success).forEach(r => {
      console.log(`  ✅ ${r.from} → ${r.to}: $${r.amount}`);
      console.log(`     TX: ${r.txid}`);
    });
  }
  
  if (failed > 0) {
    console.log('\nFailed transfers:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  ❌ ${r.from} → ${r.to}: $${r.amount}`);
      console.log(`     Error: ${r.error}`);
    });
  }
  
  console.log('\n✅ Auto-rebalance complete!');
  console.log('\n💡 Check balances in ~15 minutes after blockchain confirmation.');
}

// Parse command line args
const args = process.argv.slice(2);
const isLive = args.includes('--live');
const isDryRun = !isLive;

// Run
rebalance(isDryRun).then(() => {
  console.log('\n🎉 Done!');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
