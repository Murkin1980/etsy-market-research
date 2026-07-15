import type http from 'http';
import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import {
  buildCliParams,
  getClientIp,
  parseEtsyApiSettings,
  parseAiAnalysisRequest,
  parseJsonBody,
  parseCheckoutRequest,
  parseLoginRequest,
  parseRegisterRequest,
  parsePlanChangeRequest,
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

  it('validates AI analysis regeneration options', () => {
    expect(parseAiAnalysisRequest({})).toEqual({ force: false });
    expect(parseAiAnalysisRequest({ force: true })).toEqual({ force: true });
    expect(() => parseAiAnalysisRequest({ force: 'yes' })).toThrow(RequestBodyError);
  });

  it('validates account login and invitation registration fields', () => {
    expect(parseLoginRequest({ email: 'owner@example.com', password: 'correct horse battery' })).toMatchObject({
      email: 'owner@example.com',
    });
    expect(() => parseLoginRequest({ email: 'bad', password: 'short' })).toThrow(RequestBodyError);
    expect(parseRegisterRequest({
      email: 'member@example.com',
      password: 'another strong password',
      name: 'Member',
      inviteCode: 'invite_12345678901234567890',
    })).toMatchObject({ name: 'Member' });
  });

  it('validates plan changes and paid checkout plans', () => {
    expect(parsePlanChangeRequest({ planId: 'trial' })).toEqual({ planId: 'trial' });
    expect(parseCheckoutRequest({ planId: 'pro' })).toEqual({ planId: 'pro' });
    expect(() => parseCheckoutRequest({ planId: 'trial' })).toThrow(RequestBodyError);
    expect(() => parsePlanChangeRequest({ planId: 'enterprise' })).toThrow(RequestBodyError);
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

  it('reads a pretty-printed run result stored as a JSON document', () => {
    const result = parseRunResultOutput(JSON.stringify({
      status: 'completed',
      query: 'notion template',
      runDir: 'data/runs/notion-template',
      totalFound: 100,
      successCount: 100,
      partialCount: 0,
      failedCount: 0,
      blockedCount: 0,
      averagePriceUsd: 29.5,
      medianPriceUsd: 25,
      durationMs: 36_000,
    }, null, 2));

    expect(result).toMatchObject({
      status: 'completed',
      query: 'notion template',
      totalFound: 100,
    });
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
