import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getRunAiAnalysis, loadRunListings, RunReportError } from '../src/analysis/run-report-analyzer.js';
import { summarizeReport } from '../src/analysis/report-summary.js';
import { createMockListing } from './helpers/listing-fixture.js';

const temporaryDirectories: string[] = [];

function createRun(listingCount = 2): { runsDir: string; runId: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-ai-report-'));
  temporaryDirectories.push(root);
  const runsDir = path.join(root, 'runs');
  const runId = 'run-123';
  const reportsDir = path.join(runsDir, runId, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const listings = Array.from({ length: listingCount }, (_, index) => createMockListing({
    listingId: String(index + 1),
    url: `https://www.etsy.com/listing/${index + 1}`,
    canonicalUrl: `https://www.etsy.com/listing/${index + 1}`,
    title: index === 0 ? 'Small Business CRM Client Tracker' : 'Freelancer Finance Dashboard',
    shopName: `Shop${index + 1}`,
    price: {
      ...createMockListing().price,
      amount: index === 0 ? 10 : 30,
      amountUsd: index === 0 ? 10 : 30,
    },
    salesEstimate: {
      ...createMockListing().salesEstimate,
      confidence: index === 0 ? 0.8 : 0.2,
      listingEvidenceScore: index === 0 ? 2 : 0,
    },
  }));
  fs.writeFileSync(path.join(reportsDir, 'listings-full.json'), JSON.stringify(listings));
  return { runsDir, runId };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('deterministic report summary', () => {
  it('calculates prices and signal coverage before calling an LLM', () => {
    const listings = [
      createMockListing({
        title: 'Small Business CRM Client Tracker',
        shopName: 'One',
        price: { ...createMockListing().price, amountUsd: 10 },
        salesEstimate: { ...createMockListing().salesEstimate, confidence: 0.8, listingEvidenceScore: 2 },
      }),
      createMockListing({
        listingId: '456',
        title: 'Freelancer Finance Dashboard',
        shopName: 'Two',
        price: { ...createMockListing().price, amountUsd: 30 },
        salesEstimate: { ...createMockListing().salesEstimate, confidence: 0.2 },
      }),
    ];

    const summary = summarizeReport(listings);
    expect(summary.listingCount).toBe(2);
    expect(summary.uniqueShops).toBe(2);
    expect(summary.pricesUsd).toMatchObject({ average: 20, median: 20 });
    expect(summary.signalCoverage).toMatchObject({ listingEvidencePercent: 50, averageConfidence: 0.5 });
    expect(summary.topTerms.map((item) => item.term)).toContain('business');
  });
});

describe('completed run AI analysis access', () => {
  it('loads validated listings and returns a missing analysis state', () => {
    const { runsDir, runId } = createRun();
    expect(loadRunListings(runsDir, runId)).toHaveLength(2);
    expect(getRunAiAnalysis(runsDir, runId, true, 'test-model')).toMatchObject({
      runId,
      status: 'missing',
      configured: true,
      model: 'test-model',
      analysis: null,
    });
  });

  it('rejects traversal and reports without listing data', () => {
    const { runsDir } = createRun();
    expect(() => loadRunListings(runsDir, '../secret')).toThrow(RunReportError);
    fs.mkdirSync(path.join(runsDir, 'empty-run'), { recursive: true });
    expect(() => loadRunListings(runsDir, 'empty-run')).toThrow(/no completed listings report/);
  });
});
