// Интерфейс инструмента. Инструмент получает отсчёты пера и сам решает, что рисовать и что класть в документ.

export interface PenSample {
  /** Экранные px (CSS) относительно холста, дробные. */
  x: number;
  y: number;
  /** 0..1; для мыши всегда 0.5. */
  pressure: number;
  /** Время в мс. */
  t: number;
  ctrl?:boolean; shift?:boolean; alt?:boolean; meta?:boolean;
}

export interface Tool {
  readonly id: string;
  readonly pending?:boolean;
  finishPending?():void;
  modifiersChanged?():void;
  /** Перо коснулось холста. */
  begin(s: PenSample): void;
  /** Перо движется: все отсчёты с прошлого кадра и предсказанные браузером точки. */
  move(samples: PenSample[], predicted: PenSample[]): void;
  /** Перо оторвалось. */
  end(): void;
  /** Действие прервано — ничего не сохранять. */
  cancel(): void;
  /** Изменились настройки: инструменты с изменяемым предпросмотром обновляют живой слой. */
  settingsChanged?(): void;
}
