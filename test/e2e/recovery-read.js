const { app, test } = window.__phaint;
if (app.doc.size !== 1 || !app.files.dirty || app.files.file !== null) throw new Error('Восстановление не вернуло несохранённый рисунок');
await window.phaintNative.testFiles('choices',{choices:{saves:['восстановленный.svg']}});
if (!await app.files.save() || app.files.dirty || await app.platform.files.recoveryRead() !== null) throw new Error('Восстановленный рисунок не сохранился');
await test.idle(); await test.shot('restored');
return { objects:app.doc.size, file:app.files.file.name };
