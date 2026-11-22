// Реестр действий и хоткеи. Всё, что делается клавишей или кнопкой, — действие с id.
// Сочетание — строка вида 'Cmd+Shift+KeyE': модификаторы в порядке Ctrl, Alt, Shift, Cmd
// и физическая клавиша (KeyboardEvent.code), поэтому хоткеи не зависят от раскладки.

export interface ActionDef {
  id: string;
  title: string;
  /** Сочетания по умолчанию; у действия их может быть несколько. */
  keys: string[];
  /** Срабатывать при удержании клавиши. */
  repeat?: boolean;
  group?: string;
  description?: string;
  kind?: 'action'|'modifier'|'hold';
  /** Контексты нужны только для проверки конфликтов удерживаемых клавиш. */
  contexts?: string[];
  run: (key?:KeyLike) => void;
}

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}

export function comboOf(e: KeyLike): string {
  return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.metaKey ? 'Cmd+' : '') + e.code;
}

/** Привести сочетание к каноническому порядку модификаторов: 'Cmd+Shift+KeyE' → 'Shift+Cmd+KeyE'. */
export function normalizeCombo(combo: string): string {
  const parts = combo.split('+');
  return [...MODIFIERS.filter(m=>parts.includes(m)),...parts.filter(p=>!MODIFIERS.includes(p))].join('+');
}

export const MODIFIERS=['Ctrl','Alt','Shift','Cmd'];
export function modifierName(code:string):string|undefined { return ({ControlLeft:'Ctrl',ControlRight:'Ctrl',AltLeft:'Alt',AltRight:'Alt',ShiftLeft:'Shift',ShiftRight:'Shift',MetaLeft:'Cmd',MetaRight:'Cmd'} as Record<string,string>)[code]; }
export function modifierCombo(e:Pick<KeyLike,'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>):string {return comboOf({...e,code:''}).replace(/\+$/,'');}
export function validCombo(combo:string,kind:ActionDef['kind']='action'):boolean {
  const parts=combo.split('+'),keys=parts.filter(p=>!MODIFIERS.includes(p));
  if(new Set(parts).size!==parts.length||!combo)return false;
  if(kind==='modifier')return keys.length===0;
  if(kind==='hold'&&keys.length===0)return true;
  return keys.length===1&&/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal)|Arrow(Left|Right|Up|Down)|Space|Tab|Escape|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Backslash|Slash|Comma|Period|IntlBackslash|IntlYen|IntlRo|CapsLock)$/.test(keys[0]);
}
/** Модификаторы разрешают совместное удержание, например сетку и угол. */
export function heldCombo(combo:string,e:Pick<KeyLike,'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>,pressed:ReadonlySet<string>=new Set()):boolean {
  const parts=combo.split('+'),mods=modifierCombo(e).split('+');
  return !!combo&&parts.every(p=>MODIFIERS.includes(p)?mods.includes(p):pressed.has(p));
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Equal: '=',
  Minus: '−',
  NumpadAdd: '+',
  NumpadSubtract: '−',
  Tab: 'Tab',
  Escape: 'Esc',
  Space: 'Пробел',
  Backspace: '⌫',
  Delete: 'Del',
  Enter: '↩',
  Backquote: '`',
  BracketLeft:'[',BracketRight:']',Comma:',',Period:'.',Slash:'/',Backslash:'\\',Semicolon:';',Quote:"'",
  Ctrl:'⌃',Alt:'⌥',Shift:'⇧',Cmd:'⌘',CapsLock:'⇪',Home:'Home',End:'End',PageUp:'PgUp',PageDown:'PgDn',
};

