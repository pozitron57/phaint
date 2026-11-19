// Готовые слои над редактируемой фигурой, независимо от числа объектов и маркеров.
// source-over и multiply над непрозрачным фоном дают цвет A·фон+B. Два пробных
// изображения (чёрное/белое основание) сохраняют порядок смешивания в двух холстах.
// Во время жеста возможна разница округления в единицы RGB; после него плитка
// дорисовывается обычным способом. Геометрия, документ и экспорт не меняются.
import type { Mat } from '../core/geom.ts';
import type { Obj } from '../core/types.ts';
import { drawObj } from './draw.ts';

export class TileOverlay {
  private color:HTMLCanvasElement;
  private factor:HTMLCanvasElement|null;
  private release:(canvas:HTMLCanvasElement|null)=>void;
  constructor(acquire:()=>HTMLCanvasElement,release:(canvas:HTMLCanvasElement|null)=>void,multiply:boolean){
    this.release=release;this.color=acquire();this.factor=multiply?acquire():null;
    if(this.factor)for(const [canvas,color] of [[this.color,'black'],[this.factor,'white']] as const){
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  }
  get canvases():number{return this.factor?2:1;}
  draw(o:Obj,D:Mat,x:number,y:number):void {
    drawObj(this.color.getContext('2d',{willReadFrequently:true})!,o,D,x,y);
    if(this.factor)drawObj(this.factor.getContext('2d',{willReadFrequently:true})!,o,D,x,y);
  }
  flush():void {
    this.color.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,1,1);
    this.factor?.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,1,1);
  }
  finish():void {
    if(!this.factor)return;
    const ctx=this.factor.getContext('2d',{willReadFrequently:true})!,w=this.factor.width,h=this.factor.height;
    const white=ctx.getImageData(0,0,w,h),black=this.color.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,w,h).data;
    for(let i=0;i<white.data.length;i+=4)for(let c=0;c<3;c++)white.data[i+c]=Math.max(0,white.data[i+c]-black[i+c]);
    ctx.putImageData(white,0,0);
  }
  paint(ctx:CanvasRenderingContext2D):void {
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    if(this.factor){ctx.globalCompositeOperation='multiply';ctx.drawImage(this.factor,0,0);ctx.globalCompositeOperation='lighter';}
    else ctx.globalCompositeOperation='source-over';
    ctx.drawImage(this.color,0,0);ctx.restore();
  }
  dispose():void {this.release(this.color);this.release(this.factor);}
}
