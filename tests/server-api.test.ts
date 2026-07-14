import type http from 'http';
import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import {
  buildCliParams,
  getClientIp,
  parseEtsyApiSettings,
  parseJsonBody,
  parseResearchJobRequest,
  parseRunResultOutput,
  RequestBodyError,
  secretsEqual,
} from '../src/server-api.js';

describe('server API helpers', () => {
  it('validates and normalizes supported job options', () => {
    const request = parseResearchJobRequest({
      query: '  notion planner  ',
      pages: 3,
      maxListings: 120,
      currency: 'eur',
      country: 'de',
      language: 'de-DE',
      useLlm: true,
      llmProvider: 'anthropic',
    });

    expect(request).toMatchObject({
      query: 'notion planner',
      pages: 3,
      maxListings: 120,
      currency: 'EUR',
      country: 'DE',
      useLlm: true,
    });
  });

  it('rejects unknown fields and out-of-range values', () => {
    expect(() => parseResearchJobRequest({ query: 'x', pages: 0, admin: true })).toThrow(RequestBodyError);
  });

  it('validates Etsy API settings without accepting combined or spaced values', () => {
    expect(parseEtsyApiSettings({
      keystring: 'etsy-keystring-1234',
      sharedSecret: 'shared-secret-9876',
    })).toEqual({
      keystring: 'etsy-keystring-1234',
      sharedSecret: 'shared-secret-9876',
    });
    expect(() => parseEtsyApiSettings({
      keystring: 'key:secret',
      sharedSecret: 'shared-secret-9876',
    })).toThrow(RequestBodyError);
  });

  it('builds isolated CLI arguments from validated options', () => {
    const request = parseResearchJobRequest({ query: 'planner', pages: 4, maxListings: 25 });
    const params = buildCliParams('job-123', request);

    expect(params).toContain('--run-id');
    expect(params).toContain('job-123');
    expect(params.slice(params.indexOf('--pages'), params.indexOf('--pages') + 2)).toEqual(['--pages', '4']);
    expect(params.slice(params.indexOf('--max-listings'), params.indexOf('--max-listings') + 2)).toEqual(['--max-listings', '25']);
  });

  it('finds the structured result after ordinary log output', () => {
    const result = parseRunResultOutput([
      'scraper started',
      JSON.stringify({
        status: 'completed',
        query: 'planner',
        runDir: 'data/runs/job-123',
        totalFound: 4,
        successCount: 3,
        partialCount: 1,
        failedCount: 0,
        blockedCount: 0,
        averagePriceUsd: 10,
        medianPriceUsd: 9,
        durationMs: 1000,
      }),
    ].join('\n'));

    expect(result?.runDir).toBe('data/runs/job-123');
  });

  it('compares API keys without accepting different lengths or contents', () => {
    expect(secretsEqual('correct-key', 'correct-key')).toBe(true);
    expect(secretsEqual('wrong-key', 'correct-key')).toBe(false);
    expect(secretsEqual('short', 'longer-key')).toBe(false);
  });

  it('rejects request bodies above the configured byte limit', async () => {
    const request = Readable.from([Buffer.from('{"query":"too large"}')]) as http.IncomingMessage;
    await expect(parseJsonBody(request, 8)).rejects.toMatchObject({ statusCode: 413 });
  });

  it('ignores spoofed forwarding headers unless proxy trust is enabled', () => {
    const request = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      socket: { remoteAddress: '127.0.0.1' },
    } as http.IncomingMessage;

    expect(getClientIp(request, false)).toBe('127.0.0.1');
    expect(getClientIp(request, true)).toBe('203.0.113.10');
  });
});
