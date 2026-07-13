import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { LlmAnalysisResultSchema, type LlmAnalysisResult } from '../types/schemas.js';
import type { EtsyListing } from '../types/listing.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('llm-analyzer');

const SYSTEM_PROMPT = `Ты — аналитик рынка цифровых продуктов Etsy.

Тебе передается массив структурированных данных о цифровых шаблонах.

Не придумывай отсутствующие значения. Если информации недостаточно, прямо укажи это.

Разделяй:
1. факты, полученные из данных;
2. оценки, рассчитанные системой;
3. собственные аналитические выводы.

Не считай общие продажи или отзывы магазина продажами конкретного листинга.

При ранжировании учитывай:
- цену;
- отзывы конкретного товара;
- рейтинг;
- продажи магазина;
- качество визуального позиционирования;
- полноту предложения;
- набор функций;
- признаки вовлеченности;
- позицию в поисковой выдаче;
- наличие значимых конкурентных преимуществ.

Верни ответ строго в JSON по заданной схеме.`;

const USER_PROMPT_TEMPLATE = `Проанализируй данные по шаблонам Etsy.

Задачи:

1. Выдели ТОП-3 продукта с лучшим сочетанием:
   - цены;
   - визуального позиционирования;
   - вовлеченности аудитории;
   - полноты функций;
   - коммерческого потенциала.

2. Для каждого продукта определи:
   - ключевое УТП;
   - целевую аудиторию;
   - сильные стороны;
   - слабые стороны;
   - причины высокого спроса;
   - элементы, которые можно улучшить.

3. Составь список из 10 востребованных функций, которые должны быть в новом шаблоне.

4. Предложи:
   - концепцию нового продукта;
   - название;
   - главное УТП;
   - диапазон цены;
   - комплект поставки;
   - структуру изображений Etsy;
   - структуру описания;
   - дополнительные бонусы.

5. Не придумывай числовые показатели, которых нет в исходных данных.

Данные о товарах:
{data}`;

export type LlmProvider = 'anthropic' | 'openai';

interface LlmAnalyzerOptions {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
}

export function buildLlmPayload(listings: EtsyListing[]): Array<Record<string, unknown>> {
  return listings.map((l) => ({
    listingId: l.listingId,
    title: l.title,
    url: l.url,
    price: l.price,
    listingSignals: {
      rating: l.rating.listingRating,
      reviewCount: l.rating.listingReviewCount,
    },
    badges: l.badges,
    engagement: l.engagement,
    content: {
      mainFeature: l.content.mainFeature,
      features: l.content.features,
      includedItems: l.content.includedItems,
      fileFormats: l.content.fileFormats,
    },
    media: {
      imageCount: l.media.imageCount,
      hasVideo: l.media.hasVideo,
    },
    searchPosition: l.searchPosition,
    evidence: l.evidence,
    demandEstimate: {
      level: l.salesEstimate.level,
      listingEvidenceScore: l.salesEstimate.listingEvidenceScore,
      confidence: l.salesEstimate.confidence,
      reasons: l.salesEstimate.reasons,
    },
    shopProxy: {
      score: l.salesEstimate.shopProxyScore,
      reasons: l.salesEstimate.shopProxyReasons,
      shopSales: l.rating.shopSales,
      shopRating: l.rating.shopRating,
      shopReviewCount: l.rating.shopReviewCount,
    },
  }));
}

export function buildUserPrompt(listings: EtsyListing[]): string {
  const payload = buildLlmPayload(listings);
  const dataJson = JSON.stringify(payload, null, 2);
  return USER_PROMPT_TEMPLATE.replace('{data}', dataJson);
}

function extractJsonFromResponse(rawText: string): string {
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ?? rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[1] ?? jsonMatch[0];
  }
  return rawText;
}

function validateAndParse(jsonStr: string): LlmAnalysisResult | null {
  try {
    const parsed = JSON.parse(jsonStr);
    const result = LlmAnalysisResultSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    log.warn({ errors: result.error.errors }, 'LLM response failed Zod validation');
    return null;
  } catch (err) {
    log.warn({ error: (err as Error).message }, 'Failed to parse LLM JSON');
    return null;
  }
}

function parseResponse(rawText: string): LlmAnalysisResult {
  const jsonStr = extractJsonFromResponse(rawText);
  const result = validateAndParse(jsonStr);
  if (result) return result;

  const fixedJson = jsonStr
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/'/g, '"');

  const fixedResult = validateAndParse(fixedJson);
  if (fixedResult) return fixedResult;

  log.error({ rawResponse: rawText.substring(0, 500) }, 'Failed to parse LLM response');
  throw new Error('Invalid JSON from LLM API');
}

export class LlmAnalyzer {
  private provider: LlmProvider;
  private anthropicClient?: Anthropic;
  private openaiClient?: OpenAI;
  private model: string;

  constructor(options: LlmAnalyzerOptions) {
    this.provider = options.provider;

    if (this.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: options.apiKey });
      this.model = options.model ?? 'claude-sonnet-4-20250514';
    } else {
      this.openaiClient = new OpenAI({ apiKey: options.apiKey });
      this.model = options.model ?? 'gpt-4o';
    }
  }

  async analyze(listings: EtsyListing[]): Promise<LlmAnalysisResult> {
    const userPrompt = buildUserPrompt(listings);
    log.info(
      { listingsCount: listings.length, provider: this.provider, model: this.model },
      'Sending analysis request',
    );

    if (this.provider === 'anthropic') {
      return this.analyzeWithAnthropic(userPrompt);
    }
    return this.analyzeWithOpenAI(userPrompt);
  }

  private async analyzeWithAnthropic(userPrompt: string): Promise<LlmAnalysisResult> {
    const response = await this.anthropicClient!.messages.create({
      model: this.model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return parseResponse(textBlock.text);
  }

  private async analyzeWithOpenAI(userPrompt: string): Promise<LlmAnalysisResult> {
    const response = await this.openaiClient!.chat.completions.create({
      model: this.model,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    return parseResponse(content);
  }
}
