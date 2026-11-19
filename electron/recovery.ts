// Каждому окну — свой файл восстановления. Старый recovery.json остаётся первым слотом.
import { readdir } from 'node:fs/promises';

export async function recoverySlots(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const names = entries.filter(entry => entry.isFile() && /^recovery(?:-[0-9a-f-]+)?\.json$/.test(entry.name))
    .map(entry => entry.name).sort((a, b) => a === 'recovery.json' ? -1 : b === 'recovery.json' ? 1 : a.localeCompare(b));
  return names.length ? names : ['recovery.json'];
}
