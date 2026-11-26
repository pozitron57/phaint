// Настройки клавиш: черновик до сохранения, запись нажатием, явное разрешение конфликтов.
import { language, t, type Language } from '../core/language.ts';
import { translate } from '../core/menu-text.ts';
import type { App } from '../app.ts';
import { comboLabel, comboOf, modifierCombo, modifierName, normalizeCombo, shortcutSearchBindings, validCombo, type ActionDef } from '../core/actions.ts';
import { SHORTCUT_GROUPS } from '../core/shortcut-info.ts';
import { h, icon } from './dom.ts';
import { colorCycleEditor } from './color-cycle.ts';

export class ShortcutSettings {
  private app:App;
  private dialog:HTMLDialogElement|null=null;
  private draft:Record<string,string[]>={};
  private colors:string[]=[];
  private section:'keys'|'colors'='keys';
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
  private languageChoice?:Language;
  private recording:{def:ActionDef;index:number;combo:string}|null=null;
  constructor(app:App){this.app=app;}
  get open():boolean {return !!this.dialog?.open;}
  show():void {
    if(this.open){if(this.section==='keys')this.search.focus();return;}
    this.app.input.finishCurrent();this.app.closePanels();this.app.input.clearModifiers();
    this.draft=structuredClone(this.app.settings.keys);this.group='all';this.filter='';this.changedOnly=false;
    this.colors=[...this.app.settings.colorCycle];this.section='keys';
    this.languageChoice=undefined;
    this.buildDialog();
  }
  /** Из соседнего окна может прийти новый язык, пока пользователь правит черновик. */
  refreshLanguage():void {
    if(!this.open||this.busy)return;
    const recording=this.recording,scroll=this.rows.scrollTop;
    this.close();
    this.buildDialog();
    this.rows.scrollTop=scroll;
    if(recording) {
      const def=this.app.actions.list().find(action=>action.id===recording.def.id);
      if(def) { this.record(def,recording.index);this.recording!.combo=recording.combo;this.renderRecording(); }
    }
  }
  private buildDialog():void {
    const dialog=h('dialog',{class:'shortcut-dialog','aria-label':translate('Настройки')});this.dialog=dialog;
    const title=h('h2',{},translate('Настройки'));
    const close=h('button',{class:'shortcut-close',title:translate('Закрыть без сохранения'),'aria-label':translate('Закрыть без сохранения'),onclick:()=>this.close()},icon('close'));
    const select=h('select',{onchange:()=>{this.languageChoice=select.value as Language;}},
      h('option',{value:'ru',lang:'ru'},'Русский'),h('option',{value:'en',lang:'en'},'English'));
    select.value=this.languageChoice??language;
    const languages=h('label',{class:'settings-language'},translate('Язык'),select);
    dialog.append(h('header',{class:'shortcut-header'},title,languages,close));
    this.search=h('input',{type:'search',value:this.filter,placeholder:translate('Найти действие или сочетание…'),'aria-label':translate('Поиск сочетаний'),oninput:()=>{this.filter=this.search.value;this.rows.scrollTop=0;this.renderRows();}});
    const changed=h('input',{type:'checkbox',checked:this.changedOnly,onchange:()=>{this.changedOnly=changed.checked;this.rows.scrollTop=0;this.renderRows();}});
    const filters=h('div',{class:'shortcut-filters'},this.search,h('label',{},changed,translate('Только изменённые')));
    const nav=h('nav',{'aria-label':translate('Группы действий'),class:'shortcut-nav'});
    for(const [id,label] of Object.entries({all:'Все действия',...SHORTCUT_GROUPS})){
      const count=id==='all'?this.app.actions.list().length:this.app.actions.list().filter(d=>d.group===id).length;
      const button=h('button',{'data-group':id,'aria-pressed':String(id===this.group),onclick:()=>{
        this.group=id;for(const el of nav.querySelectorAll('button'))el.setAttribute('aria-pressed',String(el===button));this.rows.scrollTop=0;this.renderRows();
      }},translate(label),h('span',{},String(count)));nav.append(button);
    }
    this.rows=h('div',{class:'shortcut-rows','aria-label':translate('Назначения клавиш')});
    const table=h('section',{class:'shortcut-table'},h('div',{class:'shortcut-columns'},h('span',{},translate('Действие')),h('span',{},translate('Сочетания клавиш'))),this.rows);
    const layout=h('div',{class:'shortcut-layout'},nav,table);
    const colors=colorCycleEditor(this.colors);
    const sections=h('nav',{class:'settings-sections','aria-label':translate('Настройки')});
    this.body=h('div',{class:'shortcut-body'},sections,filters,layout,colors);
    this.editor=h('section',{class:'shortcut-editor',hidden:true,'aria-live':'polite'});
    this.status=h('span',{class:'shortcut-status','aria-live':'polite'},translate('Нажмите сочетание в списке, чтобы изменить его.'));
    const reset=h('button',{class:'btn shortcut-reset',onclick:()=>this.resetAll()},translate('Вернуть стандартные'));
    const cancel=h('button',{class:'btn',onclick:()=>this.close()},translate('Отмена'));
    this.save=h('button',{class:'btn primary',onclick:()=>{void this.commit();}},translate('Сохранить'));
    const note=h('p',{class:'shortcut-note'},translate('Клавиши работают в любой раскладке. В текстовых полях сохраняются обычные команды редактирования.'));
    for(const [id,label] of [['keys','Клавиши и сочетания'],['colors','Цвета Tab']] as const){
      sections.append(h('button',{type:'button','data-section':id,onclick:()=>{this.section=id;showSection();}},translate(label)));
    }
    const showSection=():void=>{
      const editingColors=this.section==='colors';
      for(const button of sections.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.section===this.section));
      filters.hidden=layout.hidden=note.hidden=reset.hidden=this.status.hidden=editingColors;
      colors.hidden=!editingColors;
    };
    showSection();
    dialog.append(this.body,this.editor,note,
      h('footer',{},h('div',{class:'shortcut-footer-left'},reset,this.status),cancel,this.save));
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(!this.editor.hidden)this.endEditor();else this.close();});
    window.addEventListener('keydown',this.capture,true);
    document.body.append(dialog);this.renderRows();dialog.showModal();
    if(this.section==='keys')this.search.focus();else sections.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();
  }
  private keys(def:ActionDef):string[]{return this.draft[def.id]??def.keys;}
  private changed(def:ActionDef):boolean {return JSON.stringify(this.keys(def).map(normalizeCombo))!==JSON.stringify(def.keys.map(normalizeCombo));}
  private put(def:ActionDef,keys:string[]):void {
    const normalized=[...new Set(keys.map(normalizeCombo))];
    if(JSON.stringify(normalized)===JSON.stringify(def.keys.map(normalizeCombo)))delete this.draft[def.id];else this.draft[def.id]=normalized;
  }
  private renderRows():void {
    const scroll=this.rows.scrollTop;
    this.rows.replaceChildren();
    for(const def of this.app.actions.list()){
      if((this.group!=='all'&&def.group!==this.group)||(this.changedOnly&&!this.changed(def)))continue;
      const keys=this.keys(def),description=[def.title,def.description,translate(SHORTCUT_GROUPS[def.group as keyof typeof SHORTCUT_GROUPS]??'')].join(' ');
      const visible=shortcutSearchBindings(keys,description,this.filter);
      if(visible===null)continue;
      const bindings=h('div',{class:'shortcut-bindings'});
      for(const key of visible){
        const index=keys.indexOf(key);
        const edit=h('button',{class:'shortcut-key','aria-label':t(`Изменить: ${def.title} — ${comboLabel(key)}`,`Change ${def.title} — ${comboLabel(key)}`),onclick:()=>this.record(def,index)},comboLabel(key));
        const remove=h('button',{class:'shortcut-key-remove',title:translate('Убрать сочетание'),'aria-label':t(`Убрать ${comboLabel(key)} у «${def.title}»`,`Remove ${comboLabel(key)} from ${def.title}`),onclick:()=>{this.put(def,keys.filter((_,i)=>i!==index));this.renderRows();}},'×');
        bindings.append(h('span',{class:'shortcut-chip'},edit,remove));
      }
      if(!keys.length)bindings.append(h('span',{class:'shortcut-unassigned'},translate('Не назначено')));
      bindings.append(h('button',{class:'shortcut-add',title:translate('Добавить сочетание'),'aria-label':t(`Добавить: ${def.title}`,`Add shortcut for ${def.title}`),onclick:()=>this.record(def,-1)},icon('plus')));
      if(this.changed(def))bindings.append(h('button',{class:'shortcut-default',title:translate('Вернуть стандартные для этого действия'),'aria-label':t(`Сбросить: ${def.title}`,`Reset ${def.title}`),onclick:()=>this.resetOne(def)},icon('undo')));
      const title=h('div',{class:'shortcut-title'},def.title,this.changed(def)?h('span',{class:'shortcut-changed',title:translate('Изменено')},'•'):null);
      this.rows.append(h('div',{class:'shortcut-row','data-shortcut-id':def.id},h('div',{},title,h('p',{},def.description||translate(SHORTCUT_GROUPS[def.group as keyof typeof SHORTCUT_GROUPS]??''))),bindings));
    }
    if(!this.rows.childElementCount)this.rows.append(h('p',{class:'shortcut-empty'},translate('Ничего не найдено. Попробуйте другое название или сочетание.')));
    this.rows.scrollTop=scroll;
    const count=this.app.actions.list().filter(d=>this.changed(d)).length;
    this.status.textContent=count?t(`Изменено действий: ${count}`,`Modified actions: ${count}`):translate('Нажмите сочетание, чтобы изменить его.');
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
    const instruction=def.kind==='modifier'?translate('Нажмите Ctrl, Alt, Shift или Cmd; можно несколько вместе.'):translate('Нажмите нужное сочетание. Esc, Tab и Enter тоже можно назначить.');
    const display=h('div',{class:'shortcut-recorded','data-recorded':combo},combo?comboLabel(combo):translate('Нажмите клавиши…'));
    const message=combo&&!valid?(def.kind==='modifier'?translate('Для этого жеста нужны только модификаторы.'):translate('Это сочетание недоступно. Нажмите другую клавишу.')):conflicts.length?t(`Уже назначено: ${conflicts.map(d=>d.title).join('; ')}. Переназначение уберёт это сочетание у перечисленных действий.`,`Already assigned to ${conflicts.map(d=>d.title).join(', ')}. Reassigning removes the shortcut from those actions.`):translate('Прежнее назначение изменится только после сохранения настроек.');
    const apply=h('button',{class:'btn primary',disabled:!valid,onclick:()=>{
      for(const other of conflicts)this.put(other,this.keys(other).filter(k=>normalizeCombo(k)!==normalizeCombo(combo)));
      const keys=[...this.keys(def)];if(record.index<0)keys.push(combo);else keys[record.index]=combo;
      this.put(def,keys);this.endEditor();this.renderRows();
    }},conflicts.length?translate('Переназначить'):translate('Назначить'));
    const cancel=h('button',{class:'btn',onclick:()=>this.endEditor()},translate('Отмена записи'));
    this.editor.replaceChildren(h('div',{class:'shortcut-recording-content'},heading,h('p',{},instruction),display,h('p',{class:conflicts.length?'shortcut-conflict':''},message)),h('div',{class:'shortcut-editor-buttons'},cancel,apply));
    this.editor.tabIndex=-1;this.editor.focus();
  }
  private endEditor():void {this.recording=null;this.editor.hidden=true;this.editor.classList.remove('recording');this.body.inert=false;this.save.disabled=false;this.search.focus();}
  private resetAll():void {
    this.recording=null;
    this.body.inert=true;this.save.disabled=true;this.editor.hidden=false;
    this.editor.replaceChildren(h('h3',{},translate('Вернуть все стандартные сочетания?')),h('p',{},translate('Изменения останутся черновиком, пока вы не нажмёте «Сохранить».')),h('div',{class:'shortcut-editor-buttons'},
      h('button',{class:'btn',onclick:()=>this.endEditor()},translate('Отмена')),h('button',{class:'btn primary',onclick:()=>{this.draft={};this.endEditor();this.renderRows();}},translate('Вернуть стандартные'))));
  }
  private resetOne(def:ActionDef):void {
    const conflicts=def.keys.flatMap(key=>this.app.actions.conflicts(def.id,key,this.draft).map(other=>({other,key})));
    if(!conflicts.length){delete this.draft[def.id];this.renderRows();return;}
    this.body.inert=true;this.save.disabled=true;this.editor.hidden=false;
    this.editor.replaceChildren(h('h3',{},t(`Стандартные: ${def.title}`,`Defaults for ${def.title}`)),h('p',{},t(`Эти клавиши сейчас заняты: ${[...new Set(conflicts.map(c=>c.other.title))].join('; ')}.`,`These keys are assigned to ${[...new Set(conflicts.map(c=>c.other.title))].join(', ')}.`)),h('div',{class:'shortcut-editor-buttons'},
      h('button',{class:'btn',onclick:()=>this.endEditor()},translate('Отмена')),h('button',{class:'btn primary',onclick:()=>{
        for(const {other,key} of conflicts)this.put(other,this.keys(other).filter(k=>normalizeCombo(k)!==normalizeCombo(key)));
        delete this.draft[def.id];this.endEditor();this.renderRows();
      }},translate('Вернуть и переназначить'))));
  }
  private async commit():Promise<void> {
    if(this.recording||this.busy)return;this.busy=true;this.save.disabled=true;
    try{await this.app.applyShortcuts(this.draft,this.languageChoice,this.colors);this.busy=false;this.close();this.app.hud.toast(translate('Настройки сохранены'));}
    catch(error){this.status.hidden=false;this.status.textContent=t(`Не удалось сохранить: ${String(error)}`,`Could not save settings: ${String(error)}`);this.busy=false;this.save.disabled=false;}
  }
  private close():void {
    if(this.busy)return;this.recording=null;window.removeEventListener('keydown',this.capture,true);
    this.dialog?.close();this.dialog?.remove();this.dialog=null;this.app.input.clearModifiers();
  }
}
