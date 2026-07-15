import type http from 'http';
import type { AccountRole, AccountStore, PublicAccount } from './account-store.js';
import { secretsEqual } from '../server-api.js';

export const SESSION_COOKIE_NAME = 'signal_session';

export interface RequestPrincipal {
  userId: string;
  role: AccountRole;
  account: PublicAccount | null;
  sessionId: string | null;
  authType: 'session' | 'api-key' | 'local';
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return [];
    return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
  }));
}

export function authenticateRequest(
  req: http.IncomingMessage,
  accountStore: AccountStore,
  apiKey: string,
  requireAuthentication: boolean,
): RequestPrincipal | null {
  const authHeader = req.headers.authorization ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (apiKey && bearer && secretsEqual(bearer, apiKey)) {
    return { userId: 'legacy-admin', role: 'admin', account: null, sessionId: null, authType: 'api-key' };
  }
  const sessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME] ?? '';
  const session = accountStore.authenticate(sessionToken);
  if (session) {
    return {
      userId: session.account.id,
      role: session.account.role,
      account: session.account,
      sessionId: session.sessionId,
      authType: 'session',
    };
  }
  if (!requireAuthentication && !apiKey) {
    return { userId: 'local-admin', role: 'admin', account: null, sessionId: null, authType: 'local' };
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}
