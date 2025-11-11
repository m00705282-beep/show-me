#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = 'main',
  WINDSURF_KB_DIR
} = process.env;

const WORKFLOW_FILE = '.github/workflows/test-and-coverage.yml';
const WORKFLOW_NAME = 'Test & Coverage';

const SOURCE_DIRECTORIES = [
  'ai',
  'analytics',
  'middleware',
  'monitoring',
  'optimization',
  'scripts',
  'security',
  'storage',
  'trading',
  'config',
  'server',
  'dashboard-app/src',
  'public'
];

const SOURCE_FILES = [
  'server.js',
  'server.js.backup',
  'Dockerfile',
  'package.json',
  'package-lock.json'
];

if (!GITHUB_TOKEN) {
  console.error('[coverage-runner] Missing GITHUB_TOKEN environment variable.');
  process.exit(1);
}

if (!GITHUB_OWNER || !GITHUB_REPO) {
  console.error('[coverage-runner] Set GITHUB_OWNER and GITHUB_REPO environment variables.');
  process.exit(1);
}

(async () => {
  try {
    await ensureWorkflowCommitted();
    await ensureProjectAssetsCommitted();
    const refSha = await getLatestCommitSha();
    const run = await dispatchWorkflow(refSha);
    await waitForRunCompletion(run.id);
    await downloadArtifacts(run.id);
    console.log(`[coverage-runner] Completed coverage sync for run #${run.run_number} (id: ${run.id}).`);
  } catch (err) {
    console.error('[coverage-runner] Failed:', err.message);
    process.exitCode = 1;
  }
})();

async function ensureWorkflowCommitted() {
  await ensureRepoFile(WORKFLOW_FILE, 'Automated: ensure Test & Coverage workflow present');
}

async function ensureProjectAssetsCommitted() {
  for (const file of SOURCE_FILES) {
    await ensureRepoFile(file, `Automated: sync ${file} for coverage workflow`);
  }

  for (const dir of SOURCE_DIRECTORIES) {
    await ensureDirectoryCommitted(dir);
  }

  await ensureTestsCommitted();
}

async function ensureTestsCommitted() {
  try {
    const testFiles = await collectFiles('tests');
    if (testFiles.length === 0) {
      console.warn('[coverage-runner] ⚠️ No local test files found under tests/. Workflow run may fail.');
      return;
    }

    for (const relativePath of testFiles) {
      if (relativePath.endsWith('.js')) {
        await ensureRepoFile(relativePath, `Automated: sync ${relativePath}`);
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('[coverage-runner] ⚠️ Local tests/ directory not found. Workflow run may fail.');
    } else {
      throw err;
    }
  }
}

async function dispatchWorkflow(refValue) {
  const workflowId = encodeURIComponent('test-and-coverage.yml');
  const dispatchResponse = await githubFetch('POST', `/actions/workflows/${workflowId}/dispatches`, {
    ref: refValue || GITHUB_BRANCH
  });

  if (dispatchResponse.status !== 204) {
    const text = await dispatchResponse.text();
    throw new Error(`Failed to dispatch workflow: ${dispatchResponse.status} ${text}`);
  }

  console.log('[coverage-runner] Workflow dispatch triggered. Waiting for run to start...');

  const startTime = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  const pollIntervalMs = 5000;

  while (Date.now() - startTime < timeoutMs) {
    const runsResponse = await githubFetch('GET', `/actions/workflows/${workflowId}/runs?per_page=5&branch=${encodeURIComponent(GITHUB_BRANCH)}`);
    if (!runsResponse.ok) {
      const text = await runsResponse.text();
      throw new Error(`Failed to list workflow runs: ${runsResponse.status} ${text}`);
    }
    const data = await runsResponse.json();
    if (Array.isArray(data.workflow_runs)) {
      const recent = data.workflow_runs.find(run => {
        const created = new Date(run.created_at).getTime();
        return created >= startTime - 5000;
      });
      if (recent) {
        console.log(`[coverage-runner] Run #${recent.run_number} started (id: ${recent.id}).`);
        return recent;
      }
    }
    await delay(pollIntervalMs);
  }

  throw new Error('Timed out waiting for workflow run to start.');
}

async function waitForRunCompletion(runId) {
  console.log('[coverage-runner] Waiting for workflow run to complete...');
  const timeoutMs = 10 * 60 * 1000;
  const pollIntervalMs = 10000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await githubFetch('GET', `/actions/runs/${runId}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch run status: ${response.status} ${text}`);
    }
    const run = await response.json();
    if (run && run.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`Workflow run concluded with status: ${run.conclusion || 'unknown'}`);
      }
      console.log('[coverage-runner] Workflow run completed successfully.');
      return;
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Workflow run did not complete within ${timeoutMs / 60000} minutes.`);
}

async function downloadArtifacts(runId) {
  console.log('[coverage-runner] Downloading coverage artifacts...');
  await new Promise((resolve, reject) => {
    const args = ['scripts/downloadCoverageArtifact.js', '--workflow', WORKFLOW_NAME, '--run', String(runId)];
    if (WINDSURF_KB_DIR) {
      args.push('--kb', WINDSURF_KB_DIR);
    }
    const proc = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`downloadCoverageArtifact.js exited with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getLatestCommitSha() {
  const response = await githubFetch('GET', `/git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch branch head: ${response.status} ${text}`);
  }
  const data = await response.json();
  const sha = data?.object?.sha;
  if (!sha) {
    throw new Error('Branch head SHA unavailable.');
  }
  console.log(`[coverage-runner] Using commit ${sha.slice(0, 7)} for workflow dispatch.`);
  return sha;
}

