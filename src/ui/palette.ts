// Быстрый выбор трёх цветов и полная палитра с запоминаемым произвольным цветом.
import type { App } from '../app.ts';
import { CYCLE } from '../core/settings.ts';
import { h, icon } from './dom.ts';
const NAMES=['Синий','Зелёный','Красный','Чёрный','Белый','Оранжевый','Фиолетовый'];
export class Palette {
  readonly el:HTMLElement;
  private app:App;
  private buttons:HTMLButtonElement[]=[];
  private label:HTMLElement;
  private timer=0;
  private full=false;
  constructor(app:App){
    this.app=app;this.label=h('span');
    this.el=h('aside',{class:'palette',hidden:true,'aria-label':'Цвет'},h('div',{class:'palette-label'},this.label));
    const row=h('div',{class:'palette-colors'});
    app.settings.palette.forEach((color,i)=>{const b=h('button',{class:'color-btn',title:NAMES[i],'aria-label':NAMES[i],onclick:()=>{app.chooseColor(color);this.hide();b.blur();}});b.style.setProperty('--color',color);row.append(b);this.buttons.push(b);});
    const custom=h('input',{type:'color',title:'Другой цвет',class:'custom-color'});custom.addEventListener('input',()=>{app.settings.customColor=custom.value;app.chooseColor(custom.value);this.sync();});
    row.append(h('label',{class:'custom-picker',title:'Другой цвет'},icon('plus'),custom));this.el.append(row);
    window.addEventListener('pointerdown',e=>{if(this.open&&e.target instanceof Node&&!this.el.contains(e.target)&&!(e.target instanceof Element&&e.target.closest('[data-action="color.menu"]')))this.hide();});
    window.addEventListener('blur',()=>this.hide());
  }
  get open():boolean{return !this.el.hidden;}
  toggle():void {if(this.open&&this.full){this.hide();return;}this.full=true;this.el.hidden=false;window.clearTimeout(this.timer);this.sync();}
  advance(direction=1):void {
    const at=CYCLE.indexOf(this.app.currentColor),next=at<0?(direction>0?0:2):(at+direction+3)%3;
    this.pick(CYCLE[next]);
  }
  pick(color:string):void {
    this.app.chooseColor(color);this.full=false;this.el.hidden=false;this.sync();
    window.clearTimeout(this.timer);this.timer=window.setTimeout(()=>this.hide(),1000);
  }
  sync():void {
    const at=this.app.settings.palette.indexOf(this.app.currentColor);
    (this.el.querySelector('.palette-label') as HTMLElement).hidden=!this.full;
    this.buttons.forEach((b,i)=>{b.hidden=!this.full&&i>=3;b.classList.toggle('selected',i===at);b.setAttribute('aria-pressed',String(i===at));});
    (this.el.querySelector('.custom-picker') as HTMLElement).hidden=!this.full;
    const custom=this.el.querySelector('input') as HTMLInputElement;
    custom.value=this.app.settings.customColor;
    const picker=this.el.querySelector('.custom-picker') as HTMLElement;
    picker.style.backgroundColor=custom.value;
    const rgb=custom.value.slice(1).match(/../g)!.map(n=>parseInt(n,16));
    picker.style.color=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114<140?'white':'#353942';
    this.label.textContent=at<0?'Другой цвет':NAMES[at];
  }
  hide():void{window.clearTimeout(this.timer);this.el.hidden=true;}
}
