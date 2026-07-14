import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { EncryptedCredentialStore } from '../src/storage/encrypted-credential.js';

const temporaryDirectories: string[] = [];

function createStore(masterSecret = 'production-api-key-with-at-least-32-characters') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-credential-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'etsy-api.enc');
  return {
    filePath,
    store: new EncryptedCredentialStore(filePath, masterSecret),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('EncryptedCredentialStore', () => {
  it('persists and restores an Etsy credential without plaintext on disk', () => {
    const { filePath, store } = createStore();
    const combined = store.save({
      keystring: 'etsy-keystring-1234',
      sharedSecret: 'shared-secret-9876',
    });

    expect(combined).toBe('etsy-keystring-1234:shared-secret-9876');
    expect(store.load()).toBe(combined);
    const stored = fs.readFileSync(filePath, 'utf8');
    expect(stored).not.toContain('etsy-keystring-1234');
    expect(stored).not.toContain('shared-secret-9876');
    expect(JSON.parse(stored)).toMatchObject({ version: 1, algorithm: 'aes-256-gcm' });
  });

  it('cannot decrypt with a different server API key', () => {
    const { filePath, store } = createStore();
    store.save({ keystring: 'etsy-keystring-1234', sharedSecret: 'shared-secret-9876' });
    const wrongStore = new EncryptedCredentialStore(
      filePath,
      'different-production-api-key-with-32-characters',
    );

    expect(() => wrongStore.load()).toThrow();
  });

  it('rejects invalid credential fields before writing', () => {
    const { filePath, store } = createStore();
    expect(() => store.save({ keystring: 'bad key', sharedSecret: 'valid-secret' })).toThrow(/keystring/i);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
