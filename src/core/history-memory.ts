// Оценка удерживаемых историей данных. Общие объекты, строки и буферы считаются один раз.
// Это бюджет данных JavaScript, а не показание всей памяти процесса/кэшей Chromium.
export class HistoryMemory {
  bytes = 0;
  private refs = new Map<object|string, number>();

  retain(value: unknown): void { this.change(value, 1); }
  release(value: unknown): void { this.change(value, -1); }
  clear(): void { this.refs.clear(); this.bytes = 0; }

  private change(value: unknown, delta: 1|-1): void {
    if (value === null || (typeof value !== 'object' && typeof value !== 'string')) return;
    const count = this.refs.get(value) ?? 0, next = count + delta;
    if (next > 0) this.refs.set(value, next); else this.refs.delete(value);
    if ((delta === 1 && count > 0) || (delta === -1 && next > 0)) return;
    if (typeof value === 'string') { this.bytes += delta * (48 + value.length * 2); return; }
    if (value instanceof ArrayBuffer) { this.bytes += delta * (64 + value.byteLength); return; }
    if (ArrayBuffer.isView(value)) {
      this.bytes += delta * 64; this.change(value.buffer, delta); return;
    }
    const values = Object.values(value);
    this.bytes += delta * (Array.isArray(value) ? 64 + value.length * 8 : 128 + values.length * 16);
    for (const child of values) this.change(child, delta);
  }
}
