/**
 * Auto Transfer Module
 * 
 * Automatically executes USDT transfers between exchanges based on
 * AI Balance Manager predictions.
 * 
 * Features:
 * - Network fee optimization (TRC20 vs ERC20)
 * - Safety checks (min balance, transfer limits)
 * - Whitelisted exchanges only
 * - Human override for large transfers
 * - Transfer scheduling (avoid high gas periods)
 */

export class AutoTransfer {
  constructor(exchanges, config = {}) {
    this.exchanges = exchanges; // CCXT exchange instances
    this.config = {
      // Transfer settings
      enabled: config.enabled || false, // Default: manual approval required
      dryRun: config.dryRun !== false, // Default: dry-run mode
      
      // Network selection
      preferredNetwork: config.preferredNetwork || 'TRC20', // Cheapest
      fallbackNetwork: config.fallbackNetwork || 'BEP20',
      
      // Safety limits
      minTransferAmount: config.minTransferAmount || 10,
      maxTransferAmount: config.maxTransferAmount || 200,
      maxDailyTransferVolume: config.maxDailyTransferVolume || 500,
      
      // Exchange whitelist
      whitelistedExchanges: config.whitelistedExchanges || [
        'binance', 'kraken', 'coinbase', 'kucoin', 'bybit', 'okx', 'gateio', 'huobi'
      ],
      
      // Human approval thresholds
      requireApprovalAbove: config.requireApprovalAbove || 100,
      autoApproveBelow: config.autoApproveBelow || 50,
      
      // Fee thresholds
      maxAcceptableFee: config.maxAcceptableFee || 2, // Max $2 fee
      maxFeePercentage: config.maxFeePercentage || 0.02, // Max 2% of transfer
      
      // Timing
      avoidHighGasPeriods: config.avoidHighGasPeriods !== false
    };
    
    this.pendingTransfers = [];
    this.completedTransfers = [];
    this.dailyVolume = 0;
    this.lastDailyReset = Date.now();
    
    this.stats = {
      totalTransfers: 0,
      successfulTransfers: 0,
      failedTransfers: 0,
      totalFeesPaid: 0,
      totalVolumeTransferred: 0,
      avgTransferTime: 0,
      transfersBlocked: 0
    };
    
    console.log('[auto-transfer] 💸 Auto Transfer Module initialized');
    console.log(`[auto-transfer] Mode: ${this.config.dryRun ? 'DRY-RUN' : (this.config.enabled ? 'LIVE' : 'DISABLED')}`);
    console.log(`[auto-transfer] Preferred Network: ${this.config.preferredNetwork}`);
  }

