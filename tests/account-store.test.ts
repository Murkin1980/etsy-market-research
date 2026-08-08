import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountStore } from '../src/auth/account-store.js';
import { RunOwnershipStore } from '../src/storage/run-ownership.js';

const temporaryDirectories: string[] = [];

function temporaryFile(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-accounts-'));
  temporaryDirectories.push(root);
  return path.join(root, name);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('account and session store', () => {
  it('consumes one-time invitations and authenticates a persisted session', async () => {
    const filePath = temporaryFile('accounts.json');
    const store = new AccountStore(filePath, 7);
    const invite = store.createInvite('legacy-admin', 'admin');
    const { account } = await store.register({
      email: 'Owner@Example.com', name: 'Owner', password: 'correct horse battery staple', inviteCode: invite.code,
    });
    expect(account).toMatchObject({ email: 'owner@example.com', role: 'admin', emailVerified: false });
    await expect(store.register({
      email: 'second@example.com', name: 'Second', password: 'another secure password', inviteCode: invite.code,
    })).rejects.toThrow(/invalid or expired/);

    expect(await store.verifyPassword('owner@example.com', 'wrong password value')).toBeNull();
    expect(await store.verifyPassword('OWNER@example.com', 'correct horse battery staple')).toMatchObject({ id: account.id });
    const session = store.createSession(account.id);
    const restored = new AccountStore(filePath, 7);
    const authenticated = restored.authenticate(session.token);
    expect(authenticated?.account.id).toBe(account.id);
    expect(restored.verifyCsrf(authenticated!.sessionId, session.csrfToken)).toBe(true);
    const rotated = restored.rotateCsrf(authenticated!.sessionId);
    expect(restored.verifyCsrf(authenticated!.sessionId, session.csrfToken)).toBe(false);
    expect(restored.verifyCsrf(authenticated!.sessionId, rotated)).toBe(true);
  });

  it('registers a public member without an invite and verifies the email', async () => {
    const filePath = temporaryFile('accounts.json');
    const store = new AccountStore(filePath, 7);
    const { account, verificationToken } = await store.register({
      email: 'member@example.com', name: 'Member', password: 'correct horse battery staple',
    });
    expect(account).toMatchObject({ email: 'member@example.com', role: 'member', emailVerified: false });
    expect(verificationToken).toMatch(/^sl_/);

    expect(await store.verifyEmail('sl_wrong-token')).toBeNull();
    const verified = await store.verifyEmail(verificationToken);
    expect(verified).toMatchObject({ id: account.id, emailVerified: true });
    expect(await store.verifyEmail(verificationToken)).toBeNull();

    const { account: resendAccount } = await store.register({
      email: 'resend@example.com', name: 'Resend', password: 'correct horse battery staple',
    });
    expect(store.resendVerificationToken('unknown@example.com')).toBeNull();
    const resend = store.resendVerificationToken('resend@example.com');
    expect(resend).toMatch(/^sl_/);
    expect(await store.verifyEmail(resend!)).toMatchObject({ id: resendAccount.id, emailVerified: true });
  });

  it('resets a password and invalidates existing sessions', async () => {
    const filePath = temporaryFile('accounts.json');
    const store = new AccountStore(filePath, 7);
    const { account } = await store.register({ email: 'reset@example.com', name: 'Reset', password: 'first secure password' });
    const session = store.createSession(account.id);
    expect(store.authenticate(session.token)).not.toBeNull();

    expect(store.requestPasswordReset('unknown@example.com')).toBeNull();
    const request = store.requestPasswordReset('reset@example.com');
    expect(request).toMatchObject({ name: 'Reset' });
    expect(request!.token).toMatch(/^sl_/);

    const updated = await store.resetPassword('sl_bad-token', 'another secure password');
    expect(updated).toBeNull();
    const reset = await store.resetPassword(request!.token, 'fresh secure password');
    expect(reset).toMatchObject({ id: account.id });

    expect(store.authenticate(session.token)).toBeNull();
    expect(await store.verifyPassword('reset@example.com', 'fresh secure password')).toMatchObject({ id: account.id });
    expect(await store.verifyPassword('reset@example.com', 'first secure password')).toBeNull();
  });

  it('migrates a v1 account database and marks existing accounts as verified', async () => {
    const filePath = temporaryFile('accounts.json');
    const legacy = {
      version: 1,
      accounts: [{
        id: 'legacy-1', email: 'legacy@example.com', name: 'Legacy', role: 'admin',
        createdAt: new Date().toISOString(), passwordSalt: 'c2FsdA', passwordHash: '00'.repeat(64),
        disabled: false,
      }],
      invites: [],
      sessions: [],
    };
    fs.writeFileSync(filePath, JSON.stringify(legacy));
    const store = new AccountStore(filePath, 7);
    const account = store.findAccountByEmail('legacy@example.com');
    expect(account).toMatchObject({ id: 'legacy-1', emailVerified: true });
    expect(store.listAccounts()).toHaveLength(1);
  });
});

describe('workspace run ownership', () => {
  it('keeps member runs isolated while administrators can inspect legacy and owned runs', () => {
    const store = new RunOwnershipStore(temporaryFile('owners.json'));
    store.assign('run-a', 'user-a');
    store.assign('run-b', 'user-b');
    expect(store.canAccess('run-a', 'user-a', 'member')).toBe(true);
    expect(store.canAccess('run-b', 'user-a', 'member')).toBe(false);
    expect(store.canAccess('legacy-run', 'user-a', 'member')).toBe(false);
    expect(store.canAccess('run-b', 'admin', 'admin')).toBe(true);
    expect(store.canAccess('legacy-run', 'admin', 'admin')).toBe(true);
  });
});
