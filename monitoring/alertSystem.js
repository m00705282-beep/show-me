/**
 * Alert System
 * Email and Telegram notifications for critical events
 */

import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

export class AlertSystem {
  constructor(config = {}) {
    this.config = {
      email: {
        enabled: config.email?.enabled || false,
        host: config.email?.host || process.env.SMTP_HOST || 'smtp.gmail.com',
        port: config.email?.port || process.env.SMTP_PORT || 587,
        secure: config.email?.secure || false,
        user: config.email?.user || process.env.SMTP_USER,
        pass: config.email?.pass || process.env.SMTP_PASS,
        from: config.email?.from || process.env.SMTP_FROM || 'crypto-arbitrage@localhost',
        to: config.email?.to || process.env.ALERT_EMAIL
      },
      telegram: {
        enabled: config.telegram?.enabled || false,
        token: config.telegram?.token || process.env.TELEGRAM_BOT_TOKEN,
        chatId: config.telegram?.chatId || process.env.TELEGRAM_CHAT_ID
      },
      thresholds: {
        balanceDropPercent: config.thresholds?.balanceDropPercent || 10, // 10%
        profitableSpreadPercent: config.thresholds?.profitableSpreadPercent || 2, // 2%
        exchangeDowntimeMinutes: config.thresholds?.exchangeDowntimeMinutes || 15
      }
    };
    
    // Initialize email transporter
    if (this.config.email.enabled && this.config.email.user && this.config.email.pass) {
      this.emailTransporter = nodemailer.createTransport({
        host: this.config.email.host,
        port: this.config.email.port,
        secure: this.config.email.secure,
        auth: {
          user: this.config.email.user,
          pass: this.config.email.pass
        }
      });
      console.log('[alert] ✅ Email alerts enabled:', this.config.email.to);
    } else {
      console.log('[alert] ⚠️  Email alerts disabled (no credentials)');
    }
    
    // Initialize Telegram capability flag
    this.telegramEnabled = Boolean(
      this.config.telegram.enabled &&
      this.config.telegram.token &&
      this.config.telegram.chatId
    );

    if (this.telegramEnabled) {
      console.log('[alert] ✅ Telegram alerts enabled:', this.config.telegram.chatId);
    } else {
      console.log('[alert] ⚠️  Telegram alerts disabled (no credentials)');
    }
    
    // Alert history (prevent spam)
    this.alertHistory = new Map();
    this.cooldownMs = 15 * 60 * 1000; // 15 minutes cooldown
    
    console.log('[alert] Alert System initialized');
  }

  /**
   * Check if alert should be sent (cooldown check)
   */
  shouldSendAlert(alertType, key) {
    const alertKey = `${alertType}:${key}`;
    const lastSent = this.alertHistory.get(alertKey);
    
    if (lastSent && Date.now() - lastSent < this.cooldownMs) {
      return false; // Still in cooldown
    }
    
    return true;
  }

  /**
   * Mark alert as sent
   */
  markAlertSent(alertType, key) {
    const alertKey = `${alertType}:${key}`;
    this.alertHistory.set(alertKey, Date.now());
  }

