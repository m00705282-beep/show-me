#!/usr/bin/env node

/**
 * 🔴 MEXC REBALANCE PLAN
 * Generiše optimalan plan za transfer USDT na MEXC
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync } from 'fs';

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║         🔴 MEXC BALANCE REBALANCE PLANNER 🔴              ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

// Load config
const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));

// Target for MEXC
const MEXC_TARGET = 100; // $100 USDT

// Initialize exchanges
const exchanges = {};
for (const [name, cfg] of Object.entries(config.exchanges)) {
  if (cfg.enabled && cfg.apiKey && cfg.secret) {
    try {
      const ExchangeClass = ccxt[name];
      exchanges[name] = new ExchangeClass({
        apiKey: cfg.apiKey,
        secret: cfg.secret,
        password: cfg.password || cfg.passphrase,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
      });
    } catch(e) {
      // Skip if exchange not supported
    }
  }
}

async function main() {
  console.log(chalk.yellow('📊 Fetching current balances...\n'));
  
  const balances = {};
  let total = 0;
  
  for (const [name, exchange] of Object.entries(exchanges)) {
    try {
      const balance = await exchange.fetchBalance();
      const usdt = balance['USDT']?.free || 0;
      balances[name] = usdt;
      total += usdt;
      
      const color = usdt > 20 ? 'green' : usdt > 5 ? 'yellow' : 'red';
      console.log(chalk[color](`  ${name.padEnd(12)}: $${usdt.toFixed(2)} USDT`));
    } catch (err) {
      console.log(chalk.gray(`  ${name.padEnd(12)}: ERROR - ${err.message.substring(0, 40)}`));
      balances[name] = 0;
    }
  }
  
  console.log(chalk.cyan(`\n  ${'TOTAL'.padEnd(12)}: $${total.toFixed(2)} USDT`));
  console.log(chalk.cyan('═'.repeat(60)));
  
  // Current MEXC balance
  const mexcBalance = balances['mexc'] || 0;
  const needed = MEXC_TARGET - mexcBalance;
  
  console.log(chalk.yellow(`\n🎯 Target for MEXC: $${MEXC_TARGET} USDT`));
  console.log(chalk.yellow(`💰 Current MEXC balance: $${mexcBalance.toFixed(2)} USDT`));
  console.log(chalk.red(`📥 Need to transfer: $${needed.toFixed(2)} USDT\n`));
  
  if (needed <= 0) {
    console.log(chalk.green('✅ MEXC already has sufficient balance!'));
    return;
  }
  
  // Find best source exchanges
  const sources = Object.entries(balances)
    .filter(([name, balance]) => name !== 'mexc' && balance > 20)
    .sort((a, b) => b[1] - a[1]);
  
  if (sources.length === 0) {
    console.log(chalk.red('❌ No exchange has enough USDT to transfer!'));
    return;
  }
  
  // Generate transfer plan
  console.log(chalk.cyan.bold('📋 RECOMMENDED TRANSFER PLAN:\n'));
  console.log(chalk.cyan('═'.repeat(60)));
  
  let remaining = needed;
  const plan = [];
  
  for (const [source, available] of sources) {
    if (remaining <= 0) break;
    
    // Keep minimum balance on source
    const minKeep = 10;
    const maxTransfer = Math.max(0, available - minKeep);
    
    if (maxTransfer < 5) continue; // Skip if can't transfer meaningful amount
    
    const transferAmount = Math.min(remaining, maxTransfer);
    
    plan.push({
      from: source,
      amount: transferAmount,
      remaining: available - transferAmount
    });
    
    remaining -= transferAmount;
  }
  
  // Display plan
  let step = 1;
  for (const transfer of plan) {
    console.log(chalk.white(`\n${step}. Transfer $${transfer.amount.toFixed(2)} USDT`));
    console.log(chalk.gray(`   From: ${transfer.from.toUpperCase()}`));
    console.log(chalk.gray(`   To:   MEXC`));
    console.log(chalk.gray(`   Network: TRC20 (recommended - lowest fees)`));
    console.log(chalk.gray(`   After transfer: ${transfer.from} will have $${transfer.remaining.toFixed(2)}`));
    step++;
  }
  
  console.log(chalk.cyan('\n═'.repeat(60)));
  console.log(chalk.green.bold('\n📝 MANUAL TRANSFER INSTRUCTIONS:\n'));
  
  for (let i = 0; i < plan.length; i++) {
    const transfer = plan[i];
    console.log(chalk.yellow(`\nSTEP ${i + 1}: ${transfer.from.toUpperCase()} → MEXC ($${transfer.amount.toFixed(2)})\n`));
    
    console.log(chalk.white('  A) Get MEXC Deposit Address:'));
    console.log(chalk.gray('     1. Login to MEXC'));
    console.log(chalk.gray('     2. Go to: Wallet → Deposit'));
    console.log(chalk.gray('     3. Select: USDT'));
    console.log(chalk.gray('     4. Network: TRC20'));
    console.log(chalk.gray('     5. Copy deposit address'));
    
    console.log(chalk.white(`\n  B) Withdraw from ${transfer.from.toUpperCase()}:`));
    console.log(chalk.gray(`     1. Login to ${transfer.from.toUpperCase()}`));
    console.log(chalk.gray('     2. Go to: Wallet → Withdraw'));
    console.log(chalk.gray('     3. Coin: USDT'));
    console.log(chalk.gray('     4. Network: TRC20'));
    console.log(chalk.gray(`     5. Amount: ${transfer.amount.toFixed(2)} USDT`));
    console.log(chalk.gray('     6. Paste MEXC deposit address'));
    console.log(chalk.gray('     7. Confirm withdrawal (2FA)'));
    
    console.log(chalk.white('\n  C) Wait for confirmation:'));
    console.log(chalk.gray('     • TRC20: ~2-5 minutes'));
    console.log(chalk.gray('     • Fee: ~$1 (fixed)'));
  }
  
  console.log(chalk.cyan('\n═'.repeat(60)));
  console.log(chalk.red.bold('\n⚠️  IMPORTANT SAFETY CHECKS:\n'));
  console.log(chalk.yellow('  ✓ Double-check deposit address'));
  console.log(chalk.yellow('  ✓ Verify network is TRC20 on BOTH exchanges'));
  console.log(chalk.yellow('  ✓ Start with small test amount first ($10)'));
  console.log(chalk.yellow('  ✓ Never share withdrawal confirmation codes'));
  
  console.log(chalk.cyan('\n═'.repeat(60)));
  console.log(chalk.green.bold('\n🚀 After transfer completes:\n'));
  console.log(chalk.white('  1. Wait for USDT to appear in MEXC'));
  console.log(chalk.white('  2. Restart bot: pm2 restart crypto-arbitrage'));
  console.log(chalk.white('  3. Check logs: pm2 logs crypto-arbitrage'));
  console.log(chalk.white('  4. MEXC will start trading automatically!'));
  
  console.log(chalk.green('\n✅ Transfer plan generated!\n'));
  
  // Generate quick reference
  console.log(chalk.cyan('═'.repeat(60)));
  console.log(chalk.magenta.bold('📋 QUICK REFERENCE:\n'));
  
  const totalToTransfer = plan.reduce((sum, t) => sum + t.amount, 0);
  console.log(chalk.white(`  Total to transfer: $${totalToTransfer.toFixed(2)} USDT`));
  console.log(chalk.white(`  Number of transfers: ${plan.length}`));
  console.log(chalk.white(`  Estimated fees: ~$${(plan.length * 1).toFixed(2)} (TRC20)`));
  console.log(chalk.white(`  Net on MEXC: ~$${(totalToTransfer - plan.length).toFixed(2)}`));
  console.log(chalk.white(`  Time required: ~${plan.length * 10} minutes\n`));
}

main().catch(err => {
  console.error(chalk.red('\n❌ Error:'), err.message);
  process.exit(1);
});
