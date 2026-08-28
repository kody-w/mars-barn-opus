#!/usr/bin/env node
/**
 * Static Data Covenant harvester for docs/os.html's in-page GitHub renderer.
 *
 * The virtual browser inside the vOS desktop used to call api.github.com
 * directly from the visitor's browser, unauthenticated, for whatever
 * github.com/owner/repo URL was navigated to (RAR CONSTITUTION.md Article
 * XXIV violation). Since a static snapshot cannot pre-harvest "every repo a
 * visitor might type," the page now serves a small curated allowlist
 * (GITHUB_SNAPSHOT_REPOS in docs/os.html) from committed JSON and falls back
 * to the existing "Page Unavailable" message for anything else.
 *
 * This script re-harvests that allowlist into docs/data/github-repos/.
 * Fields are trimmed to just what the page renders (full_name, description,
 * stargazers_count, forks_count, size, language) rather than mirroring the
 * full API response, because the full authenticated response GitHub returns
 * to a token-bearing harvester includes account-scoped fields (permissions,
 * security settings) that must never be published to a public snapshot.
 *
 * Usage:
 *   node docs/scripts/harvest-github-repo-snapshot.mjs [owner/repo ...]
 *
 * Defaults to the allowlist below (keep in sync with GITHUB_SNAPSHOT_REPOS
 * in docs/os.html). Set GH_TOKEN (or GITHUB_TOKEN) for a higher rate limit;
 * unauthenticated works too.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data', 'github-repos');

const DEFAULT_REPOS = ['kody-w/mars-barn-opus'];
const repos = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_REPOS;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

async function ghFetch(url, accept) {
  const headers = { Accept: accept || 'application/vnd.github+json', 'User-Agent': 'mars-barn-opus-covenant-harvester' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${url}`);
  }
  return response;
}

async function main() {
  mkdirSync(dataDir, { recursive: true });

  for (const repoSlug of repos) {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) {
      console.error(`[harvest] skipping malformed repo '${repoSlug}'`);
      continue;
    }
    const data = await (await ghFetch(`https://api.github.com/repos/${owner}/${repo}`)).json();
    const trimmed = {
      full_name: data.full_name,
      description: data.description,
      stargazers_count: data.stargazers_count,
      forks_count: data.forks_count,
      size: data.size,
      language: data.language,
    };
    const base = path.join(dataDir, `${owner}__${repo}`);
    writeFileSync(`${base}.json`, JSON.stringify(trimmed, null, 2) + '\n');

    let readme = '';
    try {
      readme = await (await ghFetch(`https://api.github.com/repos/${owner}/${repo}/readme`, 'application/vnd.github.raw')).text();
    } catch (error) {
      console.error(`[harvest] no README for ${repoSlug}: ${error.message}`);
    }
    writeFileSync(`${base}.readme.md`, readme);

    console.log(`[harvest] wrote snapshot for ${repoSlug}`);
  }
}

main().catch((error) => {
  console.error(`[harvest] ERROR: ${error.message}`);
  process.exit(1);
});
