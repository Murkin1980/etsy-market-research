import { createChildLogger } from '../utils/logger.js';
import { BLOCKED_INDICATORS } from './selectors.js';

const log = createChildLogger('browser');

export interface BrowserManager {
  getBrowser: () => import('playwright').Browser;
  getPage: () => import('playwright').Page;
  createPage: () => Promise<import('playwright').Page>;
  close: () => Promise<void>;
  isBlocked: (page: import('playwright').Page) => Promise<boolean>;
  getBlockReason: (page: import('playwright').Page) => Promise<BlockReason>;
}

export type BlockReason = 'BLOCKED' | 'CAPTCHA' | null;

export function detectBlockReason(content: string, url: string = ''): BlockReason {
  const text = content.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  if (
    normalizedUrl.includes('/captcha') ||
    normalizedUrl.includes('/challenge') ||
    text.includes('captcha') ||
    text.includes('verify you are human') ||
    text.includes('please verify')
  ) {
    return 'CAPTCHA';
  }

  for (const indicator of BLOCKED_INDICATORS) {
    if (text.includes(indicator.toLowerCase())) return 'BLOCKED';
  }
  return null;
}

let browserInstance: import('playwright').Browser | null = null;

export async function createBrowserManager(
  headless: boolean = true,
): Promise<BrowserManager> {
  const { chromium } = await import('playwright');

  if (!browserInstance) {
    log.info({ headless }, 'Launching browser');
    browserInstance = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
      ],
    });
  }

  const context = await browserInstance.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const page = await context.newPage();

  return {
    getBrowser: () => browserInstance!,
    getPage: () => page,
    createPage: () => context.newPage(),
    close: async () => {
      try {
        await context.close();
      } catch {
        // ignore
      }
    },
    getBlockReason: async (targetPage: import('playwright').Page): Promise<BlockReason> => {
      try {
        const content = await targetPage.content();
        const url = targetPage.url();
        return detectBlockReason(content, url);
      } catch {
        return 'BLOCKED';
      }
    },
    isBlocked: async (targetPage: import('playwright').Page): Promise<boolean> => {
      try {
        const content = await targetPage.content();
        return detectBlockReason(content, targetPage.url()) !== null;
      } catch {
        return true;
      }
    },
  };
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // ignore
    }
    browserInstance = null;
  }
}
