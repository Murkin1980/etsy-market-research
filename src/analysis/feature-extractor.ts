import type { EtsyListing } from '../types/listing.js';
import { cleanText, extractKeywords } from '../normalization/text-cleaner.js';

export interface FeatureExtractionResult {
  features: string[];
  mainFeature: string | null;
  includedItems: string[];
  fileFormats: string[];
  relatedSearches: string[];
  extractedKeywords: string[];
}

export function extractFeatures(
  descriptionRaw: string | null,
  features: string[],
  includedItems: string[],
  fileFormats: string[],
  title: string | null,
): FeatureExtractionResult {
  const cleanedText = descriptionRaw ? cleanText(descriptionRaw).cleaned : null;

  // Merge description keywords with title keywords
  const allText = [title ?? '', descriptionRaw ?? ''].join(' ');
  const extractedKeywords = extractKeywords(allText);

  return {
    features: features.length > 0 ? features : extractFeaturesFromDescription(cleanedText),
    mainFeature: features.length > 0 ? features[0] : null,
    includedItems,
    fileFormats,
    relatedSearches: [],
    extractedKeywords,
  };
}

function extractFeaturesFromDescription(description: string | null): string[] {
  if (!description) return [];

  const features: string[] = [];
  const lines = description.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 10 &&
      trimmed.length < 300 &&
      (trimmed.startsWith('•') ||
        trimmed.startsWith('-') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('✓') ||
        trimmed.startsWith('✔') ||
        /^\d+\.\s/.test(trimmed))
    ) {
      features.push(trimmed.replace(/^[•\-*✓✔\d.]+\s*/, ''));
    }
  }

  return features.slice(0, 20);
}

export function extractMarketFeatures(listings: EtsyListing[]): {
  commonFeatures: string[];
  commonPositioningPatterns: string[];
  marketGaps: string[];
} {
  const featureFrequency = new Map<string, number>();
  const positioningPatterns = new Set<string>();

  for (const listing of listings) {
    for (const feature of listing.content.features) {
      const normalized = feature.toLowerCase().trim();
      featureFrequency.set(normalized, (featureFrequency.get(normalized) ?? 0) + 1);
    }

    // Detect positioning patterns
    const desc = listing.content.descriptionRaw?.toLowerCase() ?? '';
    if (desc.includes('minimal')) positioningPatterns.add('Minimalist design');
    if (desc.includes('aesthetic')) positioningPatterns.add('Aesthetic/visual focus');
    if (desc.includes('easy to use')) positioningPatterns.add('Ease of use emphasis');
    if (desc.includes('customiz')) positioningPatterns.add('Customization highlighted');
    if (desc.includes('beginner')) positioningPatterns.add('Beginner-friendly');
    if (desc.includes('professional')) positioningPatterns.add('Professional positioning');
    if (desc.includes('all-in-one')) positioningPatterns.add('All-in-one solution');
    if (desc.includes('bundle') || desc.includes('pack')) positioningPatterns.add('Bundle/pack offering');
  }

  // Sort features by frequency
  const commonFeatures = [...featureFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([feature]) => feature);

  return {
    commonFeatures,
    commonPositioningPatterns: [...positioningPatterns].slice(0, 10),
    marketGaps: [], // Would need more sophisticated analysis
  };
}
