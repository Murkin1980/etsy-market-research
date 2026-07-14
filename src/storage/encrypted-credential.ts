import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import fs from 'fs';
import path from 'path';

interface EncryptedCredentialEnvelope {
  version: 1;
  algorithm: 'aes-256-gcm';
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface EtsyCredentialInput {
  keystring: string;
  sharedSecret: string;
}

export class EncryptedCredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly masterSecret: string,
  ) {
    if (masterSecret.length < 24) {
      throw new Error('A server API key of at least 24 characters is required to encrypt credentials');
    }
  }

  save(input: EtsyCredentialInput): string {
    const apiKey = formatEtsyApiKey(input);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const encryptionKey = scryptSync(this.masterSecret, salt, 32);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const envelope: EncryptedCredentialEnvelope = {
      version: 1,
      algorithm: 'aes-256-gcm',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
    return apiKey;
  }

  load(): string | null {
    if (!fs.existsSync(this.filePath)) return null;
    const envelope = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as EncryptedCredentialEnvelope;
    if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
      throw new Error('Unsupported encrypted credential format');
    }

    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const encryptionKey = scryptSync(this.masterSecret, salt, 32);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    validateCombinedEtsyApiKey(plaintext);
    return plaintext;
  }
}

export function formatEtsyApiKey(input: EtsyCredentialInput): string {
  const keystring = input.keystring.trim();
  const sharedSecret = input.sharedSecret.trim();
  if (!/^[^:\s]{8,128}$/.test(keystring)) {
    throw new Error('Etsy keystring must contain 8–128 characters without spaces or colons');
  }
  if (!/^[^:\s]{8,128}$/.test(sharedSecret)) {
    throw new Error('Etsy shared secret must contain 8–128 characters without spaces or colons');
  }
  return `${keystring}:${sharedSecret}`;
}

function validateCombinedEtsyApiKey(value: string): void {
  const separator = value.indexOf(':');
  if (separator < 1) throw new Error('Stored Etsy API credential is invalid');
  formatEtsyApiKey({
    keystring: value.slice(0, separator),
    sharedSecret: value.slice(separator + 1),
  });
}
