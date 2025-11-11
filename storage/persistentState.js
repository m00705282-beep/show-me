import fs from 'fs';
import path from 'path';

export class PersistentState {
  constructor(stateFile = './data/state.json', options = {}) {
    const {
      autoSave = true,
      autoSaveInterval = 30000,
      handleSignals = true
    } = options;

    this.stateFile = stateFile;
    this.options = { autoSave, autoSaveInterval, handleSignals };
    this.state = this.load();
    this.disposed = false;

    if (autoSave && autoSaveInterval > 0) {
      this.saveInterval = setInterval(() => this.save(), autoSaveInterval);
    }

    if (handleSignals) {
      this.boundSigint = () => this.saveAndExit();
      this.boundSigterm = () => this.saveAndExit();
      this.boundUncaught = (err) => {
        console.error('[state] Uncaught exception:', err.message);
        this.save();
        process.exit(1);
      };

      process.on('SIGINT', this.boundSigint);
      process.on('SIGTERM', this.boundSigterm);
      process.on('uncaughtException', this.boundUncaught);
    }
    
    console.log('[state] PersistentState initialized');
  }

  load() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        console.log('[state] ✅ Loaded previous state from', this.stateFile);
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[state] Failed to load state:', err.message);
    }
    
    console.log('[state] No previous state found, starting fresh');
    return {
      balance: { USD: 10000 },
      trades: [],
      openPositions: [],
      dailyStats: {},
      lastUpdate: null
    };
  }

  save() {
    try {
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      this.state.lastUpdate = new Date().toISOString();
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
      console.log('[state] State saved at', this.state.lastUpdate);
    } catch (err) {
      console.error('[state] Failed to save state:', err.message);
    }
  }

  saveAndExit() {
    if (this.disposed) {
      return;
    }

    console.log('[state] Saving state before exit...');
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.save();
    process.exit(0);
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
  }

  update(updates) {
    this.state = { ...this.state, ...updates };
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    if (this.options.handleSignals) {
      const off = typeof process.off === 'function' ? process.off.bind(process) : process.removeListener.bind(process);

      if (this.boundSigint) {
        off('SIGINT', this.boundSigint);
        this.boundSigint = null;
      }

      if (this.boundSigterm) {
        off('SIGTERM', this.boundSigterm);
        this.boundSigterm = null;
      }

      if (this.boundUncaught) {
        off('uncaughtException', this.boundUncaught);
        this.boundUncaught = null;
      }
    }

    this.disposed = true;
  }
}
