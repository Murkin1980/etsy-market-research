import type http from 'http';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';

const CurrencyCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), 'Expected a three-letter currency code');

const CountryCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{2}$/.test(value), 'Expected a two-letter country code');

export const ResearchJobRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  pages: z.number().int().min(1).max(10).default(2),
  maxListings: z.number().int().min(1).max(500).default(80),
  currency: CurrencyCodeSchema.default('USD'),
  country: CountryCodeSchema.default('US'),
  language: z.string().trim().min(2).max(35).default('en-US'),
  useLlm: z.boolean().default(false),
  llmProvider: z.enum(['anthropic', 'openai']).default('openai'),
  llmModel: z.string().trim().max(100).default(''),
}).strict();

export type ResearchJobRequest = z.infer<typeof ResearchJobRequestSchema>;

export const EtsyApiSettingsSchema = z.object({
  keystring: z.string().trim().min(8).max(128).regex(/^[^:\s]+$/),
  sharedSecret: z.string().trim().min(8).max(128).regex(/^[^:\s]+$/),
}).strict();

export type EtsyApiSettings = z.infer<typeof EtsyApiSettingsSchema>;

export const AiAnalysisRequestSchema = z.object({
  force: z.boolean().default(false),
}).strict();

export type AiAnalysisRequest = z.infer<typeof AiAnalysisRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
}).strict();

export const RegisterRequestSchema = LoginRequestSchema.extend({
  name: z.string().trim().min(2).max(80),
  inviteCode: z.string().trim().min(20).max(100),
}).strict();

export const InviteRequestSchema = z.object({
  role: z.enum(['admin', 'member']).default('member'),
}).strict();

export const PlanChangeRequestSchema = z.object({
  planId: z.enum(['trial', 'pro', 'studio']),
}).strict();

export const CheckoutRequestSchema = z.object({
  planId: z.enum(['pro', 'studio']),
}).strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type InviteRequest = z.infer<typeof InviteRequestSchema>;
export type PlanChangeRequest = z.infer<typeof PlanChangeRequestSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export interface RunResultPayload {
  status: 'completed' | 'failed';
  query: string;
  runDir: string;
  totalFound: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  blockedCount: number;
  averagePriceUsd: number | null;
  medianPriceUsd: number | null;
  durationMs: number;
  error?: string;
}

const RunResultSchema = z.object({
  status: z.enum(['completed', 'failed']),
  query: z.string(),
  runDir: z.string(),
  totalFound: z.number(),
  successCount: z.number(),
  partialCount: z.number(),
  failedCount: z.number(),
  blockedCount: z.number(),
  averagePriceUsd: z.number().nullable(),
  medianPriceUsd: z.number().nullable(),
  durationMs: z.number(),
  error: z.string().optional(),
});

export class RequestBodyError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 413,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

export function parseResearchJobRequest(input: unknown): ResearchJobRequest {
  const parsed = ResearchJobRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new RequestBodyError('Invalid research job request', 400, parsed.error.flatten());
  }
  return parsed.data;
}

export function parseEtsyApiSettings(input: unknown): EtsyApiSettings {
  const parsed = EtsyApiSettingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new RequestBodyError('Invalid Etsy API settings', 400, parsed.error.flatten());
  }
  return parsed.data;
}

export function parseAiAnalysisRequest(input: unknown): AiAnalysisRequest {
  const parsed = AiAnalysisRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new RequestBodyError('Invalid AI analysis request', 400, parsed.error.flatten());
  }
  return parsed.data;
}

export function parseLoginRequest(input: unknown): LoginRequest {
  const parsed = LoginRequestSchema.safeParse(input);
  if (!parsed.success) throw new RequestBodyError('Invalid login request', 400, parsed.error.flatten());
  return parsed.data;
}

export function parseRegisterRequest(input: unknown): RegisterRequest {
  const parsed = RegisterRequestSchema.safeParse(input);
  if (!parsed.success) throw new RequestBodyError('Invalid registration request', 400, parsed.error.flatten());
  return parsed.data;
}

export function parseInviteRequest(input: unknown): InviteRequest {
  const parsed = InviteRequestSchema.safeParse(input);
  if (!parsed.success) throw new RequestBodyError('Invalid invitation request', 400, parsed.error.flatten());
  return parsed.data;
}

export function parsePlanChangeRequest(input: unknown): PlanChangeRequest {
  const parsed = PlanChangeRequestSchema.safeParse(input);
  if (!parsed.success) throw new RequestBodyError('Invalid plan change request', 400, parsed.error.flatten());
  return parsed.data;
}

export function parseCheckoutRequest(input: unknown): CheckoutRequest {
  const parsed = CheckoutRequestSchema.safeParse(input);
  if (!parsed.success) throw new RequestBodyError('Invalid checkout request', 400, parsed.error.flatten());
  return parsed.data;
}

export function readRawBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        fail(new RequestBodyError(`Request body exceeds ${maxBytes} bytes`, 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', fail);
  });
}

export function parseJsonBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        fail(new RequestBodyError(`Request body exceeds ${maxBytes} bytes`, 413));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(text));
      } catch {
        reject(new RequestBodyError('Invalid JSON request body', 400));
      }
    });

    req.on('error', fail);
  });
}

export function secretsEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getClientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = firstForwarded?.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function buildCliParams(jobId: string, request: ResearchJobRequest): string[] {
  const params = [
    'dist/cli.js',
    '--query', request.query,
    '--pages', String(request.pages),
    '--max-listings', String(request.maxListings),
    '--currency', request.currency,
    '--country', request.country,
    '--language', request.language,
    '--run-id', jobId,
  ];

  if (request.useLlm) {
    params.push('--use-llm', '--llm-provider', request.llmProvider);
    if (request.llmModel) params.push('--llm-model', request.llmModel);
  }

  return params;
}

export function parseRunResultOutput(stdout: string): RunResultPayload | null {
  try {
    const document = RunResultSchema.safeParse(JSON.parse(stdout.trim()));
    if (document.success) return document.data;
  } catch {
    // Fall back to CLI output where the final JSON object is written on one line.
  }

  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const result = RunResultSchema.safeParse(JSON.parse(line));
      if (result.success) return result.data;
    } catch {
      // Ignore non-JSON log lines.
    }
  }
  return null;
}
