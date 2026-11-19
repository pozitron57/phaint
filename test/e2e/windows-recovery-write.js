// Оба окна заканчиваются аварийно через тестовый app.exit, оставляя разные резервные копии.
const {app,test}=window.__phaint,native=window.phaintNative;
await test.pen([[160,180,.3],[360,220,.8]],4);await app.files.backup();
const second=await native.testWindows('new');
await native.testWindows('eval',{id:second,code:`const {app,test}=window.__phaint;await test.pen([[450,300,.5],[650,360,.9]],4);await test.pen([[450,410,.5],[650,410,.9]],4);await app.files.backup();`});
return {ok:true,windows:2};
