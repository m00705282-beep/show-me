#!/usr/bin/env node

/**
 * 🧪 USDT System Test Script
 * 
 * Comprehensive testing script for USDT trading system
 * Tests all components before going live
 */

import chalk from 'chalk';
import ora from 'ora';
import ccxt from 'ccxt';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.clear();

// Banner
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('║          🧪 USDT TRADING SYSTEM TEST SUITE  🧪            ║'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('║           Comprehensive Pre-Launch Validation              ║'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

const tests = {
  passed: 0,
  failed: 0,
  skipped: 0
};

// Test 1: Config File Check
async function testConfigFiles() {
  console.log(chalk.blue('\n📋 Test 1: Configuration Files\n'));
  
  const configFiles = [
    'config/fees.json',
    'config/realtrading.usdt-test.json'
  ];
  
  for (const file of configFiles) {
    const spinner = ora(`Checking ${file}`).start();
    const filePath = join(__dirname, file);
    
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        JSON.parse(content);
        spinner.succeed(chalk.green(`✓ ${file} - OK`));
        tests.passed++;
      } catch (err) {
        spinner.fail(chalk.red(`✗ ${file} - Invalid JSON`));
        tests.failed++;
      }
    } else {
      spinner.fail(chalk.red(`✗ ${file} - Not Found`));
      tests.failed++;
    }
  }
}

// Test 2: Exchange Connectivity
async function testExchangeConnectivity() {
  console.log(chalk.blue('\n🌐 Test 2: Exchange Connectivity\n'));
  
  const exchanges = ['binance', 'kraken', 'kucoin', 'okx'];
  
  for (const exchangeId of exchanges) {
    const spinner = ora(`Testing ${exchangeId}`).start();
    
    try {
      const exchange = new ccxt[exchangeId]({ 
        enableRateLimit: true,
        timeout: 10000
      });
      
      // Test public API
      await exchange.fetchTicker('BTC/USDT');
      
      spinner.succeed(chalk.green(`✓ ${exchangeId} - Connected`));
      tests.passed++;
    } catch (err) {
      spinner.fail(chalk.red(`✗ ${exchangeId} - ${err.message}`));
      tests.failed++;
    }
  }
}

// Test 3: USDT Pairs Availability
async function testUSDTPairs() {
  console.log(chalk.blue('\n💱 Test 3: USDT Pairs Availability\n'));
  
  const testPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];
  const exchange = new ccxt.binance({ enableRateLimit: true });
  
  for (const pair of testPairs) {
    const spinner = ora(`Checking ${pair}`).start();
    
    try {
      const ticker = await exchange.fetchTicker(pair);
      
      if (ticker.bid && ticker.ask) {
        spinner.succeed(chalk.green(`✓ ${pair} - Available (Bid: $${ticker.bid.toFixed(2)})`));
        tests.passed++;
      } else {
        spinner.warn(chalk.yellow(`⚠ ${pair} - No bid/ask data`));
        tests.skipped++;
      }
    } catch (err) {
      spinner.fail(chalk.red(`✗ ${pair} - Not Available`));
      tests.failed++;
    }
  }
}

// Test 4: Fee Calculation
async function testFeeCalculation() {
  console.log(chalk.blue('\n💰 Test 4: Fee Calculation System\n'));
  
  const spinner = ora('Loading fee config').start();
  
  try {
    const feeConfigPath = join(__dirname, 'config', 'fees.json');
    const feeConfig = JSON.parse(readFileSync(feeConfigPath, 'utf-8'));
    
    // Test fee lookup
    const binanceFees = feeConfig.exchanges.binance;
    const krakenFees = feeConfig.exchanges.kraken;
    
    if (binanceFees && krakenFees) {
      spinner.succeed(chalk.green('✓ Fee config loaded'));
      tests.passed++;
      
      // Calculate example spread
      console.log(chalk.gray('  Example: BTC/USDT spread calculation'));
      console.log(chalk.gray(`  Binance taker: ${binanceFees.taker} bps (${(binanceFees.taker / 100).toFixed(2)}%)`));
      console.log(chalk.gray(`  Kraken taker: ${krakenFees.taker} bps (${(krakenFees.taker / 100).toFixed(2)}%)`));
      
      const totalFeePct = (binanceFees.taker + krakenFees.taker) / 100;
      console.log(chalk.gray(`  Total fee impact: ${totalFeePct.toFixed(2)}%`));
      console.log(chalk.gray(`  Min profitable spread: >${totalFeePct.toFixed(2)}%\n`));
      
    } else {
      spinner.fail(chalk.red('✗ Missing fee data'));
      tests.failed++;
    }
  } catch (err) {
    spinner.fail(chalk.red(`✗ Fee config error: ${err.message}`));
    tests.failed++;
  }
}

