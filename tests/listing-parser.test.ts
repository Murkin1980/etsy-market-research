import { describe, it, expect } from 'vitest';
import { LlmAnalysisResultSchema } from '../src/types/schemas.js';

describe('llm schemas', () => {
  it('validates correct LLM analysis result', () => {
    const validResult = {
      marketSummary: {
        analyzedListings: 20,
        averagePriceUsd: 12.5,
        medianPriceUsd: 10.0,
        commonFeatures: ['customizable', 'minimalist'],
        commonPositioningPatterns: ['ease of use'],
        marketGaps: ['no video tutorials'],
      },
      topProducts: [
        {
          rank: 1,
          listingId: '12345',
          title: 'Notion Life Planner',
          url: 'https://www.etsy.com/listing/12345',
          mainUSP: 'All-in-one life management',
          targetAudience: ['students', 'professionals'],
          strengths: ['Beautiful design', 'Comprehensive'],
          weaknesses: ['No mobile app'],
          demandReasons: ['Growing productivity market'],
          improvementOpportunities: ['Add video tutorial'],
        },
      ],
      recommendedFeatures: [
        {
          name: 'Habit Tracker',
          priority: 'must_have' as const,
          reason: 'Most requested feature',
        },
      ],
      newProductConcept: {
        name: 'Ultimate Digital Planner',
        positioning: 'All-in-one productivity solution',
        mainUSP: 'Combines planning, tracking, and journaling',
        targetAudience: ['young professionals'],
        recommendedPriceMinUsd: 9.99,
        recommendedPriceMaxUsd: 19.99,
        includedItems: ['Daily planner template', 'Habit tracker'],
        bonuses: ['Free update for 1 year'],
        imagePlan: ['Main hero image', 'Feature overview'],
        descriptionPlan: ['Opening hook', 'Feature list'],
      },
      risks: ['Market saturation', 'Price competition'],
    };

    const result = LlmAnalysisResultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it('rejects invalid LLM result', () => {
    const invalidResult = {
      marketSummary: {
        analyzedListings: 'not a number',
      },
    };

    const result = LlmAnalysisResultSchema.safeParse(invalidResult);
    expect(result.success).toBe(false);
  });
});
