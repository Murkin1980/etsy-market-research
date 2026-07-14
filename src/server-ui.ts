import fs from 'fs';
import path from 'path';

export interface UiAsset {
  filePath: string;
  contentType: string;
  cacheControl: string;
}

interface UiAssetDefinition {
  relativePath: string;
  contentType: string;
  cacheControl: string;
}

const NO_CACHE = 'no-store';
const IMMUTABLE = 'public, max-age=31536000, immutable';

const UI_ASSETS: Readonly<Record<string, UiAssetDefinition>> = {
  '/': { relativePath: 'public/index.html', contentType: 'text/html; charset=utf-8', cacheControl: NO_CACHE },
  '/app': { relativePath: 'public/index.html', contentType: 'text/html; charset=utf-8', cacheControl: NO_CACHE },
  '/assets/app.css': { relativePath: 'public/assets/app.css', contentType: 'text/css; charset=utf-8', cacheControl: NO_CACHE },
  '/assets/app.js': { relativePath: 'public/assets/app.js', contentType: 'text/javascript; charset=utf-8', cacheControl: NO_CACHE },
  '/assets/favicon.svg': { relativePath: 'public/assets/favicon.svg', contentType: 'image/svg+xml', cacheControl: IMMUTABLE },
  '/assets/lucide.min.js': {
    relativePath: 'node_modules/lucide/dist/umd/lucide.min.js',
    contentType: 'text/javascript; charset=utf-8',
    cacheControl: IMMUTABLE,
  },
  '/assets/fonts/onest-cyrillic-ext.woff2': {
    relativePath: 'node_modules/@fontsource-variable/onest/files/onest-cyrillic-ext-wght-normal.woff2',
    contentType: 'font/woff2',
    cacheControl: IMMUTABLE,
  },
  '/assets/fonts/onest-cyrillic.woff2': {
    relativePath: 'node_modules/@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2',
    contentType: 'font/woff2',
    cacheControl: IMMUTABLE,
  },
  '/assets/fonts/onest-latin-ext.woff2': {
    relativePath: 'node_modules/@fontsource-variable/onest/files/onest-latin-ext-wght-normal.woff2',
    contentType: 'font/woff2',
    cacheControl: IMMUTABLE,
  },
  '/assets/fonts/onest-latin.woff2': {
    relativePath: 'node_modules/@fontsource-variable/onest/files/onest-latin-wght-normal.woff2',
    contentType: 'font/woff2',
    cacheControl: IMMUTABLE,
  },
  '/assets/fonts/instrument-serif.woff2': {
    relativePath: 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
    contentType: 'font/woff2',
    cacheControl: IMMUTABLE,
  },
};

export function resolveUiAsset(pathname: string, projectRoot: string = process.cwd()): UiAsset | null {
  const definition = UI_ASSETS[pathname];
  if (!definition) return null;

  const filePath = path.resolve(projectRoot, definition.relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;

  return {
    filePath,
    contentType: definition.contentType,
    cacheControl: definition.cacheControl,
  };
}
