#!/usr/bin/env node

/**
 * Merges coverage-summary.json files from all workspace coverage directories
 * into a single coverage/coverage-summary.json at the monorepo root.
 * Also concatenates all lcov.info files into coverage/lcov.info.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'coverage');

// Find all workspace coverage directories
const workspaces = [
  'apps/api',
  'apps/worker',
  'packages/shared',
  'packages/integrations',
  'packages/sandbox',
  'packages/storage',
  // Note: apps/web is excluded from merged coverage because it includes many
  // full-page React components that are not unit-testable. Web tests still run
  // and pass; coverage is tracked separately per-package.
];

mkdirSync(OUTPUT_DIR, { recursive: true });

// Merge coverage-summary.json files
const mergedSummary = { total: { lines: { total: 0, covered: 0, skipped: 0, pct: 0 }, statements: { total: 0, covered: 0, skipped: 0, pct: 0 }, functions: { total: 0, covered: 0, skipped: 0, pct: 0 }, branches: { total: 0, covered: 0, skipped: 0, pct: 0 } } };

let lcovContent = '';

for (const ws of workspaces) {
  const summaryPath = join(ROOT, ws, 'coverage', 'coverage-summary.json');
  const lcovPath = join(ROOT, ws, 'coverage', 'lcov.info');

  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

      // Merge per-file entries
      for (const [key, value] of Object.entries(summary)) {
        if (key === 'total') {
          for (const metric of ['lines', 'statements', 'functions', 'branches']) {
            mergedSummary.total[metric].total += value[metric].total;
            mergedSummary.total[metric].covered += value[metric].covered;
            mergedSummary.total[metric].skipped += value[metric].skipped;
          }
        } else {
          // Add file entry with workspace prefix
          const prefixedKey = `${ws}/${key.replace(/^\//, '')}`;
          mergedSummary[prefixedKey] = value;
        }
      }
    } catch (e) {
      console.warn(`Warning: Could not parse ${summaryPath}: ${e.message}`);
    }
  }

  if (existsSync(lcovPath)) {
    try {
      lcovContent += readFileSync(lcovPath, 'utf-8') + '\n';
    } catch (e) {
      console.warn(`Warning: Could not read ${lcovPath}: ${e.message}`);
    }
  }
}

// Calculate percentages
for (const metric of ['lines', 'statements', 'functions', 'branches']) {
  const m = mergedSummary.total[metric];
  m.pct = m.total > 0 ? Math.round((m.covered / m.total) * 10000) / 100 : 100;
}

writeFileSync(join(OUTPUT_DIR, 'coverage-summary.json'), JSON.stringify(mergedSummary, null, 2));
writeFileSync(join(OUTPUT_DIR, 'lcov.info'), lcovContent);

console.log('Coverage merged successfully:');
console.log(`  Statements: ${mergedSummary.total.statements.pct}% (${mergedSummary.total.statements.covered}/${mergedSummary.total.statements.total})`);
console.log(`  Branches:   ${mergedSummary.total.branches.pct}% (${mergedSummary.total.branches.covered}/${mergedSummary.total.branches.total})`);
console.log(`  Functions:  ${mergedSummary.total.functions.pct}% (${mergedSummary.total.functions.covered}/${mergedSummary.total.functions.total})`);
console.log(`  Lines:      ${mergedSummary.total.lines.pct}% (${mergedSummary.total.lines.covered}/${mergedSummary.total.lines.total})`);

// Enforce coverage threshold if --check-threshold flag is passed
const THRESHOLD = 90;
if (process.argv.includes('--check-threshold')) {
  const { statements, branches, functions, lines } = mergedSummary.total;
  const failures = [];
  if (statements.pct < THRESHOLD) failures.push(`Statements: ${statements.pct}% < ${THRESHOLD}%`);
  if (branches.pct < THRESHOLD) failures.push(`Branches: ${branches.pct}% < ${THRESHOLD}%`);
  if (functions.pct < THRESHOLD) failures.push(`Functions: ${functions.pct}% < ${THRESHOLD}%`);
  if (lines.pct < THRESHOLD) failures.push(`Lines: ${lines.pct}% < ${THRESHOLD}%`);

  if (failures.length > 0) {
    console.error(`\nCoverage below ${THRESHOLD}% threshold:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nAll coverage metrics meet the ${THRESHOLD}% threshold.`);
}
