// Apple Vision: исходный растр → строки текста. Декодирование и OCR идут вне потока Electron.
// Отмена VNRequest не освобождает задание до завершения фоновой работы.
#import <AppKit/AppKit.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>
#include <node_api.h>

@interface PhaintTextRecognition : NSObject {
@public
  napi_async_work work;
  napi_deferred deferred;
}
@property(nonatomic) uint32_t identifier;
@property(nonatomic,strong) NSData *data;
@property(nonatomic,strong) NSArray<NSValue *> *clip;
@property(nonatomic,strong) VNRecognizeTextRequest *request;
@property(nonatomic,strong) NSString *text;
@property(nonatomic,strong) NSString *error;
@property(atomic) BOOL cancelled;
@end
@implementation PhaintTextRecognition
@end

// Словарь используется только в потоке JS; он удерживает задания для фоновых callbacks.
static NSMutableDictionary<NSNumber *,PhaintTextRecognition *> *recognitions;

static CGImageRef RecognitionImage(PhaintTextRecognition *task) {
  CGImageSourceRef source=CGImageSourceCreateWithData((__bridge CFDataRef)task.data,NULL);
  if(!source){task.error=@"error.ocrRead";return NULL;}
  NSDictionary *properties=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));
  double width=[properties[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue];
  double height=[properties[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
  if(!isfinite(width) || !isfinite(height) || width<1 || height<1){
    CFRelease(source);task.error=@"error.ocrRead";return NULL;
  }
  if(width*height>64000000){
    CFRelease(source);task.error=@"error.imageTooLarge";return NULL;
  }
  // EXIF-поворот, как при показе JPEG на холсте. Масштаб объекта и вида сюда не попадает.
  NSDictionary *options=@{(__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways:@YES,
    (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform:@YES,
    (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize:@(MAX(width,height))};
  CGImageRef image=CGImageSourceCreateThumbnailAtIndex(source,0,(__bridge CFDictionaryRef)options);
  CFRelease(source);
  if(!image){task.error=@"error.ocrDecode";return NULL;}
  width=CGImageGetWidth(image);height=CGImageGetHeight(image);
  double left=0,top=0,right=width,bottom=height;
  if(task.clip){
    left=width;top=height;right=bottom=0;
    for(NSValue *value in task.clip){CGPoint p=value.pointValue;
      left=MIN(left,p.x*width);right=MAX(right,p.x*width);
      top=MIN(top,p.y*height);bottom=MAX(bottom,p.y*height);
    }
    left=MAX(0,floor(left));top=MAX(0,floor(top));right=MIN(width,ceil(right));bottom=MIN(height,ceil(bottom));
  }
  if(right<=left || bottom<=top){CGImageRelease(image);return NULL;}
  CGColorSpaceRef space=CGColorSpaceCreateDeviceRGB();
  CGContextRef ctx=CGBitmapContextCreate(NULL,right-left,bottom-top,8,0,space,(CGBitmapInfo)kCGImageAlphaNoneSkipLast);
  CGColorSpaceRelease(space);
  if(!ctx){CGImageRelease(image);task.error=@"error.ocrMemory";return NULL;}
  // Прозрачные и обрезанные участки белые, поэтому скрытый текст не распознаётся.
  CGContextSetRGBFillColor(ctx,1,1,1,1);CGContextFillRect(ctx,CGRectMake(0,0,right-left,bottom-top));
  CGContextTranslateCTM(ctx,-left,bottom-height);
  if(task.clip){
    CGContextBeginPath(ctx);BOOL first=YES;
    for(NSValue *value in task.clip){CGPoint p=value.pointValue;
      if(first)CGContextMoveToPoint(ctx,p.x*width,(1-p.y)*height);
      else CGContextAddLineToPoint(ctx,p.x*width,(1-p.y)*height);
      first=NO;
    }
    CGContextClosePath(ctx);CGContextClip(ctx);
  }
  CGContextDrawImage(ctx,CGRectMake(0,0,width,height),image);
  CGImageRef result=CGBitmapContextCreateImage(ctx);
  CGContextRelease(ctx);CGImageRelease(image);return result;
}

static void RecognizeExecute(napi_env env,void *data) {
  @autoreleasepool { @try {
    PhaintTextRecognition *task=(__bridge PhaintTextRecognition *)data;
    if(task.cancelled)return;
    CGImageRef image=RecognitionImage(task);
    if(!image)return;
    VNImageRequestHandler *handler=[[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
    CGImageRelease(image);
    VNRecognizeTextRequest *request=task.request;
    request.recognitionLevel=VNRequestTextRecognitionLevelAccurate;request.usesLanguageCorrection=YES;
    NSError *error=nil;
    NSArray<NSString *> *supported=[request supportedRecognitionLanguagesAndReturnError:&error];
    if(!supported){task.error=error.localizedDescription ?: @"error.ocrUnavailable";return;}
    NSMutableArray<NSString *> *languages=[NSMutableArray array];
    for(NSString *language in @[@"ru-RU",@"en-US"])if([supported containsObject:language])[languages addObject:language];
    if(languages.count)request.recognitionLanguages=languages;
    if(@available(macOS 13.0,*))request.automaticallyDetectsLanguage=YES;
    if(task.cancelled)return;
    if(![handler performRequests:@[request] error:&error]){task.error=error.localizedDescription ?: @"error.ocrFailed";return;}
    NSArray<VNRecognizedTextObservation *> *observations=[request.results sortedArrayUsingComparator:^NSComparisonResult(VNRecognizedTextObservation *a,VNRecognizedTextObservation *b){
      double y=CGRectGetMidY(b.boundingBox)-CGRectGetMidY(a.boundingBox);
      if(y!=0)return y<0?NSOrderedAscending:NSOrderedDescending;
      return [@(CGRectGetMinX(a.boundingBox)) compare:@(CGRectGetMinX(b.boundingBox))];
    }];
    NSMutableArray<NSString *> *lines=[NSMutableArray array];
    for(VNRecognizedTextObservation *observation in observations){
      NSString *line=[observation topCandidates:1].firstObject.string;
      if(line.length)[lines addObject:line];
    }
    task.text=[lines componentsJoinedByString:@"\n"];
  } @catch(NSException *exception){
    ((__bridge PhaintTextRecognition *)data).error=exception.reason ?: @"error.ocrException";
  }}
}

static void RecognizeComplete(napi_env env,napi_status status,void *data) {
  PhaintTextRecognition *task=(__bridge PhaintTextRecognition *)data;
  napi_value value;
  if(task.cancelled || task.error || status!=napi_ok){
    NSString *message=task.cancelled?@"error.ocrCancelled":task.error ?: @"error.ocrFailed";
    napi_value text;napi_create_string_utf8(env,message.UTF8String,NAPI_AUTO_LENGTH,&text);
    napi_create_error(env,NULL,text,&value);napi_reject_deferred(env,task->deferred,value);
  }else{
    napi_create_string_utf8(env,(task.text ?: @"").UTF8String,NAPI_AUTO_LENGTH,&value);
    napi_resolve_deferred(env,task->deferred,value);
  }
  napi_delete_async_work(env,task->work);[recognitions removeObjectForKey:@(task.identifier)];
}

static napi_value RecognizeText(napi_env env,napi_callback_info info) {
  size_t argc=3; napi_value argv[3];napi_get_cb_info(env,info,&argc,argv,NULL,NULL);
  bool buffer=false;uint32_t identifier=0;void *bytes=NULL;size_t size=0;
  if(argc<2 || napi_is_buffer(env,argv[0],&buffer)!=napi_ok || !buffer ||
     napi_get_value_uint32(env,argv[1],&identifier)!=napi_ok || !identifier ||
     napi_get_buffer_info(env,argv[0],&bytes,&size)!=napi_ok || !size || size>64*1024*1024 || recognitions[@(identifier)]){
    napi_throw_error(env,NULL,"error.ocrData");return NULL;
  }
  PhaintTextRecognition *task=[PhaintTextRecognition new];task.identifier=identifier;
  task.data=[NSData dataWithBytes:bytes length:size];task.request=[VNRecognizeTextRequest new];
  if(argc>2){
    bool array=false;napi_is_array(env,argv[2],&array);
    if(array){uint32_t length=0;napi_get_array_length(env,argv[2],&length);
      if(length>128 || length%2){napi_throw_error(env,NULL,"error.ocrCrop");return NULL;}
      NSMutableArray<NSValue *> *clip=[NSMutableArray array];
      for(uint32_t i=0;i<length;i+=2){napi_value x,y;double px,py;
        napi_get_element(env,argv[2],i,&x);napi_get_element(env,argv[2],i+1,&y);
        if(napi_get_value_double(env,x,&px)!=napi_ok || napi_get_value_double(env,y,&py)!=napi_ok || !isfinite(px) || !isfinite(py)){
          napi_throw_error(env,NULL,"error.ocrCrop");return NULL;
        }
        [clip addObject:[NSValue valueWithPoint:NSMakePoint(px,py)]];
      }
      task.clip=clip;
    }
  }
  napi_value promise,name;napi_create_promise(env,&task->deferred,&promise);
  napi_create_string_utf8(env,"PhaintOCR",NAPI_AUTO_LENGTH,&name);
  napi_status status=napi_create_async_work(env,NULL,name,RecognizeExecute,RecognizeComplete,(__bridge void *)task,&task->work);
  if(status==napi_ok){
    if(!recognitions)recognitions=[NSMutableDictionary dictionary];recognitions[@(identifier)]=task;
    status=napi_queue_async_work(env,task->work);
  }
  if(status!=napi_ok){
    if(task->work)napi_delete_async_work(env,task->work);[recognitions removeObjectForKey:@(identifier)];
    napi_value message,error;napi_create_string_utf8(env,"error.ocrStart",NAPI_AUTO_LENGTH,&message);
    napi_create_error(env,NULL,message,&error);napi_reject_deferred(env,task->deferred,error);
  }
  return promise;
}

static napi_value CancelTextRecognition(napi_env env,napi_callback_info info) {
  size_t argc=1;napi_value argv[1];uint32_t identifier=0;napi_get_cb_info(env,info,&argc,argv,NULL,NULL);
  if(argc)napi_get_value_uint32(env,argv[0],&identifier);
  PhaintTextRecognition *task=recognitions[@(identifier)];task.cancelled=YES;[task.request cancel];
  napi_value result;napi_get_undefined(env,&result);return result;
}

static napi_value ClipboardChangeCount(napi_env env,napi_callback_info info) {
  napi_value result;napi_create_double(env,NSPasteboard.generalPasteboard.changeCount,&result);return result;
}

static napi_value WriteClipboardText(napi_env env,napi_callback_info info) {
  size_t argc=2;napi_value argv[2];napi_get_cb_info(env,info,&argc,argv,NULL,NULL);
  double expected=-1;size_t length=0;BOOL ok=NO;
  if(argc==2 && napi_get_value_double(env,argv[1],&expected)==napi_ok &&
    napi_get_value_string_utf8(env,argv[0],NULL,0,&length)==napi_ok && length<=16*1024*1024){
    char *bytes=malloc(length+1);
    if(bytes){
      napi_get_value_string_utf8(env,argv[0],bytes,length+1,&length);
      NSString *text=[[NSString alloc] initWithBytes:bytes length:length encoding:NSUTF8StringEncoding];free(bytes);
      NSPasteboard *pb=NSPasteboard.generalPasteboard;
      if(text && pb.changeCount==expected){[pb clearContents];ok=[pb setString:text forType:NSPasteboardTypeString];}
    }
  }
  napi_value result;napi_get_boolean(env,ok,&result);return result;
}

void InstallTextRecognition(napi_env env,napi_value exports) {
  napi_property_descriptor properties[]={
    {"recognizeText",NULL,RecognizeText,NULL,NULL,NULL,napi_default,NULL},
    {"cancelTextRecognition",NULL,CancelTextRecognition,NULL,NULL,NULL,napi_default,NULL},
    {"clipboardChangeCount",NULL,ClipboardChangeCount,NULL,NULL,NULL,napi_default,NULL},
    {"writeClipboardText",NULL,WriteClipboardText,NULL,NULL,NULL,napi_default,NULL},
  };
  napi_define_properties(env,exports,sizeof(properties)/sizeof(properties[0]),properties);
}
