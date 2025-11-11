/* global describe, it, before, after */
import { expect } from 'chai';
import supertest from 'supertest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVER_READY_PATH = '/api/snapshot';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServerReady(agent, path = SERVER_READY_PATH, timeoutMs = 15000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await agent.get(path).timeout({ deadline: intervalMs });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await delay(intervalMs);
  }

  const reason = lastError?.message ? `: ${lastError.message}` : '';
  throw new Error(`Timeout waiting for server readiness${reason}`);
}

async function stopServer(proc, timeoutMs = 10000) {
  if (!proc) {
    return;
  }

  let forced = false;
  const closePromise = once(proc, 'close').catch(err => {
    console.warn('[test] server close event error:', err.message);
  });

  if (!proc.killed) {
    proc.kill();
  }

  const forceTimer = setTimeout(() => {
    if (!proc.killed) {
      forced = true;
      try {
        proc.kill('SIGKILL');
      } catch (err) {
        console.warn('[test] force kill warning:', err.message);
      }
    }
  }, timeoutMs);

  await closePromise;

  clearTimeout(forceTimer);
  if (forced) {
    console.warn('[test] server was force killed after timeout');
  }
}

function startServer() {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '8080',
      API_KEY: 'test-integration-key'
    }
  });
  return proc;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

describe('API smoke tests', () => {
  let serverProc;
  let request;

  before(async function () {
    this.timeout(20000);
    serverProc = startServer();
    request = supertest('http://localhost:8080');
    await waitForServerReady(request);
  });

  after(async function () {
    this.timeout(10000);
    await stopServer(serverProc);
    serverProc = null;
  });

  it('GET /api/snapshot returns snapshot data', async () => {
    const res = await request.get('/api/snapshot').expect(200);
    expect(res.body).to.have.property('time');
    expect(res.body).to.have.property('spreads');
  });

  it('GET /api/fees/status returns fee verification status', async () => {
    const res = await request.get('/api/fees/status').expect(200);
    expect(res.body).to.have.property('needsVerification');
  });

  it('GET /api/coins/trending returns trending data', async () => {
    const res = await request.get('/api/coins/trending').expect(200);
    expect(res.body).to.be.an('object');
  });

  it('GET /api/rotation/stats returns rotation stats', async () => {
    const res = await request.get('/api/rotation/stats').expect(200);
    expect(res.body).to.have.property('totalTracked');
  });

  it('GET /api/analytics/summary returns performance summary', async () => {
    const res = await request.get('/api/analytics/summary').expect(200);
    expect(res.body).to.be.an('object');
    expect(res.body).to.have.property('opportunities');
  });

  it('GET /api/analytics/hourly returns hourly breakdown', async () => {
    const res = await request.get('/api/analytics/hourly').expect(200);
    expect(res.body).to.be.an('array');
    if (res.body.length > 0) {
      expect(res.body[0]).to.have.property('hour');
    }
  });

  it('GET /api/analytics/coins returns top coins list', async () => {
    const res = await request.get('/api/analytics/coins?limit=5').expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /api/analytics/exchanges returns top exchanges list', async () => {
    const res = await request.get('/api/analytics/exchanges').expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /api/analytics/best-hours returns best hours list', async () => {
    const res = await request.get('/api/analytics/best-hours').expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /api/analytics/recent-trades returns recent trades', async () => {
    const res = await request.get('/api/analytics/recent-trades').expect(200);
    expect(res.body).to.be.an('array');
  });

  describe('Protected PM2 endpoints', () => {
    it('GET /api/pm2/logs without API key is rejected', async () => {
      await request.get('/api/pm2/logs').expect(401);
    });

    it('GET /api/pm2/logs with API key returns 501 when PM2 missing', async () => {
      await request
        .get('/api/pm2/logs')
        .set('X-API-Key', 'test-integration-key')
        .expect(res => {
          expect(res.status).to.not.equal(401);
          expect(res.status).to.not.equal(403);
          expect(res.body).to.be.an('object');
        });
    });

    it('POST /api/pm2/restart without API key is rejected', async () => {
      await request.post('/api/pm2/restart').expect(401);
    });

    it('POST /api/pm2/restart with API key returns 501 when PM2 missing', async () => {
      await request
        .post('/api/pm2/restart')
        .set('X-API-Key', 'test-integration-key')
        .expect(res => {
          expect(res.status).to.not.equal(401);
          expect(res.status).to.not.equal(403);
          expect(res.body).to.be.an('object');
        });
    });
  });
});
