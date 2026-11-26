// Отдельная операция с собственной фоновой обработкой: отмена не прерывает резервную копию/буфер.
import { translate } from '../core/menu-text.ts';
import { cancelled, checkCancelled } from '../core/cancel.ts';
import { DocumentWorker } from './worker-client.ts';

export class FileProcessing {
  private controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly worker = new DocumentWorker();
  private panel = document.createElement('div');
  private text = document.createElement('span');
  private button = document.createElement('button');
  private timer: number;
  private sealed = false;

  constructor(label: string,description=translate('Обработка файла')) {
    this.panel.className = 'file-progress';
    this.panel.setAttribute('aria-label', description);
    this.text.setAttribute('role', 'status'); this.text.textContent = label;
    this.button.className = 'btn'; this.button.textContent = translate('Отмена');
    this.button.onclick = () => this.cancel();
    this.panel.append(this.text, this.button);
    // Вне #ui: кнопка доступна и при блокировке инструментов во время открытия.
    this.timer = window.setTimeout(() => document.body.append(this.panel), 400);
  }

  update(text: string): void { this.text.textContent = text; }
  cancel(): boolean {
    if (this.sealed || this.signal.aborted) return false;
    this.controller.abort(cancelled()); this.worker.dispose();
    this.button.disabled = true; this.update(translate('Отменяю…')); return true;
  }
  /** После этой границы файл уже заменяется атомарно: отмену принимать поздно. */
  seal(): void {
    checkCancelled(this.signal); this.sealed = true;
    this.button.disabled = true; this.update(translate('Завершаю…'));
  }
  close(): void { window.clearTimeout(this.timer); this.panel.remove(); this.worker.dispose(); }
}
