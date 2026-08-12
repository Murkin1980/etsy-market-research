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
    const account = await store.register({
      email: 'Owner@Example.com', name: 'Owner', password: 'correct horse battery staple', inviteCode: invite.code,
    });
    expect(account).toMatchObject({ email: 'owner@example.com', role: 'admin' });
    await expect(store.register({
      email: 'second@example.com', name: 'Second', password: 'another secure password', inviteCode: invite.code,
    })).rejects.toThrow(/cannot be completed/);

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

  it('allows only one concurrent registration per one-time invitation', async () => {
    const store = new AccountStore(temporaryFile('accounts.json'), 7);
    const invite = store.createInvite('legacy-admin', 'admin');
    const attempts = await Promise.allSettled([
      store.register({ email: 'one@example.com', name: 'One', password: 'a secure password one', inviteCode: invite.code }),
      store.register({ email: 'two@example.com', name: 'Two', password: 'a secure password two', inviteCode: invite.code }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(store.listAccounts()).toHaveLength(1);
  });

  it('does not reveal whether an email already exists when registration fails', async () => {
    const store = new AccountStore(temporaryFile('accounts.json'), 7);
    const invite = store.createInvite('legacy-admin');
    await store.register({ email: 'known@example.com', name: 'Known', password: 'a secure password here', inviteCode: invite.code });
    const invalidInvite = 'invite_this-code-is-not-valid-but-long-enough';
    await expect(store.register({
      email: 'known@example.com', name: 'Known', password: 'another secure password', inviteCode: invalidInvite,
    })).rejects.toThrow('Registration cannot be completed with these details');
    await expect(store.register({
      email: 'unknown@example.com', name: 'Unknown', password: 'another secure password', inviteCode: invalidInvite,
    })).rejects.toThrow('Registration cannot be completed with these details');
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
