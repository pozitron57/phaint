// Нативная часть Phaint для macOS — то, чего нет в API Electron. Собирается в dist/phaint_native.node
// (scripts/build-native.mjs), загружается главным процессом (electron/main.ts).
//
//   setPresentation(hide)   полностью спрятать строку меню и Dock, а не «автоскрытие»: в полноэкранном
//                           режиме ничего не выезжает, когда перо у края экрана
//   getPresentation()       текущие NSApplicationPresentationOptions (число)
//   setMouseCoalescing(on)  склейка событий мыши. Выключаем: тогда доходят все отсчёты планшета
//                           (у Wacom около 133 в секунду), а не один на кадр
//   startTabletMonitor()    считать сырые события пера — для отладочной панели
//   tabletStats()           что пришло от системы за последний штрих
//   clipboardImage()        PNG из буфера и логический размер NSImage с учётом Retina
//   prepareFileDialogs()    заранее создать системную файловую панель, без показа окна
//   syncWindowTitlebar(handle) убрать заголовок в полном экране, вернуть после выхода
//   windowStyleMask(handle) маска окна для проверки нативного полного экрана
#import <AppKit/AppKit.h>
#include <node_api.h>
#include <string.h>

void InstallTextRecognition(napi_env env,napi_value exports);

static id gMonitor = nil;

static struct {
  int events;      // событий «кнопка нажата / перо ведут» за штрих
  int tablet;      // из них с данными планшета (подтип TabletPoint)
  int pure;        // отдельных событий TabletPoint
  double pmin;
  double pmax;
  double t0;
  double t1;
  int device;      // NSPointingDeviceType из события приближения пера: 1 — перо, 3 — ластик
} gStats = {0, 0, 0, 0, 0, 0, 0, 0};

static napi_value Bool(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

static bool ArgBool(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  bool value = false;
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc > 0) napi_get_value_bool(env, argv[0], &value);
  return value;
}

static napi_value SetPresentation(napi_env env, napi_callback_info info) {
  bool hide = ArgBool(env, info);
  bool ok = true;
  @try {
    NSApplicationPresentationOptions options =
        hide ? (NSApplicationPresentationHideDock | NSApplicationPresentationHideMenuBar) : NSApplicationPresentationDefault;
    [NSApp setPresentationOptions:options];
  } @catch (NSException *e) {
    ok = false;
  }
  return Bool(env, ok);
}

static napi_value GetPresentation(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_double(env, (double)[NSApp presentationOptions], &result);
  return result;
}

// Electron возвращает NSView* в Buffer; указатель приходит только из главного процесса.
static NSWindow *WindowArgument(napi_env env, napi_callback_info info) {
  size_t argc=1; napi_value argv[1];
  napi_get_cb_info(env,info,&argc,argv,NULL,NULL);
  bool buffer=false;
  if(!argc || napi_is_buffer(env,argv[0],&buffer)!=napi_ok || !buffer) return nil;
  void *bytes=NULL,*pointer=NULL; size_t size=0;
  if(napi_get_buffer_info(env,argv[0],&bytes,&size)!=napi_ok || size!=sizeof(pointer)) return nil;
  memcpy(&pointer,bytes,sizeof(pointer));
  return pointer ? [(__bridge NSView *)pointer window] : nil;
}

static napi_value SyncWindowTitlebar(napi_env env, napi_callback_info info) {
  NSWindow *window=WindowArgument(env,info);
  if(!window || !NSThread.isMainThread) return Bool(env,false);
  // Скрытие текста/кнопок оставляет выезжающую плашку AppKit. Убираем сам стиль
  // заголовка, сохраняя FullScreen и отдельный Space. Меняем только ПОСЛЕ перехода:
  // возврат Titled до завершения выхода конфликтует с переносом панели в AppKit.
  NSWindowStyleMask style=window.styleMask;
  NSWindowStyleMask next=(style & NSWindowStyleMaskFullScreen)
      ? style & ~NSWindowStyleMaskTitled : style | NSWindowStyleMaskTitled;
  if(next!=style) window.styleMask=next;
  return Bool(env,true);
}

static napi_value WindowStyleMask(napi_env env, napi_callback_info info) {
  NSWindow *window=WindowArgument(env,info); napi_value result;
  if(window) napi_create_double(env,(double)window.styleMask,&result);
  else napi_get_null(env,&result);
  return result;
}

// Первое создание NSOpenPanel поднимает системный сервис и может занимать около секунды.
// Выполняем один раз параллельно загрузке страницы, до показа основного окна.
static napi_value PrepareFileDialogs(napi_env env, napi_callback_info info) {
  static bool prepared = false;
  CFAbsoluteTime start=CFAbsoluteTimeGetCurrent();
  if(!prepared) {
    @try { @autoreleasepool {
        NSOpenPanel *panel=[NSOpenPanel openPanel];
        [panel close];
    }} @catch(NSException *exception) {
      napi_throw_error(env,NULL,exception.reason.UTF8String);return NULL;
    }
    prepared=true;
  }
  napi_value result;napi_create_double(env,(CFAbsoluteTimeGetCurrent()-start)*1000,&result);return result;
}