// Test 5: Real Trading Config Validation
async function testRealTradingConfig() {
  console.log(chalk.blue('\n⚙️  Test 5: Real Trading Configuration\n'));
  
  const spinner = ora('Validating trading config').start();
  
  try {
    const configPath = join(__dirname, 'config', 'realtrading.usdt-test.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    // Check safety caps
    const checks = [
      { name: 'Max Trade Size', value: config.safetyCaps?.maxTradeSize, expected: 15 },
      { name: 'Max Daily Volume', value: config.safetyCaps?.maxDailyVolume, expected: 40 },
      { name: 'Min Spread Required', value: config.safetyCaps?.minSpreadRequired, expected: 2.0 },
      { name: 'Max Open Positions', value: config.safetyCaps?.maxOpenPositions, expected: 2 },
      { name: 'Require Approval', value: config.approval?.requireApproval, expected: true }
    ];
    
    spinner.stop();
    
    let allPassed = true;
    for (const check of checks) {
      if (check.value === check.expected) {
        console.log(chalk.green(`  ✓ ${check.name}: $${check.value}`));
      } else {
        console.log(chalk.red(`  ✗ ${check.name}: ${check.value} (expected ${check.expected})`));
        allPassed = false;
      }
    }
    
    if (allPassed) {
      console.log(chalk.green('\n✓ All safety caps configured correctly'));
      tests.passed++;
    } else {
      console.log(chalk.red('\n✗ Some safety caps need adjustment'));
      tests.failed++;
    }
    
  } catch (err) {
    spinner.fail(chalk.red(`✗ Config error: ${err.message}`));
    tests.failed++;
  }
}

// Test 6: Dependencies Check
async function testDependencies() {
  console.log(chalk.blue('\n📦 Test 6: Node Dependencies\n'));
  
  const requiredPackages = [
    'ccxt',
    'express',
    'ws',
    'node-fetch',
    'compression',
    'p-limit',
    'inquirer',
    'chalk',
    'ora'
  ];
  
  for (const pkg of requiredPackages) {
    const spinner = ora(`Checking ${pkg}`).start();
    
    try {
      await import(pkg);
      spinner.succeed(chalk.green(`✓ ${pkg} - Installed`));
      tests.passed++;
    } catch (err) {
      spinner.fail(chalk.red(`✗ ${pkg} - Missing`));
      tests.failed++;
    }
  }
}

// Test 7: Server Port Check
async function testServerPort() {
  console.log(chalk.blue('\n🔌 Test 7: Server Port Availability\n'));
  
  const spinner = ora('Checking port 8080').start();
  
  try {
    const response = await fetch('http://localhost:8080/health', { 
      signal: AbortSignal.timeout(2000) 
    });
    
    if (response.ok) {
      spinner.warn(chalk.yellow('⚠ Server already running on port 8080'));
      tests.skipped++;
    } else {
      spinner.succeed(chalk.green('✓ Port 8080 is available'));
      tests.passed++;
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ECONNREFUSED') {
      spinner.succeed(chalk.green('✓ Port 8080 is available'));
      tests.passed++;
    } else {
      spinner.fail(chalk.red(`✗ Port check failed: ${err.message}`));
      tests.failed++;
    }
  }
}

// Test 8: API Response Format
async function testAPIFormat() {
  console.log(chalk.blue('\n🔗 Test 8: API Response Format\n'));
  
  const spinner = ora('Testing API data structure').start();
  
  try {
    const exchange = new ccxt.binance({ enableRateLimit: true });
    const ticker = await exchange.fetchTicker('BTC/USDT');
    
    // Check required fields
    const requiredFields = ['symbol', 'bid', 'ask', 'last', 'timestamp'];
    const missingFields = requiredFields.filter(field => !ticker[field]);
    
    if (missingFields.length === 0) {
      spinner.succeed(chalk.green('✓ API response format valid'));
      tests.passed++;
      
      console.log(chalk.gray('  Sample ticker data:'));
      console.log(chalk.gray(`  Symbol: ${ticker.symbol}`));
      console.log(chalk.gray(`  Bid: $${ticker.bid?.toFixed(2)}`));
      console.log(chalk.gray(`  Ask: $${ticker.ask?.toFixed(2)}`));
      console.log(chalk.gray(`  Spread: ${ticker.ask && ticker.bid ? ((ticker.ask - ticker.bid) / ticker.bid * 100).toFixed(3) : 'N/A'}%\n`));
    } else {
      spinner.fail(chalk.red(`✗ Missing fields: ${missingFields.join(', ')}`));
      tests.failed++;
    }
  } catch (err) {
    spinner.fail(chalk.red(`✗ API test failed: ${err.message}`));
    tests.failed++;
  }
}

// Test 9: Rate Limit Test
async function testRateLimits() {
  console.log(chalk.blue('\n⏱️  Test 9: Rate Limit Protection\n'));
  
  const spinner = ora('Testing rate limit handling').start();
  
  try {
    const exchange = new ccxt.binance({ 
      enableRateLimit: true,
      timeout: 5000
    });
    
    // Make multiple requests
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(exchange.fetchTicker('BTC/USDT'));
    }
    
    await Promise.all(requests);
    
    spinner.succeed(chalk.green('✓ Rate limiting working correctly'));
    tests.passed++;
  } catch (err) {
    spinner.fail(chalk.red(`✗ Rate limit test failed: ${err.message}`));
    tests.failed++;
  }
}

