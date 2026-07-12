import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import type { EtsyListing } from '../types/listing.js';
import { config } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('csv-exporter');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function exportListingsCsv(
  listings: EtsyListing[],
  filename: string = 'listings-summary.csv',
): Promise<string> {
  const outputDir = config.paths.reports;
  ensureDir(outputDir);
  const filePath = path.join(outputDir, filename);

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'title', title: 'Название' },
      { id: 'url', title: 'Ссылка' },
      { id: 'shopName', title: 'Магазин' },
      { id: 'price', title: 'Цена' },
      { id: 'currency', title: 'Исходная валюта' },
      { id: 'priceUsd', title: 'Цена USD' },
      { id: 'listingRating', title: 'Рейтинг товара' },
      { id: 'listingReviewCount', title: 'Отзывы товара' },
      { id: 'shopSales', title: 'Продажи магазина' },
      { id: 'shopReviewCount', title: 'Отзывы магазина' },
      { id: 'salesLevel', title: 'Оценка объема продаж' },
      { id: 'salesScore', title: 'Sales Score' },
      { id: 'confidence', title: 'Confidence' },
      { id: 'mainFeature', title: 'Главная фича' },
      { id: 'bestseller', title: 'Bestseller' },
      { id: 'popularNow', title: 'Popular Now' },
      { id: 'ad', title: 'Реклама' },
      { id: 'position', title: 'Позиция' },
      { id: 'page', title: 'Страница' },
      { id: 'scrapingStatus', title: 'Статус парсинга' },
    ],
  });

  const records = listings.map((l) => ({
    title: l.title ?? '',
    url: l.url,
    shopName: l.shopName ?? '',
    price: l.price.amount?.toString() ?? '',
    currency: l.price.currency ?? '',
    priceUsd: l.price.amountUsd?.toString() ?? '',
    listingRating: l.rating.listingRating?.toString() ?? '',
    listingReviewCount: l.rating.listingReviewCount?.toString() ?? '',
    shopSales: l.rating.shopSales?.toString() ?? '',
    shopReviewCount: l.rating.shopReviewCount?.toString() ?? '',
    salesLevel: l.salesEstimate.level,
    salesScore: l.salesEstimate.score.toString(),
    confidence: l.salesEstimate.confidence.toString(),
    mainFeature: l.content.mainFeature ?? '',
    bestseller: l.badges.bestseller ? 'Yes' : 'No',
    popularNow: l.badges.popularNow ? 'Yes' : 'No',
    ad: l.badges.ad ? 'Yes' : 'No',
    position: l.searchPosition.position.toString(),
    page: l.searchPosition.page.toString(),
    scrapingStatus: l.scraping.status,
  }));

  await csvWriter.writeRecords(records);
  log.info({ count: records.length, path: filePath }, 'Listings CSV exported');
  return filePath;
}
