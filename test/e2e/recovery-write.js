// Завершаемся через тестовый app.exit без штатного закрытия: имитация аварийного завершения.
const { app, test } = window.__phaint;
await test.pen([[180,180,.2],[250,190,.9],[320,180,.4]],8);
await app.files.backup();
if (!(await app.platform.files.recoveryRead())) throw new Error('Нет резервной копии');
return { objects:app.doc.size, dirty:app.files.dirty };
