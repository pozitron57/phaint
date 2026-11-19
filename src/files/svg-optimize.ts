// Загружается в DocumentWorker для дополнительного сжатия или записи страниц PDF.
// Общий SVG: два профиля; PDF: отдельная точная запись путей без упрощения геометрии.
import { optimize } from 'svgo/dist/svgo.browser.js';
import { utf8Size, type SvgResult } from './file-stats.ts';
export {vectorizeEraserMasks} from './svg-eraser.ts';

/** Только запись путей, созданных PDF-конвертером: без применения матриц,
 * упрощения кривых и обычного округления до 3 знаков. 12 знаков подавляют
 * арифметический шум при переходе в относительные координаты (исходник — Float32).
 * Параметры фигур Phaint сюда не попадают; metadata формируется после обработки. */
export function compactPdfSvg(text:string):string {
  try{
    const result=optimize(text,{plugins:['removeEditorsNSData','cleanupAttrs',{
      name:'convertPathData',params:{floatPrecision:12,applyTransforms:false,makeArcs:{threshold:0,tolerance:0},
        straightCurves:false,convertToQ:false,convertToZ:false,curveSmoothShorthands:false,removeUseless:false},
    },{
      // stringifyPathData в SVGO 3 склеивает «-.15 8e-7» в «-.158e-7».
      // Берём рассчитанную геометрию и записываем числа с явными разделителями.
      name:'safePdfPathNumbers',fn:()=>({element:{enter(node){
        if(node.name!=='path'||!node.attributes.d)return;
        const path=(node as typeof node & {pathJS?:Array<{command:string;args:number[]}>}).pathJS;
        if(!path)throw new Error('Не найдена геометрия пути PDF.');
        let previous='',last='';
        node.attributes.d=path.map(({command,args})=>{
          const prefix=previous===command&&!/[mz]/i.test(command)?'':command;
          if(prefix)last='';previous=command;
          const numbers=args.map(n=>{
            if(!Number.isFinite(n))throw new Error('Неверные координаты PDF.');
            const text=String(Number(n.toFixed(12))).replace(/^0\./,'.').replace(/^-0\./,'-.');
            // Разделитель выбирается по записи чисел, а не по их величине:
            // .15 и 8e-7 обязательно разделяем; .15 и .2 разделяет сама точка.
            const space=last&&text[0]!=='-'&&!(text[0]==='.'&&last.includes('.')&&!/[eE]/.test(last))?' ':'';
            last=text;return space+text;
          }).join('');
          return prefix+numbers;
        }).join('');
      }}}),
    }]}).data;
    return utf8Size(result)<utf8Size(text)?result:text;
  }catch{return text;}
}

export function optimizeSvg(text:string,precision:number,preserveGeometry=false):SvgResult {
  const before=utf8Size(text);let candidate:string|undefined,after=Infinity,error='';
  for(const keepTransforms of preserveGeometry?[true]:[false,true]){
    try{
      const next=optimize(text,{multipass:true,floatPrecision:Math.max(3,precision),plugins:[{name:'preset-default',params:{overrides:{
        removeViewBox:false,
        // У защищённых контуров уже проверена местная ошибка. Повторное округление,
        // замена Безье дугами или применение матриц отменили бы эту проверку.
        ...(preserveGeometry?{convertPathData:false,convertTransform:false,cleanupNumericValues:false,mergePaths:false,moveGroupAttrsToElems:false}
          :keepTransforms?{convertPathData:{applyTransforms:false},convertTransform:false}:{}),
      }}}]}).data;
      const bytes=utf8Size(next);if(bytes<after){candidate=next;after=bytes;}
    }catch(e){error=e instanceof Error?e.message:String(e);}
  }
  const used=candidate!==undefined&&after<before;
  return {text:used?candidate!:text,processing:{name:'SVGO',before,after:candidate===undefined?null:after,used,
    ...(candidate===undefined?{error}:{}),
  }};
}
