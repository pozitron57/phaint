// Браузерный вариант: SVG/картинки/PDF, скачивание файлов, резервная копия в IndexedDB.
import { translate } from '../core/menu-text.ts';
import { type Language, t } from '../core/language.ts';
import type { FileApi, RecoveryFile, UnsavedChoice } from './api.ts';
import { imageTypes } from './binary.ts';
import { exportName, repeatExportName, workingName } from './names.ts';

async function recovery(write: boolean, value?: RecoveryFile | null): Promise<RecoveryFile | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('phaint.documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recovery');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('recovery', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('recovery');
      const req = write ? (value ? store.put(value, 'current') : store.delete('current')) : store.get('current');
      tx.oncomplete = () => resolve(write ? null : req.result ?? null);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error(translate('Не удалось записать резервную копию.')));
    });
  } finally { db.close(); }
}

function choose(message: string, labels: string[], cancellable=true): Promise<number> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'file-dialog';
    const p = document.createElement('p'); p.textContent = message; dialog.append(p);
    const finish = (i: number): void => { dialog.close(); dialog.remove(); resolve(i); };
    labels.forEach((label, i) => {
      const button = document.createElement('button'); button.className = 'btn'; button.textContent = label;
      button.onclick = () => finish(i); dialog.append(button);
    });
    dialog.oncancel = event => { event.preventDefault(); if(cancellable)finish(labels.length - 1); };
    document.body.append(dialog); dialog.showModal();
  });
}

export async function chooseBrowserLanguage():Promise<Language> {
  const chosen=await choose('Выберите язык / Choose your language', ['Русский','English'], false);
  return chosen===0?'ru':'en';
}

export function browserFiles(): FileApi {
  let dirty = false;
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  return {
    open: () => new Promise((resolve, reject) => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.svg,.pdf,'+Object.keys(imageTypes).map(s=>'.'+s).join(',');
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const extension=file.name.split('.').pop()!.toLowerCase(),ref={name:file.name,handle:crypto.randomUUID()};
        if(extension==='svg')void file.text().then(text=>resolve({...ref,text}),reject);
        else void file.arrayBuffer().then(buffer=>resolve({...ref,type:extension==='pdf'?'pdf':'image',mime:extension==='pdf'?'application/pdf':imageTypes[extension],bytes:new Uint8Array(buffer)}),reject);
      };
      input.oncancel = () => resolve(null);
      input.click();
    }),
    chooseSave: async (current, saveAs, selection) => {
      if (current && !saveAs&&!selection&&/\.svg$/i.test(current.name)) return current;
      let name = window.prompt(selection?translate('Сохранить выделение в отдельный SVG'):translate('Название SVG-файла'), selection?exportName(current?.name,'svg',true):workingName(current?.name));
      if (!name?.trim()) return null;
      name = name.trim(); if (!/\.svg$/i.test(name)) name += '.svg';
      return { handle: crypto.randomUUID(), name };
    },
    write: async (file, text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
    chooseExport: async (current, format, selection, previous) => {
      const suggested = previous && repeatExportName(previous.name, format);
      let name=window.prompt(translate('Название файла'),suggested || exportName(current?.name,format,selection))?.trim();
      if(!name)return null;
      if(!name.toLowerCase().endsWith(`.${format}`))name+=`.${format}`;
      return {handle:crypto.randomUUID(),name};
    },
    writeBinary: async (file, bytes) => {
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
      const a=document.createElement('a');a.href=url;a.download=file.name;a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    },
    confirmUnsaved: async name => (['save', 'discard', 'cancel'] as UnsavedChoice[])[await choose(t(`Сохранить изменения в «${name}»?`,`Save changes to “${name}”?`), [translate('Сохранить'), translate('Не сохранять'), translate('Отмена')])],
    recoveryRead: () => recovery(false),
    recoveryWrite: async file => { await recovery(true, file); },
    confirmRecovery: async file => (await choose(t(`Восстановить «${file.name}» после незавершённой работы?`,`Restore “${file.name}” from the last session?`), [translate('Восстановить'), translate('Начать с пустого холста')])) === 0,
    status: (name, changed) => { dirty = changed; document.title = `${name}${dirty ? ' •' : ''} — Phaint`; },
    error: async message => { await choose(message, [translate('Понятно')]); },
    onCommand: () => undefined,
    closeReady: () => undefined,
  };
}