/** Сочетание в виде, привычном для macOS: 'Cmd+Shift+KeyE' → '⇧⌘E'. */
export function comboLabel(combo: string): string {
  const parts = combo.split('+');
  const code = parts.filter(p=>!MODIFIERS.includes(p)).at(-1)??'';
  const mods = (parts.includes('Ctrl') ? '⌃' : '') + (parts.includes('Alt') ? '⌥' : '') + (parts.includes('Shift') ? '⇧' : '') + (parts.includes('Cmd') ? '⌘' : '');
  const key = KEY_NAMES[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');
  return mods + key+(code.startsWith('Numpad')?' (Num)':'');
}

/** В запросе «+» обозначает клавишу: Shift с «=» или отдельный плюс цифрового блока. */
export function shortcutSearchBindings(keys:readonly string[],description:string,query:string):readonly string[]|null {
  const words=query.toLocaleLowerCase().trim().split(/\s+/);
  if(!words[0])return keys;
  const labels=keys.flatMap(k=>[k,k.replace(/\b(Key|Digit)/g,''),comboLabel(k)]);
  const text=[description,...labels].join(' ').toLocaleLowerCase();
  let visible=keys;
  for(const word of words){
    if(word!=='+'&&!word.endsWith('++')&&!/^[⌃⌥⇧⌘]+\+$/.test(word)){
      if(!text.includes(word))return null;
      continue;
    }
    const names:Record<string,string>={'⌃':'ctrl+','⌥':'alt+','⇧':'shift+','⌘':'cmd+'};
    const mods=word.slice(0,-1).replace(/[⌃⌥⇧⌘]/g,s=>names[s]).split('+').filter(Boolean);
    visible=visible.filter(k=>{
      const parts=k.toLowerCase().split('+'),code=parts.pop();
      return (code==='numpadadd'||(code==='equal'&&parts.includes('shift')))&&mods.every(m=>parts.includes(m));
    });
    if(!visible.length)return null;
  }
  return visible;
}

/** Подпись в меню Electron; обработка клавиш всё равно идёт по физическим code. */
export function menuAccelerator(combo:string):string|undefined {
  const parts=normalizeCombo(combo).split('+'),code=parts.pop()??'';
  const names:Record<string,string>={Equal:'=',Minus:'-',BracketLeft:'[',BracketRight:']',Comma:',',Period:'.',Semicolon:';',Quote:"'",Backquote:'`',Slash:'/',Backslash:'\\',Space:'Space',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down'};
  if(!validCombo(combo)||code.startsWith('Numpad')||code.startsWith('Intl'))return undefined;
  return [...parts,names[code]??code.replace(/^Key|^Digit/,'')].join('+');
}

export class Actions {
  private defs = new Map<string, ActionDef>();
  private overrides: Record<string, string[]> = {};
  private byCombo: Map<string, string> | null = null;

  register(def: ActionDef): void {
    this.defs.set(def.id, def);
    this.byCombo = null;
  }

  /** Переопределения из настроек: id → сочетания (пустой список снимает хоткей). */
  setOverrides(overrides: Record<string, string[]>): void {
    this.overrides = overrides;
    this.byCombo = null;
  }

  list(): ActionDef[] {
    return [...this.defs.values()];
  }

  keysOf(id: string): string[] {
    return this.overrides[id] ?? this.defs.get(id)?.keys ?? [];
  }

  /** Новые стандартные клавиши не перекрывают ранее сохранённые назначения пользователя. */
  preserveCustomBindings(overrides:Record<string,string[]>):Record<string,string[]> {
    const result=structuredClone(overrides);
    for(const [id,keys] of Object.entries(overrides))for(const key of keys){
      for(const other of this.conflicts(id,key,result))if(!Object.hasOwn(overrides,other.id))
        result[other.id]=(result[other.id]??other.keys).filter(k=>normalizeCombo(k)!==normalizeCombo(key));
    }
    return result;
  }

  conflicts(id:string,combo:string,overrides:Record<string,string[]>=this.overrides):ActionDef[] {
    const target=this.defs.get(id);if(!target)return [];
    return this.list().filter(other=>other.id!==id&&(overrides[other.id]??other.keys).some(k=>normalizeCombo(k)===normalizeCombo(combo))&&(
      (!target.kind||target.kind==='action')&&(!other.kind||other.kind==='action')||
      target.kind==='hold'||other.kind==='hold'||
      (target.contexts??[]).some(c=>(other.contexts??[]).includes(c))
    ));
  }

  match(e:KeyLike,allowed?:(id:string)=>boolean,ignoreExtraModifiers=false):string|undefined {
    this.index();
    const exact=this.byCombo!.get(comboOf(e));if(exact&&(!allowed||allowed(exact)))return exact;
    if(!ignoreExtraModifiers)return undefined;
    const mods=modifierCombo(e).split('+');let best:string|undefined,score=-1;
    for(const def of this.defs.values()){
      if((def.kind&&def.kind!=='action')||(allowed&&!allowed(def.id)))continue;
      for(const key of this.keysOf(def.id)){
        const parts=normalizeCombo(key).split('+');if(parts.pop()!==e.code)continue;
        if(parts.length>score&&parts.every(p=>mods.includes(p))){score=parts.length;best=def.id;}
      }
    }return best;
  }

  /** Подпись первого хоткея действия или пустая строка. */
  hint(id: string): string {
    const keys = this.keysOf(id);
    return keys.length ? comboLabel(keys[0]) : '';
  }

  run(id: string): boolean {
    const def = this.defs.get(id);
    if (!def || (def.kind&&def.kind!=='action')) return false;
    def.run();
    return true;
  }

  /** Обработать нажатие. true — сочетание занято действием (событие нужно погасить). */
  private index():void {
    if (!this.byCombo) {
      this.byCombo = new Map();
      for (const def of this.defs.values()) {
        if(def.kind&&def.kind!=='action')continue;
        for (const combo of this.keysOf(def.id)) this.byCombo.set(normalizeCombo(combo), def.id);
      }
    }
  }
  handle(e: KeyLike,allowed?:(id:string)=>boolean,ignoreExtraModifiers=false): boolean {
    const id = this.match(e,allowed,ignoreExtraModifiers);
    if (!id) return false;
    const def = this.defs.get(id);
    if (def && (!e.repeat || def.repeat)) def.run(e);
    return true;
  }
}
