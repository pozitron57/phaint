// Новое окно сдвигается от активного холста; у края экрана каскад начинается заново.
interface Bounds { x:number; y:number; width:number; height:number }
const OFFSET=24;

export function cascadeBounds(previous:Bounds,workArea:Bounds,width:number,height:number):Bounds {
  width=Math.min(width,workArea.width);height=Math.min(height,workArea.height);
  const maxX=workArea.x+workArea.width-width,maxY=workArea.y+workArea.height-height;
  const x=previous.x+OFFSET,y=previous.y+OFFSET;
  return {x:x>maxX||x<workArea.x?workArea.x:x,y:y>maxY||y<workArea.y?workArea.y:y,width,height};
}