async function ensureRepoFile(relativePath, commitMessage) {
  const absolutePath = join(projectRoot, relativePath);
  let content;
  try {
    content = await readFile(absolutePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[coverage-runner] ⚠️ Local file missing (${relativePath}); skipping sync.`);
      return;
    }
    throw err;
  }

  const contentBase64 = Buffer.from(content).toString('base64');
  const remotePath = relativePath.replace(/\\/g, '/');
  const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');

  const getResponse = await githubFetch('GET', `/contents/${encodedPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);
  let sha = null;

  if (getResponse.status === 200) {
    const data = await getResponse.json();
    if (data.encoding === 'base64' && data.content) {
      const remoteContent = Buffer.from(data.content, 'base64').toString('utf8');
      if (remoteContent === content.toString('utf8')) {
        return;
      }
    }
    sha = data.sha;
  } else if (getResponse.status !== 404) {
    const text = await getResponse.text();
    throw new Error(`Unable to inspect remote file ${relativePath}: ${getResponse.status} ${text}`);
  }

  const putBody = {
    message: commitMessage,
    content: contentBase64,
    branch: GITHUB_BRANCH,
    committer: {
      name: 'Cascade Automation Bot',
      email: 'noreply@example.com'
    }
  };

  if (sha) {
    putBody.sha = sha;
  }

  const putResponse = await githubFetch('PUT', `/contents/${encodedPath}`, putBody);
  if (!putResponse.ok) {
    const text = await putResponse.text();
    throw new Error(`Failed to upload ${relativePath}: ${putResponse.status} ${text}`);
  }

  console.log(`[coverage-runner] Synced ${relativePath} to GitHub.`);
}

async function ensureDirectoryCommitted(relativeDir, extensions = ['.js', '.json', '.mjs', '.cjs', '.yml', '.yaml', '.html', '.css']) {
  try {
    const files = await collectFiles(relativeDir);
    if (files.length === 0) {
      console.warn(`[coverage-runner] ⚠️ Directory ${relativeDir} is empty. Skipping.`);
      return;
    }

    for (const relativePath of files) {
      if (extensions.some(ext => relativePath.toLowerCase().endsWith(ext))) {
        await ensureRepoFile(relativePath, `Automated: sync ${relativePath}`);
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[coverage-runner] ⚠️ Local directory missing (${relativeDir}); skipping.`);
      return;
    }
    throw err;
  }
}

async function collectFiles(relativeDir) {
  const absoluteDir = join(projectRoot, relativeDir);
  const dirEntries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of dirEntries) {
    const childRelative = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(childRelative);
      files.push(...nested);
    } else if (entry.isFile()) {
      files.push(childRelative.replace(/\\/g, '/'));
    }
  }

  return files;
}

function githubFetch(method, path, body) {
  const base = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'coverage-runner',
      Accept: 'application/vnd.github+json'
    }
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
    options.body = JSON.stringify(body);
  }

  return fetch(base + path, options);
}