static napi_value SetMouseCoalescing(napi_env env, napi_callback_info info) {
  [NSEvent setMouseCoalescingEnabled:ArgBool(env, info)];
  return Bool(env, [NSEvent isMouseCoalescingEnabled]);
}

static napi_value StartTabletMonitor(napi_env env, napi_callback_info info) {
  if (!gMonitor) {
    NSEventMask mask = NSEventMaskLeftMouseDown | NSEventMaskLeftMouseDragged | NSEventMaskRightMouseDown |
                       NSEventMaskRightMouseDragged | NSEventMaskTabletPoint | NSEventMaskTabletProximity;
    gMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask
                                                     handler:^NSEvent *(NSEvent *e) {
      NSEventType type = e.type;
      if (type == NSEventTypeTabletProximity) {
        gStats.device = (int)e.pointingDeviceType;
        return e;
      }
      if (type == NSEventTypeTabletPoint) {
        gStats.pure++;
        return e;
      }
      if (type == NSEventTypeLeftMouseDown || type == NSEventTypeRightMouseDown) {
        gStats.events = 0;
        gStats.tablet = 0;
        gStats.pure = 0;
        gStats.pmin = 1e9;
        gStats.pmax = -1;
        gStats.t0 = e.timestamp;
      }
      gStats.events++;
      gStats.t1 = e.timestamp;
      if (e.subtype == NSEventSubtypeTabletPoint) {
        double p = e.pressure;
        gStats.tablet++;
        if (p < gStats.pmin) gStats.pmin = p;
        if (p > gStats.pmax) gStats.pmax = p;
      }
      return e;
    }];
  }
  return Bool(env, gMonitor != nil);
}

static void SetNumber(napi_env env, napi_value object, const char *name, double value) {
  napi_value v;
  napi_create_double(env, value, &v);
  napi_set_named_property(env, object, name, v);
}

static napi_value TabletStats(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_object(env, &result);
  SetNumber(env, result, "events", gStats.events);
  SetNumber(env, result, "tablet", gStats.tablet);
  SetNumber(env, result, "pure", gStats.pure);
  SetNumber(env, result, "pressureMin", gStats.tablet ? gStats.pmin : 0);
  SetNumber(env, result, "pressureMax", gStats.tablet ? gStats.pmax : 0);
  SetNumber(env, result, "seconds", gStats.t1 - gStats.t0);
  SetNumber(env, result, "device", gStats.device);
  return result;
}

// NSImage хранит размер в экранных пунктах независимо от числа пикселей Retina.
static napi_value ClipboardImage(napi_env env, napi_callback_info info) {
  napi_value result; napi_get_null(env,&result);
  @autoreleasepool {
    NSPasteboard *pb=[NSPasteboard generalPasteboard];
    NSData *data=nil;
    // Необязательный буфер позволяет проверить DPI тем же путём, не меняя буфер пользователя.
    size_t argc=1; napi_value argv[1]; napi_get_cb_info(env,info,&argc,argv,NULL,NULL);
    if(argc) {
      bool isBuffer=false;napi_is_buffer(env,argv[0],&isBuffer);
      if(isBuffer) {void *bytes;size_t size;napi_get_buffer_info(env,argv[0],&bytes,&size);data=[NSData dataWithBytes:bytes length:size];}
    } else data=[pb dataForType:NSPasteboardTypeTIFF] ?: [pb dataForType:NSPasteboardTypePNG];
    if(!data) return result;
    NSImage *image=[[NSImage alloc] initWithData:data];
    NSBitmapImageRep *rep=[[NSBitmapImageRep alloc] initWithData:data];
    if(!image || !rep || image.size.width<=0 || image.size.height<=0) return result;
    NSData *png=[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if(!png || png.length>64*1024*1024) return result;
    NSString *url=[@"data:image/png;base64," stringByAppendingString:[png base64EncodedStringWithOptions:0]];
    napi_create_object(env,&result);
    SetNumber(env,result,"width",image.size.width); SetNumber(env,result,"height",image.size.height);
    napi_value value; napi_create_string_utf8(env,url.UTF8String,NAPI_AUTO_LENGTH,&value);
    napi_set_named_property(env,result,"dataURL",value);
  }
  return result;
}

static void Export(napi_env env, napi_value exports, const char *name, napi_callback fn) {
  napi_value function;
  napi_create_function(env, name, NAPI_AUTO_LENGTH, fn, NULL, &function);
  napi_set_named_property(env, exports, name, function);
}

NAPI_MODULE_INIT() {
  InstallTextRecognition(env,exports);
  Export(env, exports, "syncWindowTitlebar", SyncWindowTitlebar);
  Export(env, exports, "windowStyleMask", WindowStyleMask);
  Export(env, exports, "setPresentation", SetPresentation);
  Export(env, exports, "getPresentation", GetPresentation);
  Export(env, exports, "prepareFileDialogs", PrepareFileDialogs);
  Export(env, exports, "setMouseCoalescing", SetMouseCoalescing);
  Export(env, exports, "startTabletMonitor", StartTabletMonitor);
  Export(env, exports, "tabletStats", TabletStats);
  Export(env, exports, "clipboardImage", ClipboardImage);
  return exports;
}
