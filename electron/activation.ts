// Dock/повторный запуск: возврат к рисунку или новый холст при уже активном окне.
// macOS может прислать activate как до, так и сразу после did-become-active.
// Короткое окно объединяет эти события; следующий клик допускается сразу, без таймера.
const ACTIVATION_WINDOW_MS = 500;

export class WindowActivation {
  private active = false;
  private returningUntil = 0;
  private reopenedBeforeActivation = false;

  becameActive(now = performance.now()): void {
    this.active = true;
    this.returningUntil = this.reopenedBeforeActivation ? 0 : now + ACTIVATION_WINDOW_MS;
    this.reopenedBeforeActivation = false;
  }

  resignedActive(): void {
    this.active = false;
    this.returningUntil = 0;
    this.reopenedBeforeActivation = false;
  }

  /** Есть ли уже активный холст, для которого повторное открытие означает новый. */
  opensNewWindow(hasFocusedWindow: boolean, now = performance.now()): boolean {
    const open = this.active && hasFocusedWindow && now >= this.returningUntil;
    this.returningUntil = 0;
    if (!this.active) this.reopenedBeforeActivation = true;
    return open;
  }
}
