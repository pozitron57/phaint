// Быстрый показ цикла Tab и полная палитра с запоминаемым произвольным цветом.
import { t } from '../core/language.ts';
import type { App } from '../app.ts';
import { PALETTE } from '../core/settings.ts';
import { h, icon } from './dom.ts';

const NAMES=['action.color.blue','action.color.green','action.color.red','panel.black','panel.white','panel.orange','panel.purple'] as const;
function colorName(color:string):string {const key=NAMES[PALETTE.indexOf(color)];return key?t(key):color.toUpperCase();}

export class Palette {
  readonly el:HTMLElement;
  private app:App;
  private swatches=h('div',{class:'palette-swatches'});
  private shown:string[]=[];
  private label=h('div',{class:'palette-label'});
  private custom=h('input',{type:'color',class:'custom-color'});
  private picker=h('label',{class:'custom-picker'},icon('plus'),this.custom);
  private timer=0;
  private full=false;
  private cycleIndex=-1;

  constructor(app:App){
    this.app=app;
    this.el=h('aside',{class:'palette',hidden:true},this.label,h('div',{class:'palette-colors'},this.swatches,this.picker));
    this.custom.addEventListener('input',()=>{
      this.cycleIndex=-1;app.settings.customColor=this.custom.value;app.chooseColor(this.custom.value);this.sync();
    });
    this.sync();
    window.addEventListener('pointerdown',e=>{if(this.open&&e.target instanceof Node&&!this.el.contains(e.target)&&!(e.target instanceof Element&&e.target.closest('[data-action="color.menu"]')))this.hide();});
    window.addEventListener('blur',()=>this.hide());
  }
  get open():boolean{return !this.el.hidden;}
  toggle():void {if(this.open&&this.full){this.hide();return;}this.full=true;this.el.hidden=false;window.clearTimeout(this.timer);this.sync();}

  advance(direction=1):void {
    const cycle=this.app.settings.colorCycle,current=this.app.currentColor.toLowerCase();
    const at=cycle[this.cycleIndex]===current?this.cycleIndex:cycle.indexOf(current);
    const next=at<0?(direction>0?0:cycle.length-1):(at+direction+cycle.length)%cycle.length;
    this.pick(cycle[next],next);
  }
  pick(color:string,cycleIndex=-1):void {
    this.cycleIndex=cycleIndex;
    this.app.chooseColor(color);this.full=false;this.el.hidden=false;this.sync();
    this.swatches.querySelector('.selected')?.scrollIntoView({block:'nearest',inline:'nearest'});
    window.clearTimeout(this.timer);this.timer=window.setTimeout(()=>this.hide(),1000);
  }
  sync():void {
    const settings=this.app.settings,cycle=settings.colorCycle,current=this.app.currentColor.toLowerCase();
    const colors=this.full?[...new Set([...cycle,...settings.palette])]:cycle.includes(current)?cycle:[...cycle,current];
    if(colors.length!==this.shown.length||colors.some((color,i)=>this.shown[i]!==color)){
      this.shown=[...colors];
      this.swatches.replaceChildren(...colors.map(color=>{
        const button=h('button',{class:'color-btn',onclick:()=>{
          this.cycleIndex=-1;this.app.chooseColor(color);this.hide();button.blur();
        }});
        button.style.setProperty('--color',color);
        return button;
      }));
    }
    const selected=!this.full&&cycle[this.cycleIndex]===current?this.cycleIndex:colors.indexOf(current);
    Array.from(this.swatches.children).forEach((el,i)=>{
      const button=el as HTMLButtonElement;
      button.title=colorName(colors[i]);button.setAttribute('aria-label',button.title);
      button.classList.toggle('selected',i===selected);button.setAttribute('aria-pressed',String(i===selected));
    });
    this.el.setAttribute('aria-label',t('panel.color'));
    this.label.hidden=this.picker.hidden=!this.full;
    this.label.textContent=colorName(current);
    this.custom.value=settings.customColor;
    this.custom.title=this.picker.title=t('panel.customColor');
    this.picker.style.backgroundColor=this.custom.value;
    const rgb=this.custom.value.slice(1).match(/../g)!.map(n=>parseInt(n,16));
    this.picker.style.color=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114<140?'white':'#353942';
  }
  hide():void{window.clearTimeout(this.timer);this.el.hidden=true;}
}
