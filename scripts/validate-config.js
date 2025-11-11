#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE_DIR = process.cwd();
const CONFIG_DIR = join(BASE_DIR, 'config');

const REQUIRED_FILES = [
  {
    name: 'fees.json',
    required: true,
    validate: data => {
      if (!data.exchanges || typeof data.exchanges !== 'object') {
        throw new Error('Missing "exchanges" object');
      }
      if (!data.defaultFees || typeof data.defaultFees !== 'object') {
        throw new Error('Missing "defaultFees" object');
      }
    }
  },
  {
    name: 'alerts.json',
    required: false,
    validate: data => {
      if (!data.rules) {
        console.warn('⚠️  [config] alerts.json: "rules" not defined (using defaults)');
      }
    }
  },
  {
    name: 'realtrading.json',
    required: false,
    validate: data => {
      if (typeof data.enabled !== 'boolean') {
        console.warn('⚠️  [config] realtrading.json: "enabled" flag missing (defaulting to false)');
      }
      if (data.enabled && data.dryRun !== false) {
        console.warn('⚠️  [config] realtrading.json: real trading enabled but dryRun not set to false');
      }
    }
  }
];

let hadError = false;

for (const file of REQUIRED_FILES) {
  const fullPath = join(CONFIG_DIR, file.name);
  if (!existsSync(fullPath)) {
    const message = `[config] ${file.name} is missing${file.required ? ' (required)' : ''}`;
    if (file.required) {
      console.error(`❌ ${message}`);
      hadError = true;
    } else {
      console.warn(`⚠️  ${message}`);
    }
    continue;
  }

  try {
    const raw = readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(raw);
    file.validate?.(parsed);
    console.log(`✅ [config] ${file.name} OK`);
  } catch (err) {
    console.error(`❌ [config] ${file.name} invalid: ${err.message}`);
    hadError = true;
  }
}

if (hadError) {
  console.error('\n❌ Configuration validation failed.');
  process.exit(1);
}

console.log('\n✅ Configuration validation passed.');
