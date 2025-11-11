#!/usr/bin/env node

/**
 * 🔴 MEXC API CREDENTIALS SETUP
 * Brzo dodavanje MEXC exchange-a u realtrading config
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '..', 'config', 'realtrading.json');

// MEXC credentials
const mexcConfig = {
  enabled: true,
  apiKey: "mx0vglrCdDGeLVD3ut",
  secret: "5db05ee519824db1a2f1428ea7728078"
};

console.log('🔴 MEXC Setup - Dodavanje kredencijala...\n');

try {
  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    console.error('❌ config/realtrading.json ne postoji!');
    console.log('\n📝 Prvo pokrenite setup: node scripts/setup-real-trading.js');
    process.exit(1);
  }

  // Read existing config
  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);

  // Ensure exchanges object exists
  if (!config.exchanges) {
    config.exchanges = {};
  }

  // Check if MEXC already exists
  if (config.exchanges.mexc) {
    console.log('⚠️  MEXC već postoji u konfiguraciji!');
    console.log('\n📋 Trenutni MEXC config:');
    console.log(JSON.stringify({
      enabled: config.exchanges.mexc.enabled,
      apiKey: config.exchanges.mexc.apiKey ? config.exchanges.mexc.apiKey.substring(0, 10) + '...' : 'N/A'
    }, null, 2));
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\n❓ Da li želite da zamenite postojeću konfiguraciju? (da/ne): ', (answer) => {
      rl.close();
      
      if (answer.toLowerCase() !== 'da') {
        console.log('\n❌ Otkazano. MEXC config nije promenjen.');
        process.exit(0);
      }
      
      updateMexcConfig(config);
    });
    
  } else {
    updateMexcConfig(config);
  }

} catch (error) {
  console.error('❌ Greška:', error.message);
  console.error('\n📋 Detalji:', error.stack);
  process.exit(1);
}

function updateMexcConfig(config) {
  try {
    // Add/Update MEXC configuration
    config.exchanges.mexc = mexcConfig;

    // Write back to file with pretty formatting
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    console.log('\n✅ MEXC kredencijali uspešno dodati u config/realtrading.json');
    console.log('\n📝 Dodata konfiguracija:');
    console.log('─────────────────────────────────────');
    console.log(`   Exchange:  MEXC`);
    console.log(`   Enabled:   ${mexcConfig.enabled ? '✅ DA' : '❌ NE'}`);
    console.log(`   API Key:   ${mexcConfig.apiKey.substring(0, 10)}...`);
    console.log(`   Secret:    ${mexcConfig.secret.substring(0, 10)}...`);
    console.log('─────────────────────────────────────');
    
    console.log('\n🔄 Sledeći koraci:');
    console.log('   1. Restartuj bot:');
    console.log('      pm2 restart crypto-arbitrage');
    console.log('');
    console.log('   2. Proveri logove:');
    console.log('      pm2 logs crypto-arbitrage');
    console.log('');
    console.log('   3. Traži u logovima:');
    console.log('      "[real-trading] ✅ mexc connected"');
    console.log('');
    console.log('   4. Proveri status:');
    console.log('      http://localhost:8080/api/realtrading/status');
    console.log('');
    
    console.log('🎉 MEXC je spreman za trading!\n');
    
  } catch (error) {
    console.error('❌ Greška pri čuvanju:', error.message);
    process.exit(1);
  }
}
