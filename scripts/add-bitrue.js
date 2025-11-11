#!/usr/bin/env node

/**
 * Add Bitrue to configuration
 */

import { readFileSync, writeFileSync } from 'fs';

const configPath = './config/realtrading.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));

// Add Bitrue
config.exchanges.bitrue = {
  enabled: true,
  apiKey: "8dfce3804a6dd47518a2ce96e4029e5a5fe1df8142c3bd234f918ed3e4d33317",
  secret: "ENTER_SECRET_HERE",
  description: "Bitrue - Added automatically"
};

writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log('\n✅ Bitrue added to config!');
console.log('\n⚠️  IMPORTANT: Add Bitrue secret key manually in config/realtrading.json');
console.log('   Find "bitrue" section and replace "ENTER_SECRET_HERE"\n');
