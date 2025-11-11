#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import fs from 'node:fs/promises';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  WINDSURF_KB_DIR
} = process.env;

if (!GITHUB_TOKEN) {
  console.error('[coverage-sync] Missing GITHUB_TOKEN environment variable.');
  process.exit(1);
}

if (!GITHUB_OWNER || !GITHUB_REPO) {
  console.error('[coverage-sync] Set GITHUB_OWNER and GITHUB_REPO environment variables (e.g., owner and repo name).');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const workflowName = args.workflow ?? 'Test & Coverage';
const runId = args.run;
const kbRoot = resolveKbDir(args.kb, WINDSURF_KB_DIR);

(async () => {
  try {
    const workflow = await resolveWorkflow(workflowName);
    const run = await resolveRun(workflow.id, runId);
    const artifact = await fetchCoverageArtifact(run.id);

    const runIdentifier = buildRunIdentifier(run);
    const coverageDir = join(kbRoot, 'coverage', runIdentifier);
    await fs.mkdir(coverageDir, { recursive: true });

    const zipPath = join(coverageDir, 'coverage-report.zip');
    await downloadArtifact(artifact.archive_download_url, zipPath);
    await extractZip(zipPath, coverageDir);
    await fs.unlink(zipPath);

    const summary = await readCoverageSummary(coverageDir);
    await appendPhaseReport(kbRoot, run, runIdentifier, summary);

    console.log(`[coverage-sync] Synced run ${run.id} (#${run.run_number}) to ${coverageDir}`);
  } catch (err) {
    console.error('[coverage-sync] Failed:', err.message);
    process.exitCode = 1;
  }
})();

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      console.error(`[coverage-sync] Missing value for argument --${key}`);
      process.exit(1);
    }
    result[key] = value;
    i++;
  }
  return result;
}

function resolveKbDir(cliValue, envValue) {
  if (cliValue) {
    return resolve(cliValue);
  }
  if (envValue) {
    return resolve(envValue);
  }
  const home = process.env.USERPROFILE || process.env.HOME || projectRoot;
  return join(home, 'Documents', 'Windsurf_KB');
}

async function resolveWorkflow(name) {
  const response = await githubFetch(`/actions/workflows`, { per_page: 100 });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to list workflows: ${response.status} ${text}`);
  }
  const data = await response.json();
  const workflow = data.workflows.find(w => w.name === name);
  if (!workflow) {
    throw new Error(`Workflow "${name}" not found. Available: ${data.workflows.map(w => w.name).join(', ')}`);
  }
  return workflow;
}

async function resolveRun(workflowId, explicitRunId) {
  if (explicitRunId) {
    const response = await githubFetch(`/actions/runs/${explicitRunId}`);
    if (response.status === 404) {
      throw new Error(`Run ${explicitRunId} not found.`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Unable to fetch run ${explicitRunId}: ${response.status} ${text}`);
    }
    return await response.json();
  }

  const response = await githubFetch(`/actions/workflows/${workflowId}/runs`, { per_page: 1, status: 'success', branch: 'main' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to list workflow runs: ${response.status} ${text}`);
  }
  const data = await response.json();
  if (!data.workflow_runs || data.workflow_runs.length === 0) {
    throw new Error(`No successful runs found for workflow.`);
  }
  return data.workflow_runs[0];
}

async function fetchCoverageArtifact(runId) {
  const response = await githubFetch(`/actions/runs/${runId}/artifacts`, { per_page: 100 });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to list artifacts for run ${runId}: ${response.status} ${text}`);
  }
  const data = await response.json();
  const artifact = data.artifacts.find(a => a.name === 'coverage-report');
  if (!artifact) {
    throw new Error(`Artifact "coverage-report" not found in run ${runId}.`);
  }
  return artifact;
}

async function downloadArtifact(downloadUrl, destination) {
  const response = await fetch(downloadUrl, {
    headers: githubHeaders({ Accept: 'application/vnd.github+json' }),
    redirect: 'follow'
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download artifact: ${response.status} ${text}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function extractZip(zipPath, targetDir) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
}

async function readCoverageSummary(coverageDir) {
  const summaryPath = await findFile(coverageDir, 'coverage-summary.json');
  if (!summaryPath) {
    throw new Error('coverage-summary.json not found inside coverage artifact.');
  }
  const content = await fs.readFile(summaryPath, 'utf8');
  return JSON.parse(content);
}

async function appendPhaseReport(kbRoot, run, runIdentifier, summary) {
  const phaseReport = join(kbRoot, 'phase-reports', 'phase2.md');
  await fs.mkdir(dirname(phaseReport), { recursive: true });
  let existing = '';
  try {
    existing = await fs.readFile(phaseReport, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const signature = `CI Coverage – Run #${run.run_number}`;
  if (existing.includes(signature)) {
    console.log(`[coverage-sync] Phase 2 report already contains entry for run #${run.run_number}; skipping append.`);
    return;
  }

  const totals = summary?.total ?? {};
  const fmt = entry => entry && typeof entry.pct === 'number' ? `${entry.pct.toFixed(2)} %` : 'n/a';

  const lines = [
    '',
    `### CI Coverage – Run #${run.run_number} (${run.head_branch ?? 'unknown'} @ ${run.head_sha?.slice(0, 7) ?? 'n/a'})`,
    `- Date: ${run.run_started_at ?? run.created_at ?? new Date().toISOString()}`,
    `- Link: ${run.html_url}`,
    `- Statements: ${fmt(totals.statements)}`,
    `- Branches: ${fmt(totals.branches)}`,
    `- Functions: ${fmt(totals.functions)}`,
    `- Lines: ${fmt(totals.lines)}`,
    `- Artifact: coverage/${runIdentifier}/`,
    ''
  ];

  const updated = existing ? `${existing.trimEnd()}\n${lines.join('\n')}` : lines.join('\n');
  await fs.writeFile(phaseReport, `${updated}\n`);
}

async function findFile(root, filename) {
  const stats = await fs.stat(root);
  if (stats.isFile()) {
    return root.endsWith(filename) ? root : null;
  }
  if (!stats.isDirectory()) {
    return null;
  }
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
    }
  }
  return null;
}

function buildRunIdentifier(run) {
  const shortSha = run.head_sha?.slice(0, 7) ?? 'unknown';
  const runNumber = run.run_number ?? run.id;
  return `${runNumber}-${shortSha}`;
}

function githubHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'coverage-sync-script',
    ...extra
  };
}

function githubFetch(path, query) {
  const search = query
    ? '?' + Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    : '';
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}${search}`;
  return fetch(url, { headers: githubHeaders() });
}