  /**
   * Send email alert
   */
  async sendEmail(subject, text, html) {
    if (!this.emailTransporter) {
      return { success: false, reason: 'email_not_configured' };
    }
    
    try {
      const info = await this.emailTransporter.sendMail({
        from: this.config.email.from,
        to: this.config.email.to,
        subject: `[Crypto Arbitrage] ${subject}`,
        text,
        html
      });
      
      console.log('[alert] 📧 Email sent:', subject);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('[alert] ❌ Email failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Telegram alert
   */
  async sendTelegram(message) {
    if (!this.telegramEnabled) {
      return { success: false, reason: 'telegram_not_configured' };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.config.telegram.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.config.telegram.chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        const errorMessage = result?.description || response.statusText || 'unknown_error';
        throw new Error(errorMessage);
      }

      console.log('[alert] 📱 Telegram sent:', message.substring(0, 50) + '...');
      return { success: true, messageId: result.result?.message_id };
    } catch (err) {
      console.error('[alert] ❌ Telegram failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send alert to all enabled channels
   */
  async sendAlert(alertType, subject, message, details = {}) {
    const key = details.key || 'default';
    
    // Check cooldown
    if (!this.shouldSendAlert(alertType, key)) {
      console.log(`[alert] ⏭️  Skipping alert (cooldown): ${alertType}:${key}`);
      return { success: false, reason: 'cooldown' };
    }
    
    const results = {};
    
    // Email
    if (this.emailTransporter) {
      const html = `
        <h2>${subject}</h2>
        <p>${message}</p>
        ${details.html || ''}
        <hr>
        <p style="color:gray;font-size:12px;">Alert Type: ${alertType}<br>Time: ${new Date().toISOString()}</p>
      `;
      results.email = await this.sendEmail(subject, message, html);
    }
    
    // Telegram
    if (this.telegramEnabled) {
      const telegramMessage = `🚨 *${subject}*\n\n${message}\n\n_${new Date().toLocaleString()}_`;
      results.telegram = await this.sendTelegram(telegramMessage);
    }
    
    // Mark as sent
    this.markAlertSent(alertType, key);
    
    return results;
  }

  /**
   * Alert: Balance Drop
   */
  async alertBalanceDrop(currentBalance, previousBalance, dropPercent) {
    if (dropPercent < this.config.thresholds.balanceDropPercent) {
      return; // Not significant enough
    }
    
    const subject = `⚠️ Balance Drop Alert: -${dropPercent.toFixed(2)}%`;
    const message = `Your balance has dropped by ${dropPercent.toFixed(2)}%!\n\nPrevious: $${previousBalance.toFixed(2)}\nCurrent: $${currentBalance.toFixed(2)}\nLoss: $${(previousBalance - currentBalance).toFixed(2)}`;
    
    const details = {
      key: 'balance-drop',
      html: `
        <table style="border-collapse:collapse;width:100%;max-width:400px">
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Previous Balance:</strong></td><td style="padding:8px">$${previousBalance.toFixed(2)}</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Current Balance:</strong></td><td style="padding:8px">$${currentBalance.toFixed(2)}</td></tr>
          <tr><td style="padding:8px;background:#ffebee;color:#c62828"><strong>Loss:</strong></td><td style="padding:8px;color:#c62828">$${(previousBalance - currentBalance).toFixed(2)} (-${dropPercent.toFixed(2)}%)</td></tr>
        </table>
      `
    };
    
    return await this.sendAlert('balance_drop', subject, message, details);
  }

  /**
   * Alert: Server Crash
   */
  async alertServerCrash(error) {
    const subject = '🔥 Server Crash Alert';
    const message = `The arbitrage server has crashed!\n\nError: ${error.message}\n\nPlease check the logs and restart the server.`;
    
    const details = {
      key: 'server-crash',
      html: `
        <div style="background:#ffebee;padding:12px;border-left:4px solid #c62828">
          <strong>Error:</strong> ${error.message}<br>
          <strong>Stack:</strong> <pre style="font-size:11px;overflow:auto">${error.stack}</pre>
        </div>
      `
    };
    
    return await this.sendAlert('server_crash', subject, message, details);
  }

  /**
   * Alert: Exchange Downtime
   */
  async alertExchangeDown(exchangeName, lastSuccessTime) {
    const downMinutes = Math.floor((Date.now() - lastSuccessTime) / 60000);
    
    if (downMinutes < this.config.thresholds.exchangeDowntimeMinutes) {
      return; // Not down long enough
    }
    
    const subject = `⚠️ Exchange Down: ${exchangeName}`;
    const message = `Exchange ${exchangeName} has been unresponsive for ${downMinutes} minutes.\n\nLast successful request: ${new Date(lastSuccessTime).toLocaleString()}`;
    
    const details = {
      key: `exchange-down-${exchangeName}`,
      html: `
        <p><strong>Exchange:</strong> ${exchangeName}</p>
        <p><strong>Downtime:</strong> ${downMinutes} minutes</p>
        <p><strong>Last Success:</strong> ${new Date(lastSuccessTime).toLocaleString()}</p>
      `
    };
    
    return await this.sendAlert('exchange_down', subject, message, details);
  }

  /**
   * Alert: High Profit Opportunity
   */
  async alertProfitOpportunity(opportunity) {
    if (opportunity.netSpread < this.config.thresholds.profitableSpreadPercent) {
      return; // Not profitable enough
    }
    
    const subject = `💰 High Profit Opportunity: ${opportunity.coin}`;
    const message = `Profitable arbitrage opportunity detected!\n\nCoin: ${opportunity.coin}\nNet Spread: ${opportunity.netSpread.toFixed(3)}%\nBuy: ${opportunity.buyExchange} @ $${opportunity.buyPrice.toFixed(2)}\nSell: ${opportunity.sellExchange} @ $${opportunity.sellPrice.toFixed(2)}\nEstimated Profit: $${(opportunity.netSpread * 10).toFixed(2)} (on $1k)`;
    
    const details = {
      key: `opportunity-${opportunity.coin}`,
      html: `
        <table style="border-collapse:collapse;width:100%;max-width:500px">
          <tr style="background:#e8f5e9"><td style="padding:8px"><strong>Coin:</strong></td><td style="padding:8px">${opportunity.coin}</td></tr>
          <tr><td style="padding:8px"><strong>Net Spread:</strong></td><td style="padding:8px;color:#2e7d32;font-weight:bold">${opportunity.netSpread.toFixed(3)}%</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px"><strong>Buy @:</strong></td><td style="padding:8px">${opportunity.buyExchange} - $${opportunity.buyPrice.toFixed(2)}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px"><strong>Sell @:</strong></td><td style="padding:8px">${opportunity.sellExchange} - $${opportunity.sellPrice.toFixed(2)}</td></tr>
          <tr style="background:#e3f2fd"><td style="padding:8px"><strong>Est. Profit:</strong></td><td style="padding:8px;font-weight:bold">$${(opportunity.netSpread * 10).toFixed(2)} (on $1k)</td></tr>
        </table>
      `
    };
    
    return await this.sendAlert('profit_opportunity', subject, message, details);
  }

  /**
   * Alert: Daily Summary
   */
  async alertDailySummary(stats) {
    const subject = '📊 Daily Trading Summary';
    const message = `Here's your daily trading summary:\n\nStarting Balance: $${stats.startingBalance.toFixed(2)}\nEnding Balance: $${stats.endingBalance.toFixed(2)}\nProfit/Loss: $${stats.profitLoss.toFixed(2)} (${stats.profitPercent.toFixed(2)}%)\nTrades Executed: ${stats.totalTrades}\nWin Rate: ${stats.winRate.toFixed(1)}%`;
    
    const details = {
      key: `daily-${new Date().toISOString().split('T')[0]}`,
      html: `
        <h3>Daily Performance</h3>
        <table style="border-collapse:collapse;width:100%;max-width:500px">
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Starting Balance:</strong></td><td style="padding:8px">$${stats.startingBalance.toFixed(2)}</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Ending Balance:</strong></td><td style="padding:8px">$${stats.endingBalance.toFixed(2)}</td></tr>
          <tr style="background:${stats.profitLoss >= 0 ? '#e8f5e9' : '#ffebee'}"><td style="padding:8px"><strong>Profit/Loss:</strong></td><td style="padding:8px;color:${stats.profitLoss >= 0 ? '#2e7d32' : '#c62828'};font-weight:bold">$${stats.profitLoss.toFixed(2)} (${stats.profitPercent.toFixed(2)}%)</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Trades:</strong></td><td style="padding:8px">${stats.totalTrades}</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Win Rate:</strong></td><td style="padding:8px">${stats.winRate.toFixed(1)}%</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5"><strong>Total Fees:</strong></td><td style="padding:8px">$${stats.totalFees.toFixed(2)}</td></tr>
        </table>
      `
    };
    
    return await this.sendAlert('daily_summary', subject, message, details);
  }

  /**
   * Test alerts (send test notifications)
   */
  async testAlerts() {
    console.log('[alert] 🧪 Testing alert system...');
    
    const subject = '🧪 Test Alert';
    const message = 'This is a test alert from your Crypto Arbitrage Monitor. If you received this, alerts are working correctly!';
    
    const results = await this.sendAlert('test', subject, message, { key: 'test-' + Date.now() });
    
    console.log('[alert] Test results:', results);
    return results;
  }

  /**
   * Get alert statistics
   */
  getStats() {
    return {
      emailEnabled: !!this.emailTransporter,
      telegramEnabled: this.telegramEnabled,
      alertsSent: this.alertHistory.size,
      thresholds: this.config.thresholds,
      cooldownMs: this.cooldownMs
    };
  }
}
