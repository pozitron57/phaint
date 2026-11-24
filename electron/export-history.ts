// Последнее назначение экспорта привязано к полному пути исходника и области экспорта.
// Каждый ключ записывается атомарно, поэтому окна не перезаписывают историю чужих рисунков.
import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { atomicWrite, readOptional } from './storage.ts';
import { exportFormat } from '../src/files/names.ts';

export class ExportHistory {
  private directory: string;
  constructor(directory: string) { this.directory = directory; }

  private key(source: string, selected: boolean): string {
    const hash = createHash('sha256').update(source).digest('hex');
    return join(this.directory, hash + (selected ? '-part' : ''));
  }

  async read(source: string, selected: boolean): Promise<string | null> {
    try {
      const path = await readOptional(this.key(source, selected));
      return path && isAbsolute(path) && !path.includes('\0') && exportFormat(path) ? path : null;
    } catch (error) {
      console.warn('Не удалось прочитать историю экспорта', error);
      return null;
    }
  }

  write(source: string, selected: boolean, target: string): Promise<void> {
    return atomicWrite(this.key(source, selected), target);
  }
}
