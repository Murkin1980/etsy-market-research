import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { LlmAnalysisResultSchema, type LlmAnalysisResult } from '../types/schemas.js';
import type { EtsyListing } from '../types/listing.js';
import { createChildLogger } from '../utils/logger.js';
import { summarizeReport } from './report-summary.js';

const log = createChildLogger('llm-analyzer');
const MAX_LISTINGS_IN_PROMPT = 150;

const SYSTEM_PROMPT = `You are a careful Etsy market research analyst.

Analyze only the structured evidence supplied by the application. Separate direct listing facts, deterministic system metrics, shop-level proxy signals, and your own inferences. Never present shop-wide sales or reviews as sales or reviews of an individual listing. Never invent demand, revenue, conversion, search volume, trends, or customer behavior that is absent from the data.

If listing ratings, listing reviews, badges, or direct demand evidence are missing, state that limitation prominently. Low-confidence data must lead to cautious recommendations. Return the complete answer in Russian and follow the supplied structured output schema.`;

export type LlmProvider = 'anthropic' | 'openai';

interface LlmAnalyzerOptions {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export function buildLlmPayload(listings: EtsyListing[]): Array<Record<string, unknown>> {
  return listings.slice(0, MAX_LISTINGS_IN_PROMPT).map((listing) => ({
    listingId: listing.listingId,
    title: listing.title,
    url: listing.url,
    shopName: listing.shopName,
    price: listing.price,
    listingSignals: {
      rating: listing.rating.listingRating,
      reviewCount: listing.rating.listingReviewCount,
    },
    badges: listing.badges,
    engagement: listing.engagement,
    content: {
      mainFeature: listing.content.mainFeature,
      features: listing.content.features,
      includedItems: listing.content.includedItems,
      fileFormats: listing.content.fileFormats,
      keywords: listing.content.extractedKeywords,
    },
    media: {
      imageCount: listing.media.imageCount,
      hasVideo: listing.media.hasVideo,
    },
    searchPosition: listing.searchPosition,
    evidence: listing.evidence,
    demandEstimate: {
      level: listing.salesEstimate.level,
      listingEvidenceScore: listing.salesEstimate.listingEvidenceScore,
      confidence: listing.salesEstimate.confidence,
      reasons: listing.salesEstimate.reasons,
    },
    shopProxy: {
      score: listing.salesEstimate.shopProxyScore,
      reasons: listing.salesEstimate.shopProxyReasons,
      shopSales: listing.rating.shopSales,
      shopRating: listing.rating.shopRating,
      shopReviewCount: listing.rating.shopReviewCount,
    },
  }));
}

export function buildUserPrompt(listings: EtsyListing[]): string {
  const reportSummary = summarizeReport(listings);
  const payload = buildLlmPayload(listings);
  return `Проанализируй готовый отчёт исследования Etsy и подготовь практическое решение для автора цифрового продукта.

Обязательные задачи:
1. Дай честный обзор рынка и явно укажи ограничения качества данных.
2. Выбери до трёх наиболее доказательных объявлений, не подменяя показатели листинга показателями магазина.
3. Выдели повторяющиеся функции, позиционирование и пробелы рынка.
4. Предложи концепцию нового продукта, целевую аудиторию, диапазон цены, комплектацию, бонусы, план изображений и описания.
5. В рисках укажи, какие дополнительные поисковые запросы или данные нужны перед запуском продукта.

Детерминированная сводка, рассчитанная приложением:
${JSON.stringify(reportSummary, null, 2)}

Объявления для качественного анализа (${payload.length} из ${listings.length}):
${JSON.stringify(payload, null, 2)}`;
}

function sanitizeAnalysisLinks(
  analysis: LlmAnalysisResult,
  listings: EtsyListing[],
): LlmAnalysisResult {
  const urlsByListingId = new Map(
    listings
      .filter((listing): listing is EtsyListing & { listingId: string } => Boolean(listing.listingId))
      .map((listing) => [listing.listingId, listing.url]),
  );
  return {
    ...analysis,
    topProducts: analysis.topProducts.flatMap((product) => {
      const sourceUrl = urlsByListingId.get(product.listingId);
      return sourceUrl ? [{ ...product, url: sourceUrl }] : [];
    }),
  };
}

function extractJsonFromResponse(rawText: string): string {
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ?? rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[1] ?? jsonMatch[0];
  return rawText;
}

function parseAnthropicResponse(rawText: string): LlmAnalysisResult {
  const result = LlmAnalysisResultSchema.safeParse(JSON.parse(extractJsonFromResponse(rawText)));
  if (!result.success) {
    log.warn({ errors: result.error.errors }, 'Anthropic response failed Zod validation');
    throw new Error('Invalid structured response from Anthropic');
  }
  return result.data;
}

export class LlmAnalyzer {
  private readonly provider: LlmProvider;
  private readonly anthropicClient?: Anthropic;
  private readonly openaiClient?: OpenAI;
  private readonly model: string;

  constructor(options: LlmAnalyzerOptions) {
    this.provider = options.provider;
    if (this.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 120_000 });
      this.model = options.model ?? 'claude-sonnet-4-20250514';
    } else {
      this.openaiClient = new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeoutMs ?? 120_000,
        maxRetries: 2,
      });
      this.model = options.model ?? 'gpt-5.6-luna';
    }
  }

  async analyze(listings: EtsyListing[]): Promise<LlmAnalysisResult> {
    if (listings.length === 0) throw new Error('Cannot analyze an empty report');
    const userPrompt = buildUserPrompt(listings);
    log.info(
      { listingsCount: listings.length, provider: this.provider, model: this.model },
      'Sending report analysis request',
    );
    const analysis = this.provider === 'anthropic'
      ? this.analyzeWithAnthropic(userPrompt)
      : this.analyzeWithOpenAI(userPrompt);
    return sanitizeAnalysisLinks(await analysis, listings);
  }

  private async analyzeWithAnthropic(userPrompt: string): Promise<LlmAnalysisResult> {
    const response = await this.anthropicClient!.messages.create({
      model: this.model,
      max_tokens: 8_000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${userPrompt}\n\nВерни только JSON.` }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text content in Anthropic response');
    return parseAnthropicResponse(textBlock.text);
  }

  private async analyzeWithOpenAI(userPrompt: string): Promise<LlmAnalysisResult> {
    const response = await this.openaiClient!.responses.parse({
      model: this.model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      text: {
        format: zodTextFormat(LlmAnalysisResultSchema, 'etsy_market_analysis'),
      },
      max_output_tokens: 8_000,
    });
    if (!response.output_parsed) throw new Error('OpenAI returned no structured analysis');
    return LlmAnalysisResultSchema.parse(response.output_parsed);
  }
}
