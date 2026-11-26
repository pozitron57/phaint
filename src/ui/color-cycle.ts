// Редактор порядка цветов Tab. Меняет черновик окна настроек до нажатия «Сохранить».
import { DEFAULT_COLOR_CYCLE, PALETTE } from '../core/settings.ts';
import { translate } from '../core/menu-text.ts';
import { h } from './dom.ts';

export function colorCycleEditor(colors:string[]):HTMLElement {
  const list=h('ol',{class:'color-cycle-list','aria-label':translate('Цвета Tab')});
  const render=(focus?:number,control='input'):void=>{
    list.replaceChildren(...colors.map((color,index)=>{
      const name=translate('Цвет')+' '+(index+1);
      const hex=h('span',{class:'color-cycle-hex'},color.toUpperCase());
      const input=h('input',{type:'color',value:color,'aria-label':name,title:name,oninput:()=>{
        colors[index]=input.value;hex.textContent=input.value.toUpperCase();
      }});
      const move=(offset:number):void=>{
        const target=index+offset;
        [colors[index],colors[target]]=[colors[target],colors[index]];
        const canContinue=target+offset>=0&&target+offset<colors.length;
        render(target,canContinue?(offset<0?'.cycle-up':'.cycle-down'):'input');
      };
      const controlButton=(label:string,symbol:string,cls:string,disabled:boolean,action:()=>void)=>
        h('button',{type:'button',class:cls,title:translate(label),'aria-label':name+' · '+translate(label),disabled,onclick:action},symbol);
      return h('li',{},h('label',{},input,hex),h('div',{class:'color-cycle-controls'},
        controlButton('Выше','↑','cycle-up',index===0,()=>move(-1)),
        controlButton('Ниже','↓','cycle-down',index===colors.length-1,()=>move(1)),
        controlButton('Удалить цвет','×','cycle-remove',colors.length===1,()=>{
          colors.splice(index,1);render(Math.min(index,colors.length-1));
        })));
    }));
    if(focus!==undefined)list.children[focus]?.querySelector<HTMLElement>(control)?.focus();
  };
  const add=h('button',{type:'button',class:'btn cycle-add',onclick:()=>{
    colors.push(PALETTE.find(color=>!colors.includes(color))??'#808080');render(colors.length-1);
  }},translate('Добавить цвет'));
  const reset=h('button',{type:'button',class:'btn cycle-reset',onclick:()=>{
    colors.splice(0,colors.length,...DEFAULT_COLOR_CYCLE);render();
  }},translate('Вернуть стандартные цвета'));
  render();
  return h('section',{class:'color-cycle-editor'},list,h('div',{class:'color-cycle-actions'},add,reset));
}
