// Настоящее закрытие окна проходит через обработчик несохранённых изменений.
const { app, test } = window.__phaint;
if (app.doc.size || app.files.dirty) throw new Error('После обычного сохранения запуск должен быть пустым');
await test.pen([[180,180,.2],[250,190,.9],[320,180,.4]],8);
await app.files.backup();
await window.phaintNative.testFiles('choices',{choices:{unsaved:['cancel']}});
await window.phaintNative.testFiles('close');
await test.sleep(100);
if (!app.files.dirty || app.doc.size !== 1) throw new Error('Отмена закрытия потеряла рисунок');
await window.phaintNative.testFiles('choices',{choices:{unsaved:['save'],saves:[null]}});
await window.phaintNative.testFiles('close');
await test.sleep(100);
if (!app.files.dirty || app.doc.size !== 1) throw new Error('Отмена сохранения закрыла окно');
await window.phaintNative.testFiles('choices',{choices:{unsaved:['save'],saves:['при-закрытии.svg']}});
await window.phaintNative.testFiles('close');
// При успешном закрытии сам процесс завершится, а runner проверит SVG и отсутствие автокопии.
await new Promise(() => {});
