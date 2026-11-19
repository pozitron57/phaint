const { app } = window.__phaint;
if (app.doc.size || app.files.dirty || app.files.file) throw new Error('При запуске открыт прошлый документ');
if (await app.platform.files.recoveryRead() !== null) throw new Error('После штатного закрытия осталась резервная копия');
return { empty:true };