// Test 10: Documentation Check
async function testDocumentation() {
  console.log(chalk.blue('\n📚 Test 10: Documentation Files\n'));
  
  const docs = [
    'README.md',
    'USDT_TEST_GUIDE.md',
    'REAL_TRADING_SETUP.md'
  ];
  
  for (const doc of docs) {
    const spinner = ora(`Checking ${doc}`).start();
    const docPath = join(__dirname, doc);
    
    if (existsSync(docPath)) {
      spinner.succeed(chalk.green(`✓ ${doc} - Present`));
      tests.passed++;
    } else {
      spinner.warn(chalk.yellow(`⚠ ${doc} - Missing`));
      tests.skipped++;
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log(chalk.yellow('Starting comprehensive system test...\n'));
  
  try {
    await testConfigFiles();
    await testExchangeConnectivity();
    await testUSDTPairs();
    await testFeeCalculation();
    await testRealTradingConfig();
    await testDependencies();
    await testServerPort();
    await testAPIFormat();
    await testRateLimits();
    await testDocumentation();
    
    // Results summary
    console.log(chalk.cyan.bold('\n' + '═'.repeat(60)));
    console.log(chalk.cyan.bold('                    TEST RESULTS SUMMARY'));
    console.log(chalk.cyan.bold('═'.repeat(60) + '\n'));
    
    const total = tests.passed + tests.failed + tests.skipped;
    
    console.log(chalk.green(`✓ Passed:  ${tests.passed}/${total}`));
    console.log(chalk.red(`✗ Failed:  ${tests.failed}/${total}`));
    console.log(chalk.yellow(`⚠ Skipped: ${tests.skipped}/${total}\n`));
    
    const passRate = ((tests.passed / total) * 100).toFixed(1);
    
    if (tests.failed === 0) {
      console.log(chalk.green.bold('🎉 ALL CRITICAL TESTS PASSED!'));
      console.log(chalk.green(`✅ System is ready for USDT testing (${passRate}% pass rate)\n`));
      
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.white('  1. Copy config/realtrading.usdt-test.json to config/realtrading.json'));
      console.log(chalk.white('  2. Add your real API keys to config/realtrading.json'));
      console.log(chalk.white('  3. Run: node server.js'));
      console.log(chalk.white('  4. Open: http://localhost:8080'));
      console.log(chalk.white('  5. Monitor and approve trades manually\n'));
      
      process.exit(0);
    } else {
      console.log(chalk.red.bold('❌ SOME TESTS FAILED'));
      console.log(chalk.red(`⚠️  Fix ${tests.failed} issue(s) before going live\n`));
      
      process.exit(1);
    }
    
  } catch (err) {
    console.error(chalk.red('\n❌ Test suite error:'), err.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();
