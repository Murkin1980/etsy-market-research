import fs from 'fs';
import path from 'path';
import type { AccountRole } from '../auth/account-store.js';

interface OwnershipDatabase {
  version: 1;
  owners: Record<string, string>;
}

export class RunOwnershipStore {
  private database: OwnershipDatabase;

  constructor(private readonly filePath: string) {
    this.database = this.load();
  }

  assign(runId: string, ownerId: string): void {
    if (!runId || !ownerId) return;
    this.database.owners[runId] = ownerId;
    this.save();
  }

  canAccess(runId: string, userId: string, role: AccountRole): boolean {
    const ownerId = this.database.owners[runId];
    if (role === 'admin') return true;
    return Boolean(ownerId && ownerId === userId);
  }

  ownerOf(runId: string): string | null {
    return this.database.owners[runId] ?? null;
  }

  private load(): OwnershipDatabase {
    if (!fs.existsSync(this.filePath)) return { version: 1, owners: {} };
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as OwnershipDatabase;
    if (parsed.version !== 1 || !parsed.owners || typeof parsed.owners !== 'object') {
      throw new Error('Unsupported run ownership database format');
    }
    return parsed;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.database, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
  }
}
