// Широкий допуск клика в M и Cmd+клика: экранные пиксели при любом виде.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
app.settings.snapToGrid=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.selectTool('line',false);Object.assign(app.settings.line,{width:.5,dashed:false});
await test.pen([[260,300,.5],[740,300,.5]],1);
app.selectTool('pen',false);Object.assign(app.settings.pen,{width:1,dashed:false});
await test.pen([[260,450,.5],[500,450,.5],[740,450,.5]],1);
const objects=[...app.doc.values()],history=app.history.state;
let checks=0;
for(const o of objects)for(const scale of [.5,1,2])for(const rotSteps of [0,2])for(const cmd of [false,true]){
  app.view.restore({x:500,y:o.oy,scale,rotSteps});
  const p=app.view.toScreen(500,o.oy),a=app.view.toScreen(0,0),b=app.view.toScreen(0,1),len=Math.hypot(b.x-a.x,b.y-a.y);
  for(const distance of [22,-22,32]){
    app.selectTool('select',false);app.selection.show(null);if(cmd)app.selectTool('pen',false);
    const x=p.x+(b.x-a.x)/len*distance,y=p.y+(b.y-a.y)/len*distance,mods={metaKey:cmd};
    test.pointer('pointerdown',x,y,.5,'mouse',mods);test.pointer('pointerup',x,y,0,'mouse',mods);
    assert(distance===32?!app.selection.selected:app.selection.selected?.id===o.id,`допуск: ${o.shape?.kind??'перо'}, масштаб ${scale}, поворот ${rotSteps}, Cmd ${cmd}, отступ ${distance}`);
    assert(app.history.state===history,'выбор без движения не меняет историю');checks++;
  }
}
app.view.restore({x:500,y:375,scale:1,rotSteps:0});app.selection.show(objects[0]);await test.idle();await test.shot('wide-hit');
return {ok:true,checks};
