#!/usr/bin/env node

/**
 * 🚀 AUTOMATED REAL TRADING SETUP
 * Potpuna automatizacija konfiguracije za real trading
 * 
 * ⚠️ WARNING: Ova skripta konfiguriše PRAVO trgovanje sa pravim novcem!
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ccxt from 'ccxt';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.clear();

// Banner
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('║        🚀  CRYPTO ARBITRAGE REAL TRADING SETUP  🚀        ║'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('║              Automatska Konfiguracija Sistema              ║'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

console.log(chalk.yellow('⚠️  VAŽNO UPOZORENJE:'));
console.log(chalk.yellow('   Ova skripta konfiguriše PRAVO trgovanje sa pravim novcem!'));
console.log(chalk.yellow('   Pažljivo pratite sve korake i budite sigurni u svoje odluke.\n'));

// Main setup flow
async function main() {
  try {
    console.log(chalk.blue('📋 Pokretanje automatske konfiguracije...\n'));
    
    // Step 1: Welcome & Confirmation
    await welcomeStep();
    
    // Step 2: Check requirements
    await checkRequirements();
    
    // Step 3: Get IP address
    const ipAddress = await getIPAddress();
    
    // Step 4: Exchange selection
    const selectedExchanges = await selectExchanges();
    
    // Step 5: Configure each exchange
    const exchangeConfigs = await configureExchanges(selectedExchanges, ipAddress);
    
    // Step 6: Verify balances
    await verifyBalances(exchangeConfigs);
    
    // Step 7: Alert configuration
    const alertConfig = await configureAlerts();
    
    // Step 8: Safety limits
    const safetyLimits = await configureSafetyLimits();
    
    // Step 9: Generate config files
    await generateConfigFiles(exchangeConfigs, alertConfig, safetyLimits);
    
    // Step 10: Final confirmation
    await finalConfirmation(safetyLimits);
    
    // Step 11: Success!
    await successMessage();
    
  } catch (error) {
    console.error(chalk.red('\n❌ Greška:'), error.message);
    process.exit(1);
  }
}

// Step 1: Welcome
async function welcomeStep() {
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: chalk.yellow('Da li ste sigurni da želite da konfigurišete REAL TRADING sa pravim novcem?'),
      default: false
    }
  ]);
  
  if (!proceed) {
    console.log(chalk.red('\n❌ Setup otkazan.'));
    process.exit(0);
  }
  
  console.log(chalk.green('\n✅ Nastavljamo sa konfiguracijom...\n'));
}

// Step 2: Check requirements
async function checkRequirements() {
  console.log(chalk.blue('🔍 Provera sistemskih zahteva...\n'));
  
  const spinner = ora('Proveravamo instalaciju...').start();
  
  // Check if ccxt is installed
  try {
    // Test ccxt import by checking if it works
    new ccxt.binance();
    spinner.succeed(`CCXT uspešno instaliran`);
  } catch (err) {
    spinner.fail('CCXT nije instaliran');
    throw new Error('Molimo instalirajte dependencies: npm install');
  }
  
  // Check if config directory exists
  const configDir = join(__dirname, 'config');
  if (!existsSync(configDir)) {
    spinner.fail('Config folder ne postoji');
    throw new Error('Config folder nije pronađen');
  }
  spinner.succeed('Config folder pronađen');
  
  console.log();
}

// Step 3: Get IP address
async function getIPAddress() {
  console.log(chalk.blue('🌐 Provera vaše IP adrese...\n'));
  
  const spinner = ora('Dohvatanje IP adrese...').start();
  
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const ip = data.ip;
    
    spinner.succeed(`Vaša IP adresa: ${chalk.cyan(ip)}`);
    
    console.log(chalk.yellow('\n⚠️  VAŽNO: Koristite ovu IP adresu za API whitelist na menjačnici!'));
    console.log(chalk.yellow(`   IP: ${ip}`));
    
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Da li ste dodali ovu IP adresu u API whitelist na menjačnici?',
        default: false
      }
    ]);
    
    if (!confirmed) {
      console.log(chalk.yellow('\n⏸️  Molimo dodajte IP adresu u whitelist i pokrenite skriptu ponovo.'));
      process.exit(0);
    }
    
    console.log();
    return ip;
    
  } catch (error) {
    spinner.fail('Ne mogu da dohvatim IP adresu');
    throw error;
  }
}

// Step 4: Select exchanges
async function selectExchanges() {
  console.log(chalk.blue('🏦 Izbor menjačnica...\n'));
  
  const { exchanges } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'exchanges',
      message: 'Izaberite menjačnice koje želite da konfigurišete:',
      choices: [
        { name: '🟡 Binance (Preporučeno - najniži fees)', value: 'binance', checked: true },
        { name: '🔵 Kraken (Sigurnije, viši fees)', value: 'kraken' },
        { name: '🟢 Coinbase (Najsigurnije, najviši fees)', value: 'coinbase' },
        { name: '🟣 KuCoin', value: 'kucoin' },
        { name: '🟠 Bybit', value: 'bybit' },
        { name: '🔴 MEXC', value: 'mexc' }
      ],
      validate: (answer) => {
        if (answer.length < 1) {
          return 'Morate izabrati bar jednu menjačnicu!';
        }
        return true;
      }
    }
  ]);
  
  console.log(chalk.green(`\n✅ Izabrano: ${exchanges.join(', ')}\n`));
  return exchanges;
}

// Step 5: Configure exchanges
async function configureExchanges(exchanges, ipAddress) {
  console.log(chalk.blue('🔑 Konfiguracija API ključeva...\n'));
  
  const configs = {};
  
  for (const exchangeId of exchanges) {
    console.log(chalk.cyan(`\n📝 Konfiguracija: ${exchangeId.toUpperCase()}\n`));
    
    // Instructions per exchange
    const instructions = getExchangeInstructions(exchangeId);
    console.log(chalk.gray(instructions));
    
    const { apiKey, secret } = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: `${exchangeId} API Key:`,
        validate: (input) => input.length > 10 || 'API Key mora biti duži od 10 karaktera'
      },
      {
        type: 'password',
        name: 'secret',
        message: `${exchangeId} Secret Key:`,
        mask: '*',
        validate: (input) => input.length > 10 || 'Secret mora biti duži od 10 karaktera'
      }
    ]);
    
    // Test connection
    const spinner = ora(`Testiranje konekcije na ${exchangeId}...`).start();
    
    try {
      const ExchangeClass = ccxt[exchangeId];
      const exchange = new ExchangeClass({
        apiKey: apiKey,
        secret: secret,
        enableRateLimit: true
      });
      
      // Try to fetch balance
      await exchange.fetchBalance();
      
      spinner.succeed(chalk.green(`${exchangeId} uspešno povezan!`));
      
      configs[exchangeId] = {
        enabled: true,
        apiKey: apiKey,
        secret: secret
      };
      
    } catch (error) {
      spinner.fail(chalk.red(`${exchangeId} konekcija neuspešna: ${error.message}`));
      
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: 'Da li želite da pokušate ponovo?',
          default: true
        }
      ]);
      
      if (retry) {
        return await configureExchanges([exchangeId], ipAddress);
      } else {
        console.log(chalk.yellow(`⏭️  Preskačemo ${exchangeId}`));
      }
    }
  }
  
  return configs;
}

// Step 6: Verify balances
async function verifyBalances(exchangeConfigs) {
  console.log(chalk.blue('\n💰 Provera depozita na menjačnicama...\n'));
  
  for (const [exchangeId, config] of Object.entries(exchangeConfigs)) {
    const spinner = ora(`Proveravamo balance na ${exchangeId}...`).start();
    
    try {
      const ExchangeClass = ccxt[exchangeId];
      const exchange = new ExchangeClass({
        apiKey: config.apiKey,
        secret: config.secret,
        enableRateLimit: true
      });
      
      const balance = await exchange.fetchBalance();
      const usdtBalance = balance['USDT']?.free || 0;
      const usdBalance = balance['USD']?.free || 0;
      const totalBalance = usdtBalance + usdBalance;
      
      if (totalBalance < 10) {
        spinner.warn(chalk.yellow(`${exchangeId}: Balance = $${totalBalance.toFixed(2)} (premalo!)`));
        
        console.log(chalk.yellow(`\n⚠️  Na ${exchangeId} imate samo $${totalBalance.toFixed(2)}`));
        console.log(chalk.yellow('   Preporučujemo minimum $50 za početak.\n'));
        
        const { depositNow } = await inquirer.prompt([
          {
            type: 'list',
            name: 'depositNow',
            message: 'Šta želite da uradite?',
            choices: [
              { name: '⏸️  Pauziram setup da dodam sredstva', value: 'pause' },
              { name: '▶️  Nastavljam sa trenutnim balansom (rizično!)', value: 'continue' },
              { name: '❌ Otkažem setup', value: 'cancel' }
            ]
          }
        ]);
        
        if (depositNow === 'pause') {
          console.log(chalk.blue('\n📝 Uputstvo za deposit:'));
          console.log(chalk.gray(`   1. Login na ${exchangeId}`));
          console.log(chalk.gray(`   2. Wallet → Deposit → USDT`));
          console.log(chalk.gray(`   3. Izaberite TRC20 network (najjeftinije)`));
          console.log(chalk.gray(`   4. Kopirajte adresu i pošaljite minimum $50`));
          console.log(chalk.gray(`   5. Sačekajte potvrdu (5-10 min)`));
          console.log(chalk.gray(`   6. Pokrenite skriptu ponovo\n`));
          process.exit(0);
        } else if (depositNow === 'cancel') {
          console.log(chalk.red('\n❌ Setup otkazan.'));
          process.exit(0);
        }
        
      } else {
        spinner.succeed(chalk.green(`${exchangeId}: Balance = $${totalBalance.toFixed(2)} ✅`));
        
        // Save balance to config
        config.currentBalance = totalBalance;
      }
      
    } catch (error) {
      spinner.fail(chalk.red(`${exchangeId}: Ne mogu da proverim balance - ${error.message}`));
    }
  }
  
  console.log();
}

// Step 7: Alert configuration
async function configureAlerts() {
  console.log(chalk.blue('📢 Konfiguracija obaveštenja...\n'));
  
  const { setupAlerts } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setupAlerts',
      message: 'Da li želite da konfigurišete email/telegram obaveštenja?',
      default: true
    }
  ]);
  
  if (!setupAlerts) {
    return {
      email: { enabled: false },
      telegram: { enabled: false }
    };
  }
  
  const alertConfig = {};
  
  // Email setup
  const { useEmail } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useEmail',
      message: 'Email obaveštenja?',
      default: true
    }
  ]);
  
  if (useEmail) {
    const emailData = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: 'SMTP Host (npr. smtp.gmail.com):',
        default: 'smtp.gmail.com'
      },
      {
        type: 'input',
        name: 'port',
        message: 'SMTP Port:',
        default: '587'
      },
      {
        type: 'input',
        name: 'user',
        message: 'Email adresa:',
        validate: (input) => input.includes('@') || 'Unesite validnu email adresu'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Email password (app password):',
        mask: '*'
      },
      {
        type: 'input',
        name: 'to',
        message: 'Primaoc obaveštenja (može biti isti):',
        validate: (input) => input.includes('@') || 'Unesite validnu email adresu'
      }
    ]);
    
    alertConfig.email = {
      enabled: true,
      host: emailData.host,
      port: parseInt(emailData.port),
      user: emailData.user,
      password: emailData.password,
      from: emailData.user,
      to: emailData.to
    };
    
    console.log(chalk.green('✅ Email konfigurisano\n'));
  } else {
    alertConfig.email = { enabled: false };
  }
  
  // Telegram setup
  const { useTelegram } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useTelegram',
      message: 'Telegram obaveštenja?',
      default: false
    }
  ]);
  
  if (useTelegram) {
    console.log(chalk.gray('\n📱 Za Telegram:'));
    console.log(chalk.gray('   1. Kontaktirajte @BotFather na Telegram'));
    console.log(chalk.gray('   2. Kreirajte bot: /newbot'));
    console.log(chalk.gray('   3. Dobijete bot token'));
    console.log(chalk.gray('   4. Startujte bot i pošaljite poruku'));
    console.log(chalk.gray('   5. Dobijete chat ID\n'));
    
    const telegramData = await inquirer.prompt([
      {
        type: 'input',
        name: 'botToken',
        message: 'Telegram Bot Token:',
        validate: (input) => input.length > 20 || 'Token mora biti duži'
      },
      {
        type: 'input',
        name: 'chatId',
        message: 'Telegram Chat ID:',
        validate: (input) => !isNaN(input) || 'Chat ID mora biti broj'
      }
    ]);
    
    alertConfig.telegram = {
      enabled: true,
      botToken: telegramData.botToken,
      chatId: telegramData.chatId
    };
    
    console.log(chalk.green('✅ Telegram konfigurisano\n'));
  } else {
    alertConfig.telegram = { enabled: false };
  }
  
  return alertConfig;
}

// Step 8: Safety limits
async function configureSafetyLimits() {
  console.log(chalk.blue('🛡️  Konfiguracija sigurnosnih limita...\n'));
  
  console.log(chalk.yellow('⚠️  PREPORUČENE VREDNOSTI ZA POČETAK:'));
  console.log(chalk.gray('   Max trade: $10-20'));
  console.log(chalk.gray('   Max daily: $30-50'));
  console.log(chalk.gray('   Min spread: 2%+\n'));
  
  const { useRecommended } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useRecommended',
      message: 'Da li želite da koristite preporučene sigurnosne limite?',
      default: true
    }
  ]);
  
  if (useRecommended) {
    return {
      maxTradeSize: 15,
      maxDailyVolume: 40,
      maxOpenPositions: 2,
      minSpreadRequired: 2.0,
      maxConsecutiveLosses: 3,
      maxDailyLoss: 15,
      requireApproval: true,
      autoApproveUnder: 5
    };
  }
  
  const limits = await inquirer.prompt([
    {
      type: 'number',
      name: 'maxTradeSize',
      message: 'Maksimalna veličina trade-a (USD):',
      default: 15,
      validate: (input) => input > 0 && input <= 100 || 'Između 1 i 100'
    },
    {
      type: 'number',
      name: 'maxDailyVolume',
      message: 'Maksimalni dnevni volumen (USD):',
      default: 40,
      validate: (input) => input > 0 && input <= 500 || 'Između 1 i 500'
    },
    {
      type: 'number',
      name: 'maxOpenPositions',
      message: 'Maksimalan broj otvorenih pozicija:',
      default: 2,
      validate: (input) => input > 0 && input <= 5 || 'Između 1 i 5'
    },
    {
      type: 'number',
      name: 'minSpreadRequired',
      message: 'Minimalni spread (%)::',
      default: 2.0,
      validate: (input) => input >= 0.5 || 'Minimum 0.5%'
    },
    {
      type: 'confirm',
      name: 'requireApproval',
      message: 'Da li je potrebno ručno odobrenje za svaki trade?',
      default: true
    }
  ]);
  
  limits.maxConsecutiveLosses = 3;
  limits.maxDailyLoss = Math.floor(limits.maxDailyVolume * 0.4);
  limits.autoApproveUnder = 5;
  
  console.log(chalk.green('\n✅ Sigurnosni limiti konfigurisani\n'));
  return limits;
}

// Step 9: Generate config files
async function generateConfigFiles(exchangeConfigs, alertConfig, safetyLimits) {
  console.log(chalk.blue('📝 Generisanje konfiguracijskih fajlova...\n'));
  
  const spinner = ora('Kreiram config fajlove...').start();
  
  try {
    // Real trading config
    const realTradingConfig = {
      enabled: true,
      dryRun: false,
      safetyCaps: {
        maxTradeSize: safetyLimits.maxTradeSize,
        maxDailyVolume: safetyLimits.maxDailyVolume,
        maxOpenPositions: safetyLimits.maxOpenPositions,
        minSpreadRequired: safetyLimits.minSpreadRequired,
        maxConsecutiveLosses: safetyLimits.maxConsecutiveLosses,
        maxDailyLoss: safetyLimits.maxDailyLoss
      },
      approval: {
        requireApproval: safetyLimits.requireApproval,
        autoApproveUnder: safetyLimits.autoApproveUnder
      },
      exchanges: exchangeConfigs,
      notifications: {
        onTrade: true,
        onApprovalRequired: true,
        onEmergencyStop: true,
        onDailyLimitReached: true
      }
    };
    
    const realTradingPath = join(__dirname, 'config', 'realtrading.json');
    writeFileSync(realTradingPath, JSON.stringify(realTradingConfig, null, 2));
    spinner.succeed('realtrading.json kreiran');
    
    // Alerts config
    const alertsPath = join(__dirname, 'config', 'alerts.json');
    const alertsConfig = {
      ...alertConfig,
      thresholds: {
        balanceDrop: 10,
        profitableSpread: 2.0,
        exchangeDowntime: 300
      },
      rules: {
        balance: { enabled: true },
        opportunity: { enabled: true },
        exchangeHealth: { enabled: true },
        trading: { enabled: true }
      }
    };
    
    writeFileSync(alertsPath, JSON.stringify(alertsConfig, null, 2));
    spinner.succeed('alerts.json kreiran');
    
    console.log();
    
  } catch (error) {
    spinner.fail('Greška pri kreiranju config fajlova');
    throw error;
  }
}

// Step 10: Final confirmation
async function finalConfirmation(safetyLimits) {
  console.log(chalk.blue('⚠️  FINALNA POTVRDA\n'));
  
  console.log(chalk.cyan('📊 Pregled konfiguracije:'));
  console.log(chalk.gray('─────────────────────────────────────'));
  console.log(chalk.white(`   Real Trading:    ${chalk.red('AKTIVIRAN')}`));
  console.log(chalk.white(`   Dry-Run Mode:    ${chalk.red('ISKLJUČEN')}`));
  console.log(chalk.white(`   Max Trade:       $${safetyLimits.maxTradeSize}`));
  console.log(chalk.white(`   Max Daily:       $${safetyLimits.maxDailyVolume}`));
  console.log(chalk.white(`   Min Spread:      ${safetyLimits.minSpreadRequired}%`));
  console.log(chalk.white(`   Manual Approval: ${safetyLimits.requireApproval ? 'DA' : 'NE'}`));
  console.log(chalk.gray('─────────────────────────────────────\n'));
  
  console.log(chalk.red('🚨 UPOZORENJE: Ovo je PRAVO trgovanje sa pravim novcem!'));
  console.log(chalk.yellow('   • Možete IZGUBITI novac'));
  console.log(chalk.yellow('   • Tržište je volatilno'));
  console.log(chalk.yellow('   • Nema garancije profita'));
  console.log(chalk.yellow('   • Koristite samo novac koji možete da izgubite\n'));
  
  const { finalConfirm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'finalConfirm',
      message: chalk.red('Upišite "RAZUMEM RIZIKE" za aktivaciju:'),
      validate: (input) => {
        if (input === 'RAZUMEM RIZIKE') return true;
        return 'Morate uneti tačnu frazu';
      }
    }
  ]);
  
  if (finalConfirm !== 'RAZUMEM RIZIKE') {
    console.log(chalk.red('\n❌ Setup otkazan. Niste potvrdili rizike.'));
    process.exit(0);
  }

  console.log();
}

// Step 11: Success
async function successMessage() {
  console.log(chalk.green.bold('\n🎉 REAL TRADING USPEŠNO KONFIGURISAN!\n'));
  
  console.log(chalk.cyan('📋 Sledeći koraci:\n'));
  console.log(chalk.white('   1. Restartuj server:'));
  console.log(chalk.gray('      pm2 restart crypto-arbitrage\n'));
  
  console.log(chalk.white('   2. Prati logove:'));
  console.log(chalk.gray('      pm2 logs crypto-arbitrage\n'));
  
  console.log(chalk.white('   3. Proveri status:'));
  console.log(chalk.gray('      http://localhost:8080/api/realtrading/status\n'));
  
  console.log(chalk.white('   4. Preporučeno - instaliraj mobile app:'));
  console.log(chalk.gray('      cd mobile && npm install && npm start\n'));
  
  console.log(chalk.yellow('⚠️  VAŽNO:'));
  console.log(chalk.yellow('   • Prati sistem non-stop prvih 24h'));
  console.log(chalk.yellow('   • Emergency stop: POST /api/realtrading/emergency-stop'));
  console.log(chalk.yellow('   • Pending trades: GET /api/realtrading/pending'));
  console.log(chalk.yellow('   • Možeš pauzirati u bilo kom trenutku\n'));
  
  console.log(chalk.green.bold('🚀 Srećno u trading-u!\n'));
}

// Helper: Exchange instructions
function getExchangeInstructions(exchangeId) {
  const instructions = {
    binance: `
📝 Binance API Setup:
   1. Login → Profil ikonica → API Management
   2. "Create API" → Label: "Crypto Arbitrage"
   3. ✅ Enable Reading
   4. ✅ Enable Spot Trading
   5. ❌ DISABLE Withdrawals (VAŽNO!)
   6. ❌ DISABLE Futures
   7. Add IP whitelist
   8. Copy API Key i Secret
`,
    kraken: `
📝 Kraken API Setup:
   1. Settings → API → Create New Key
   2. Permissions:
      ✅ Query Funds
      ✅ Create & Modify Orders
      ❌ Withdraw Funds (DISABLE!)
   3. Copy API Key i Private Key
`,
    coinbase: `
📝 Coinbase API Setup:
   1. Settings → API → New API Key
   2. Permissions:
      ✅ View
      ✅ Trade
      ❌ Transfer (DISABLE!)
   3. Copy API Key i Secret
`,
    kucoin: `
📝 KuCoin API Setup:
   1. API Management → Create API
   2. Permissions: General + Spot Trading
   3. ❌ DISABLE Transfer
   4. IP Whitelist
   5. Copy API Key, Secret, Passphrase
`,
    bybit: `
📝 Bybit API Setup:
   1. API Management → Create New Key
   2. Type: System Generated
   3. Permissions: Spot Trading
   4. IP Whitelist
   5. Copy API Key i Secret
`,
    mexc: `
📝 MEXC API Setup:
   1. Idi na: https://www.mexc.com/user/openapi
   2. Create API Key
   3. Permissions:
      ✅ Spot Trading
      ❌ Withdraw (DISABLE!)
   4. IP Whitelist (dodaj svoju IP)
   5. Copy API Key i Secret
`
  };
  
  return instructions[exchangeId] || '';
}

// Run the setup
main().catch(error => {
  console.error(chalk.red('\n💥 Fatal error:'), error);
  process.exit(1);
});
