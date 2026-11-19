// Настройки клавиш: черновик до сохранения, запись нажатием, явное разрешение конфликтов.
import type { App } from '../app.ts';
import { comboLabel, comboOf, modifierCombo, modifierName, normalizeCombo, validCombo, type ActionDef } from '../core/actions.ts';
import { SHORTCUT_GROUPS } from '../core/shortcut-info.ts';
import { h, icon } from './dom.ts';

export class ShortcutSettings {
  private app:App;
  private dialog:HTMLDialogElement|null=null;
  private draft:Record<string,string[]>={};
  private group='all';
  private filter='';
  private changedOnly=false;
  private body!:HTMLElement;
  private rows!:HTMLElement;
  private status!:HTMLElement;
  private editor!:HTMLElement;
  private search!:HTMLInputElement;
  private save!:HTMLButtonElement;
  private busy=false;
  private recording:{def:ActionDef;index:number;combo:string}|null=null;
  constructor(app:App){this.app=app;}
  get open():boolean {return !!this.dialog?.open;}
  show():void {
    if(this.open){this.search.focus();return;}
    this.app.input.finishCurrent();this.app.closePanels();this.app.input.clearModifiers();
    this.draft=structuredClone(this.app.settings.keys);this.group='all';this.filter='';this.changedOnly=false;
    const dialog=h('dialog',{class:'shortcut-dialog','aria-label':'Настройки клавиш'});this.dialog=dialog;
    const title=h('div',{},h('h2',{},'Настройки'),h('p',{},'Клавиши и сочетания'));
    const close=h('button',{class:'shortcut-close',title:'Закрыть без сохранения','aria-label':'Закрыть без сохранения',onclick:()=>this.close()},icon('close'));
    dialog.append(h('header',{class:'shortcut-header'},title,close));
    this.search=h('input',{type:'search',placeholder:'Найти действие или сочетание…','aria-label':'Поиск сочетаний',oninput:()=>{this.filter=this.search.value;this.rows.scrollTop=0;this.renderRows();}});
    const changed=h('input',{type:'checkbox',onchange:()=>{this.changedOnly=changed.checked;this.rows.scrollTop=0;this.renderRows();}});
    const filters=h('div',{class:'shortcut-filters'},this.search,h('label',{},changed,'Только изменённые'));
    const nav=h('nav',{'aria-label':'Группы действий',class:'shortcut-nav'});
    for(const [id,label] of Object.entries({all:'Все действия',...SHORTCUT_GROUPS})){
      const count=id==='all'?this.app.actions.list().length:this.app.actions.list().filter(d=>d.group===id).length;
      const button=h('button',{'data-group':id,'aria-pressed':String(id==='all'),onclick:()=>{
        this.group=id;for(const el of nav.querySelectorAll('button'))el.setAttribute('aria-pressed',String(el===button));this.rows.scrollTop=0;this.renderRows();
      }},label,h('span',{},String(count)));nav.append(button);
    }
    this.rows=h('div',{class:'shortcut-rows','aria-label':'Назначения клавиш'});
    const table=h('section',{class:'shortcut-table'},h('div',{class:'shortcut-columns'},h('span',{},'Действие'),h('span',{},'Сочетания клавиш')),this.rows);
    this.body=h('div',{class:'shortcut-body'},filters,h('div',{class:'shortcut-layout'},nav,table));
    this.editor=h('section',{class:'shortcut-editor',hidden:true,'aria-live':'polite'});
    this.status=h('span',{class:'shortcut-status','aria-live':'polite'},'Нажмите сочетание в списке, чтобы изменить его.');
    const reset=h('button',{class:'btn shortcut-reset',onclick:()=>this.resetAll()},'Вернуть стандартные');
    const cancel=h('button',{class:'btn',onclick:()=>this.close()},'Отмена');
    this.save=h('button',{class:'btn primary',onclick:()=>{void this.commit();}},'Сохранить');
    dialog.append(this.body,this.editor,h('p',{class:'shortcut-note'},'Клавиши работают в любой раскладке. В текстовых полях сохраняются обычные команды редактирования.'),
      h('footer',{},h('div',{class:'shortcut-footer-left'},reset,this.status),cancel,this.save));
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(!this.editor.hidden)this.endEditor();else this.close();});
    window.addEventListener('keydown',this.capture,true);
    document.body.append(dialog);this.renderRows();dialog.showModal();this.search.focus();
  }
  private keys(def:ActionDef):string[]{return this.draft[def.id]??def.keys;}
  private changed(def:ActionDef):boolean {return JSON.stringify(this.keys(def).map(normalizeCombo))!==JSON.stringify(def.keys.map(normalizeCombo));}
  private put(def:ActionDef,keys:string[]):void {
    const normalized=[...new Set(keys.map(normalizeCombo))];
    if(JSON.stringify(normalized)===JSON.stringify(def.keys.map(normalizeCombo)))delete this.draft[def.id];else this.draft[def.id]=normalized;
  }
  private renderRows():void {
    const scroll=this.rows.scrollTop;
    const query=this.filter.toLocaleLowerCase().trim(),list=this.app.actions.list().filter(def=>{
      const haystack=[def.title,def.description,SHORTCUT_GROUPS[def.group as keyof typeof SHORTCUT_GROUPS],...this.keys(def).flatMap(k=>[k,k.replace(/\b(Key|Digit)/g,''),comboLabel(k)])].join(' ').toLocaleLowerCase();
      return (this.group==='all'||def.group===this.group)&&(!this.changedOnly||this.changed(def))&&query.split(/\s+/).every(word=>haystack.includes(word));
    });
    this.rows.replaceChildren();
    for(const def of list){
      const keys=this.keys(def),bindings=h('div',{class:'shortcut-bindings'});
      keys.forEach((key,index)=>{
        const edit=h('button',{class:'shortcut-key','aria-label':`Изменить: ${def.title} — ${comboLabel(key)}`,onclick:()=>this.record(def,index)},comboLabel(key));
        const remove=h('button',{class:'shortcut-key-remove',title:'Убрать сочетание','aria-label':`Убрать ${comboLabel(key)} у «${def.title}»`,onclick:()=>{this.put(def,keys.filter((_,i)=>i!==index));this.renderRows();}},'×');
        bindings.append(h('span',{class:'shortcut-chip'},edit,remove));
      });
      if(!keys.length)bindings.append(h('span',{class:'shortcut-unassigned'},'Не назначено'));
      bindings.append(h('button',{class:'shortcut-add',title:'Добавить сочетание','aria-label':`Добавить: ${def.title}`,onclick:()=>this.record(def,-1)},icon('plus')));
      if(this.changed(def))bindings.append(h('button',{class:'shortcut-default',title:'Вернуть стандартные для этого действия','aria-label':`Сбросить: ${def.title}`,onclick:()=>this.resetOne(def)},icon('undo')));
      const title=h('div',{class:'shortcut-title'},def.title,this.changed(def)?h('span',{class:'shortcut-changed',title:'Изменено'},'•'):null);
      this.rows.append(h('div',{class:'shortcut-row','data-shortcut-id':def.id},h('div',{},title,h('p',{},def.description||SHORTCUT_GROUPS[def.group as keyof typeof SHORTCUT_GROUPS])),bindings));
    }
    if(!list.length)this.rows.append(h('p',{class:'shortcut-empty'},'Ничего не найдено. Попробуйте другое название или сочетание.'));
    this.rows.scrollTop=scroll;
    const count=this.app.actions.list().filter(d=>this.changed(d)).length;
    this.status.textContent=count?`Изменено действий: ${count}`:'Нажмите сочетание, чтобы изменить его.';
  }
  private record(def:ActionDef,index:number):void {
    this.recording={def,index,combo:''};this.body.inert=true;this.save.disabled=true;this.editor.classList.add('recording');this.editor.hidden=false;this.renderRecording();
  }
  private capture=(e:KeyboardEvent):void=>{
    if(!this.open||!this.recording)return;
    e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
    const {def}=this.recording;
    if(modifierName(e.code)){
      if(def.kind==='modifier'||def.kind==='hold')this.recording.combo=normalizeCombo([modifierCombo(e),modifierName(e.code)].filter(Boolean).join('+').split('+').filter((m,i,a)=>a.indexOf(m)===i).join('+'));
    }else this.recording.combo=comboOf(e);
    this.renderRecording();
  };
  private renderRecording():void {
    const record=this.recording!;const {def,combo}=record;
    const valid=validCombo(combo,def.kind),conflicts=valid?this.app.actions.conflicts(def.id,combo,this.draft):[];
    const heading=h('h3',{},def.title);
    const instruction=def.kind==='modifier'?'Нажмите Ctrl, Alt, Shift или Cmd; можно несколько вместе.':'Нажмите нужное сочетание. Esc, Tab и Enter тоже можно назначить.';
    const display=h('div',{class:'shortcut-recorded','data-recorded':combo},combo?comboLabel(combo):'Нажмите клавиши…');
    const message=combo&&!valid?(def.kind==='modifier'?'Для этого жеста нужны только модификаторы.':'Это сочетание недоступно. Нажмите другую клавишу.'):conflicts.length?`Уже назначено: ${conflicts.map(d=>d.title).join('; ')}. Переназначение уберёт это сочетание у перечисленных действий.`:'Прежнее назначение изменится только после сохранения настроек.';
    const apply=h('button',{class:'btn primary',disabled:!valid,onclick:()=>{
      for(const other of conflicts)this.put(other,this.keys(other).filter(k=>normalizeCombo(k)!==normalizeCombo(combo)));
      const keys=[...this.keys(def)];if(record.index<0)keys.push(combo);else keys[record.index]=combo;
      this.put(def,keys);this.endEditor();this.renderRows();
    }},conflicts.length?'Переназначить':'Назначить');
    const cancel=h('button',{class:'btn',onclick:()=>this.endEditor()},'Отмена записи');
    this.editor.replaceChildren(h('div',{class:'shortcut-recording-content'},heading,h('p',{},instruction),display,h('p',{class:conflicts.length?'shortcut-conflict':''},message)),h('div',{class:'shortcut-editor-buttons'},cancel,apply));
    this.editor.tabIndex=-1;this.editor.focus();
  }
  private endEditor():void {this.recording=null;this.editor.hidden=true;this.editor.classList.remove('recording');this.body.inert=false;this.save.disabled=false;this.search.focus();}
  private resetAll():void {
    this.recording=null;
    this.body.inert=true;this.save.disabled=true;this.editor.hidden=false;
    this.editor.replaceChildren(h('h3',{},'Вернуть все стандартные сочетания?'),h('p',{},'Изменения останутся черновиком, пока вы не нажмёте «Сохранить».'),h('div',{class:'shortcut-editor-buttons'},
      h('button',{class:'btn',onclick:()=>this.endEditor()},'Отмена'),h('button',{class:'btn primary',onclick:()=>{this.draft={};this.endEditor();this.renderRows();}},'Вернуть стандартные')));
  }
  private resetOne(def:ActionDef):void {
    const conflicts=def.keys.flatMap(key=>this.app.actions.conflicts(def.id,key,this.draft).map(other=>({other,key})));
    if(!conflicts.length){delete this.draft[def.id];this.renderRows();return;}
    this.body.inert=true;this.save.disabled=true;this.editor.hidden=false;
    this.editor.replaceChildren(h('h3',{},`Стандартные: ${def.title}`),h('p',{},`Эти клавиши сейчас заняты: ${[...new Set(conflicts.map(c=>c.other.title))].join('; ')}.`),h('div',{class:'shortcut-editor-buttons'},
      h('button',{class:'btn',onclick:()=>this.endEditor()},'Отмена'),h('button',{class:'btn primary',onclick:()=>{
        for(const {other,key} of conflicts)this.put(other,this.keys(other).filter(k=>normalizeCombo(k)!==normalizeCombo(key)));
        delete this.draft[def.id];this.endEditor();this.renderRows();
      }},'Вернуть и переназначить')));
  }
  private async commit():Promise<void> {
    if(this.recording||this.busy)return;this.busy=true;this.save.disabled=true;
    try{await this.app.applyShortcuts(this.draft);this.busy=false;this.close();this.app.hud.toast('Сочетания клавиш сохранены');}
    catch(error){this.status.textContent=`Не удалось сохранить: ${String(error)}`;this.busy=false;this.save.disabled=false;}
  }
  private close():void {
    if(this.busy)return;this.recording=null;window.removeEventListener('keydown',this.capture,true);
    this.dialog?.close();this.dialog?.remove();this.dialog=null;this.app.input.clearModifiers();
  }
}
