import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readConfigFile(baseDir, fileName) {
  const path = join(baseDir, 'config', fileName);
  return readFileSync(path, 'utf-8');
}

export function loadFeeConfig(baseDir) {
  try {
    const data = readConfigFile(baseDir, 'fees.json');
    const parsed = JSON.parse(data);
    console.log('[init] loaded fee config for', Object.keys(parsed.exchanges).length, 'exchanges');
    return { feeConfig: parsed };
  } catch (err) {
    console.error('[init] failed to load fee config:', err.message);
    return {
      feeConfig: {
        exchanges: {},
        defaultFees: { maker: 20, taker: 20, withdrawal: { default: 0 } }
      }
    };
  }
}

export function loadAlertConfig(baseDir, { AlertSystem, AlertRulesEngine }) {
  try {
    const data = readConfigFile(baseDir, 'alerts.json');
    const alertConfig = JSON.parse(data);
    console.log('[init] ✅ Loaded alert config');

    const alertSystem = new AlertSystem(alertConfig);
    const alertRulesEngine = new AlertRulesEngine(alertConfig.rules || {});

    return { alertConfig, alertSystem, alertRulesEngine };
  } catch (err) {
    console.log('[init] ⚠️  Alert config not found (optional)');
    console.log('[init] 💡 Copy config/alerts.example.json to config/alerts.json to enable alerts');

    const alertSystem = new AlertSystem({
      email: { enabled: false },
      telegram: { enabled: false }
    });
    const alertRulesEngine = new AlertRulesEngine({});

    return {
      alertConfig: null,
      alertSystem,
      alertRulesEngine
    };
  }
}

export function loadRealTradingConfig(baseDir, { RealTradingEngine, MultiTradeExecutor }) {
  try {
    const data = readConfigFile(baseDir, 'realtrading.json');
    const realTradingConfig = JSON.parse(data);
    console.log('[init] ✅ Loaded real trading config');

    const realTradingEngine = new RealTradingEngine(realTradingConfig);

    if (realTradingConfig.enabled && !realTradingConfig.dryRun) {
      console.log('[init] ⚠️  REAL TRADING MODE ENABLED - BE CAREFUL!');
    } else if (realTradingConfig.enabled && realTradingConfig.dryRun) {
      console.log('[init] 🧪 Real trading in DRY-RUN mode (safe)');
    } else {
      console.log('[init] Real trading disabled');
    }

    let multiTradeExecutor = null;
    if (typeof MultiTradeExecutor !== 'undefined') {
      multiTradeExecutor = new MultiTradeExecutor(realTradingEngine, {
        maxConcurrentTrades: 5,
        priorityThreshold: 2.0
      });
      console.log('[init] ✅ Multi-Trade Executor initialized (max 5 concurrent trades)');
    }

    return { realTradingConfig, realTradingEngine, multiTradeExecutor };
  } catch (err) {
    console.log('[init] ⚠️  Real trading config not found (optional)');
    console.log('[init] 💡 Copy config/realtrading.example.json to config/realtrading.json to enable');

    const realTradingEngine = new RealTradingEngine({
      enabled: false,
      dryRun: true
    });

    let multiTradeExecutor = null;
    if (typeof MultiTradeExecutor !== 'undefined') {
      multiTradeExecutor = new MultiTradeExecutor(realTradingEngine, {
        maxConcurrentTrades: 3
      });
    }

    return {
      realTradingConfig: null,
      realTradingEngine,
      multiTradeExecutor
    };
  }
}
