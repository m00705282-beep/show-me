/* global describe, it, beforeEach, afterEach */
import { expect } from 'chai';
import { CoinTrackingSystem } from '../monitoring/coinTracking.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CoinTrackingSystem', () => {
  let originalFetch;
  let tmpDir;

  const mockResponse = (data, ok = true, status = 200) => ({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    async json() {
      return data;
    }
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'coin-tracking-test-'));
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retries fetch calls before failing', async () => {
    let attempts = 0;
    const stubFetch = async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error('429 Too Many Requests');
        err.status = 429;
        throw err;
      }
      return mockResponse({ coins: [] });
    };

    const tracker = new CoinTrackingSystem({
      dataPath: join(tmpDir, 'coin-tracking.json'),
      retryOptions: { retries: 3, delayMs: 10 }
    });
    tracker.fetch = stubFetch;

    await tracker.fetchTrendingCoins();
    expect(attempts).to.equal(3);
  });

  it('creates data directory and persists scan results', async () => {
    const trending = { coins: [{ item: { id: 'btc', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1, data: { price_change_percentage_24h: { usd: 5 }, total_volume: 10000000 }, score: 10 } }] };
    const listings = [{ id: 'eth', symbol: 'eth', name: 'Ethereum', market_cap_rank: 2, price_change_percentage_24h: 3, total_volume: 5000000, market_cap: 1000000000, ath_date: new Date().toISOString() }];
    const volatility = [{ id: 'doge', symbol: 'doge', name: 'Dogecoin', market_cap_rank: 10, price_change_percentage_24h: 15, total_volume: 7000000, current_price: 0.1 }];

    const stubFetch = async (url) => {
      if (url.includes('search/trending')) return mockResponse(trending);
      if (url.includes('order=market_cap_desc')) return mockResponse(listings);
      if (url.includes('order=volume_desc')) return mockResponse(volatility);
      throw new Error(`Unexpected URL ${url}`);
    };

    const tracker = new CoinTrackingSystem({
      dataPath: join(tmpDir, 'coin-tracking.json')
    });
    tracker.fetch = stubFetch;

    const result = await tracker.scan();

    expect(result.trending.length).to.be.greaterThan(0);
    expect(result.trending.length).to.be.at.most(10);
    expect(result.newListings.length).to.be.greaterThan(0);
    expect(result.highVolatility.length).to.be.greaterThan(0);
    expect(result.summary.trendingCount).to.equal(trending.coins.length);
    expect(existsSync(join(tmpDir, 'coin-tracking.json'))).to.be.true;
    const saved = JSON.parse(readFileSync(join(tmpDir, 'coin-tracking.json'), 'utf-8'));
    expect(saved.history).to.have.length(1);
  });
});