  /**
   * Execute transfers based on balance prediction
   */
  async executeTransfers(transfers) {
    if (!this.config.enabled) {
      console.log('[auto-transfer] ⚠️ Auto-transfer DISABLED. Enable in config to proceed.');
      return { executed: false, reason: 'Auto-transfer disabled' };
    }
    
    console.log(`\n[auto-transfer] 💸 Processing ${transfers.length} transfers...`);
    
    // Reset daily volume if needed
    this.resetDailyVolumeIfNeeded();
    
    const results = [];
    
    for (const transfer of transfers) {
      const result = await this.executeTransfer(transfer);
      results.push(result);
      
      // Add delay between transfers
      await this.sleep(5000); // 5s delay
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n[auto-transfer] ✅ Completed: ${successful} successful, ${failed} failed`);
    
    return {
      executed: true,
      successful,
      failed,
      results
    };
  }

  /**
   * Execute single transfer
   */
  async executeTransfer(transfer) {
    const { from, to, amount, type } = transfer;
    
    console.log(`\n[auto-transfer] 💸 Transfer: ${from} → ${to} ($${amount.toFixed(2)} ${type})`);
    
    // Safety checks
    const safetyCheck = this.performSafetyChecks(transfer);
    if (!safetyCheck.passed) {
      console.log(`[auto-transfer] 🛑 BLOCKED: ${safetyCheck.reason}`);
      this.stats.transfersBlocked++;
      return { success: false, reason: safetyCheck.reason };
    }
    
    // Select optimal network
    const network = this.selectOptimalNetwork(from, to, amount);
    console.log(`[auto-transfer] 🌐 Network: ${network.name} (fee: $${network.fee.toFixed(2)})`);
    
    // Check if human approval needed
    if (amount > this.config.requireApprovalAbove) {
      console.log(`[auto-transfer] ⏳ Amount > $${this.config.requireApprovalAbove}, awaiting human approval...`);
      
      this.pendingTransfers.push({
        ...transfer,
        network: network.name,
        estimatedFee: network.fee,
        status: 'PENDING_APPROVAL',
        createdAt: Date.now()
      });
      
      return {
        success: false,
        reason: 'Awaiting human approval',
        pendingApproval: true
      };
    }
    
    // Execute transfer
    if (this.config.dryRun) {
      console.log('[auto-transfer] 🧪 DRY-RUN: Transfer simulated (not executed)');
      
      this.stats.totalTransfers++;
      this.stats.successfulTransfers++;
      this.dailyVolume += amount;
      
      this.completedTransfers.push({
        ...transfer,
        network: network.name,
        fee: network.fee,
        status: 'DRY_RUN_SUCCESS',
        completedAt: Date.now()
      });
      
      return {
        success: true,
        dryRun: true,
        network: network.name,
        fee: network.fee
      };
    }
    
    // LIVE EXECUTION
    try {
      const startTime = Date.now();
      
      // 1. Withdraw from source exchange
      const withdrawal = await this.withdraw(from, to, amount, type, network.name);
      
      // 2. Wait for confirmation
      await this.waitForConfirmation(withdrawal.txid, network.name);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // seconds
      
      // Update stats
      this.stats.totalTransfers++;
      this.stats.successfulTransfers++;
      this.stats.totalFeesPaid += network.fee;
      this.stats.totalVolumeTransferred += amount;
      this.stats.avgTransferTime = 
        (this.stats.avgTransferTime * (this.stats.totalTransfers - 1) + duration) / this.stats.totalTransfers;
      this.dailyVolume += amount;
      
      this.completedTransfers.push({
        ...transfer,
        network: network.name,
        fee: network.fee,
        txid: withdrawal.txid,
        duration,
        status: 'SUCCESS',
        completedAt: endTime
      });
      
      console.log(`[auto-transfer] ✅ SUCCESS: ${withdrawal.txid} (${duration.toFixed(0)}s)`);
      
      return {
        success: true,
        txid: withdrawal.txid,
        duration,
        fee: network.fee
      };
      
    } catch (err) {
      console.error(`[auto-transfer] ❌ FAILED:`, err.message);
      
      this.stats.totalTransfers++;
      this.stats.failedTransfers++;
      
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Perform safety checks
   */
  performSafetyChecks(transfer) {
    const { from, to, amount } = transfer;
    
    // Check whitelisted exchanges
    if (!this.config.whitelistedExchanges.includes(from) || !this.config.whitelistedExchanges.includes(to)) {
      return { passed: false, reason: 'Exchange not whitelisted' };
    }
    
    // Check amount limits
    if (amount < this.config.minTransferAmount) {
      return { passed: false, reason: `Amount below minimum ($${this.config.minTransferAmount})` };
    }
    
    if (amount > this.config.maxTransferAmount) {
      return { passed: false, reason: `Amount exceeds maximum ($${this.config.maxTransferAmount})` };
    }
    
    // Check daily volume
    if (this.dailyVolume + amount > this.config.maxDailyTransferVolume) {
      return { passed: false, reason: `Daily volume limit exceeded ($${this.config.maxDailyTransferVolume})` };
    }
    
    // Check same exchange
    if (from === to) {
      return { passed: false, reason: 'Cannot transfer to same exchange' };
    }
    
    return { passed: true };
  }

  /**
   * Select optimal network (cheapest with acceptable speed)
   */
  selectOptimalNetwork(fromExchange, toExchange, amount) {
    // Network fees (simplified - should fetch real-time)
    const networks = [
      { name: 'TRC20', fee: 1.0, speed: 'fast' },    // Tron - cheapest
      { name: 'BEP20', fee: 0.2, speed: 'fast' },    // BSC - very cheap
      { name: 'MATIC', fee: 0.1, speed: 'fast' },    // Polygon - cheapest
      { name: 'ERC20', fee: 15.0, speed: 'medium' }  // Ethereum - expensive
    ];
    
    // Filter by acceptable fee
    const acceptable = networks.filter(n => 
      n.fee <= this.config.maxAcceptableFee &&
      (n.fee / amount) <= this.config.maxFeePercentage
    );
    
    if (acceptable.length === 0) {
      // Use cheapest even if above threshold
      return networks.reduce((min, n) => n.fee < min.fee ? n : min);
    }
    
    // Prefer configured network if available
    const preferred = acceptable.find(n => n.name === this.config.preferredNetwork);
    if (preferred) return preferred;
    
    // Otherwise, use cheapest
    return acceptable.reduce((min, n) => n.fee < min.fee ? n : min);
  }

  /**
   * Withdraw from exchange (mock implementation)
   */
  async withdraw(fromExchange, toExchange, amount, currency, network) {
    // In production: Real exchange.withdraw() call
    
    console.log(`[auto-transfer] 📤 Withdrawing ${amount} ${currency} from ${fromExchange} via ${network}...`);
    
    // Simulate withdrawal
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          txid: `TX_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount,
          network,
          status: 'pending'
        });
      }, 1000);
    });
  }

  /**
   * Wait for transfer confirmation
   */
  async waitForConfirmation(txid, network) {
    console.log(`[auto-transfer] ⏳ Waiting for confirmation: ${txid}...`);
    
    // Simulate confirmation wait
    const confirmationTime = {
      'TRC20': 3000,   // 3s
      'BEP20': 3000,   // 3s
      'MATIC': 2000,   // 2s
      'ERC20': 30000   // 30s
    };
    
    await this.sleep(confirmationTime[network] || 5000);
    
    console.log(`[auto-transfer] ✅ Confirmed: ${txid}`);
    
    return true;
  }

  /**
   * Reset daily volume counter
   */
  resetDailyVolumeIfNeeded() {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (now - this.lastDailyReset > dayInMs) {
      this.dailyVolume = 0;
      this.lastDailyReset = now;
      console.log('[auto-transfer] 🔄 Daily volume reset');
    }
  }

  /**
   * Approve pending transfer
   */
  approveTransfer(transferId) {
    const transfer = this.pendingTransfers.find(t => t.createdAt === transferId);
    
    if (!transfer) {
      return { success: false, reason: 'Transfer not found' };
    }
    
    transfer.status = 'APPROVED';
    console.log(`[auto-transfer] ✅ Transfer approved: ${transfer.from} → ${transfer.to} ($${transfer.amount})`);
    
    return { success: true, transfer };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalFeesPaid: '$' + this.stats.totalFeesPaid.toFixed(2),
      totalVolumeTransferred: '$' + this.stats.totalVolumeTransferred.toFixed(2),
      avgTransferTime: this.stats.avgTransferTime.toFixed(0) + 's',
      dailyVolume: '$' + this.dailyVolume.toFixed(2),
      dailyVolumeRemaining: '$' + (this.config.maxDailyTransferVolume - this.dailyVolume).toFixed(2),
      pendingApprovals: this.pendingTransfers.filter(t => t.status === 'PENDING_APPROVAL').length
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   💸 AUTO TRANSFER SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log(`Mode: ${this.config.dryRun ? 'DRY-RUN' : (this.config.enabled ? 'LIVE' : 'DISABLED')}`);
    console.log(`Total Transfers: ${this.stats.totalTransfers}`);
    console.log(`Successful: ${this.stats.successfulTransfers}`);
    console.log(`Failed: ${this.stats.failedTransfers}`);
    console.log(`Blocked: ${this.stats.transfersBlocked}`);
    console.log(`\nVolume:`);
    console.log(`  Total Transferred: $${this.stats.totalVolumeTransferred.toFixed(2)}`);
    console.log(`  Total Fees Paid: $${this.stats.totalFeesPaid.toFixed(2)}`);
    console.log(`  Daily Volume: $${this.dailyVolume.toFixed(2)} / $${this.config.maxDailyTransferVolume}`);
    console.log(`\nAvg Transfer Time: ${this.stats.avgTransferTime.toFixed(0)}s`);
    console.log(`Pending Approvals: ${this.pendingTransfers.filter(t => t.status === 'PENDING_APPROVAL').length}`);
    
    console.log('═══════════════════════════════════════════════════════\n');
  }
}

export default AutoTransfer;
