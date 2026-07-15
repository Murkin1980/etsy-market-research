import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';

export type AccountRole = 'admin' | 'member';

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  createdAt: string;
}

interface StoredAccount extends PublicAccount {
  passwordSalt: string;
  passwordHash: string;
  disabled: boolean;
}

interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  csrfHash: string;
  createdAt: string;
  expiresAt: string;
}

interface StoredInvite {
  id: string;
  codeHash: string;
  role: AccountRole;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

interface AccountDatabase {
  version: 1;
  accounts: StoredAccount[];
  sessions: StoredSession[];
  invites: StoredInvite[];
}

export interface AuthSession {
  account: PublicAccount;
  sessionId: string;
}

const PASSWORD_KEY_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function publicAccount(account: StoredAccount): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    createdAt: account.createdAt,
  };
}

export class AccountStore {
  private database: AccountDatabase;

  constructor(
    private readonly filePath: string,
    private readonly sessionTtlDays = 7,
  ) {
    this.database = this.load();
    this.pruneExpired();
  }

  createInvite(createdBy: string, role: AccountRole = 'member', ttlHours = 168): { code: string; expiresAt: string } {
    const code = `invite_${randomBytes(24).toString('base64url')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1_000).toISOString();
    this.database.invites.push({
      id: randomUUID(),
      codeHash: sha256(code),
      role,
      createdBy,
      createdAt: now.toISOString(),
      expiresAt,
      usedAt: null,
    });
    this.save();
    return { code, expiresAt };
  }

  async register(input: { email: string; name: string; password: string; inviteCode: string }): Promise<PublicAccount> {
    this.pruneExpired();
    const email = input.email.trim().toLowerCase();
    if (this.database.accounts.some((account) => account.email === email)) {
      throw new Error('An account with this email already exists');
    }
    const inviteHash = sha256(input.inviteCode.trim());
    const invite = this.database.invites.find((candidate) => (
      !candidate.usedAt && new Date(candidate.expiresAt).getTime() > Date.now() && safeEqualHex(candidate.codeHash, inviteHash)
    ));
    if (!invite) throw new Error('Invitation is invalid or expired');

    const salt = randomBytes(16).toString('base64url');
    const passwordHash = (await scrypt(input.password, salt)).toString('hex');
    const account: StoredAccount = {
      id: randomUUID(),
      email,
      name: input.name.trim(),
      role: invite.role,
      createdAt: new Date().toISOString(),
      passwordSalt: salt,
      passwordHash,
      disabled: false,
    };
    invite.usedAt = new Date().toISOString();
    this.database.accounts.push(account);
    this.save();
    return publicAccount(account);
  }

  async verifyPassword(emailInput: string, password: string): Promise<PublicAccount | null> {
    const email = emailInput.trim().toLowerCase();
    const account = this.database.accounts.find((candidate) => candidate.email === email && !candidate.disabled);
    const salt = account?.passwordSalt ?? randomBytes(16).toString('base64url');
    const expected = account?.passwordHash ?? randomBytes(PASSWORD_KEY_BYTES).toString('hex');
    const actual = (await scrypt(password, salt)).toString('hex');
    if (!account || !safeEqualHex(actual, expected)) return null;
    return publicAccount(account);
  }

  createSession(userId: string): { token: string; csrfToken: string; expiresAt: string } {
    const account = this.database.accounts.find((candidate) => candidate.id === userId && !candidate.disabled);
    if (!account) throw new Error('Account is not available');
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTtlDays * 24 * 60 * 60 * 1_000).toISOString();
    this.database.sessions = this.database.sessions.filter((session) => session.userId !== userId || new Date(session.expiresAt).getTime() > Date.now());
    const userSessions = this.database.sessions.filter((session) => session.userId === userId);
    for (const session of userSessions.slice(0, Math.max(0, userSessions.length - 4))) {
      this.database.sessions = this.database.sessions.filter((candidate) => candidate.id !== session.id);
    }
    this.database.sessions.push({
      id: randomUUID(),
      userId,
      tokenHash: sha256(token),
      csrfHash: sha256(csrfToken),
      createdAt: now.toISOString(),
      expiresAt,
    });
    this.save();
    return { token, csrfToken, expiresAt };
  }

  authenticate(token: string): AuthSession | null {
    if (!token) return null;
    const tokenHash = sha256(token);
    const session = this.database.sessions.find((candidate) => (
      new Date(candidate.expiresAt).getTime() > Date.now() && safeEqualHex(candidate.tokenHash, tokenHash)
    ));
    if (!session) return null;
    const account = this.database.accounts.find((candidate) => candidate.id === session.userId && !candidate.disabled);
    return account ? { account: publicAccount(account), sessionId: session.id } : null;
  }

  rotateCsrf(sessionId: string): string {
    const session = this.database.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new Error('Session not found');
    const csrfToken = randomBytes(24).toString('base64url');
    session.csrfHash = sha256(csrfToken);
    this.save();
    return csrfToken;
  }

  verifyCsrf(sessionId: string, token: string): boolean {
    const session = this.database.sessions.find((candidate) => candidate.id === sessionId);
    return Boolean(session && token && safeEqualHex(session.csrfHash, sha256(token)));
  }

  deleteSession(sessionId: string): void {
    this.database.sessions = this.database.sessions.filter((session) => session.id !== sessionId);
    this.save();
  }

  private load(): AccountDatabase {
    if (!fs.existsSync(this.filePath)) return { version: 1, accounts: [], sessions: [], invites: [] };
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as AccountDatabase;
    if (parsed.version !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.invites)) {
      throw new Error('Unsupported account database format');
    }
    return parsed;
  }

  private pruneExpired(): void {
    const now = Date.now();
    const before = this.database.sessions.length;
    this.database.sessions = this.database.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
    if (this.database.sessions.length !== before) this.save();
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.database, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
  }
}
