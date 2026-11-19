# Сравнение внешних оптимизаторов на копиях. Не переписывает входные файлы.
# python3 scripts/benchmark-export.py release/0.6.15/benchmark
from pathlib import Path
import json, subprocess, sys, time, hashlib

root=Path(sys.argv[1]).resolve()
inputs=root/'inputs';outputs=root/'outputs';outputs.mkdir(exist_ok=True)
rows=json.loads((root/'results.json').read_text()) if (root/'results.json').exists() else []
for source in sorted(inputs.iterdir()):
    if source.suffix not in ('.svg','.pdf'):continue
    if len(sys.argv)>2 and sys.argv[2]!='all' and source.stem!=sys.argv[2]:continue
    if source.suffix=='.svg':
        jobs={
            'svgo':['svgo','--multipass','--precision','3','-i',str(source)],
            'svgo-matrix':['svgo','--config',str(Path(__file__).with_name('svgo-preserve-transforms.cjs').resolve()),'-i',str(source)],
            'scour':[sys.executable,'-m','scour.scour','-i',str(source),'--set-precision=6','--set-c-precision=6','--strip-xml-prolog','--remove-descriptive-elements','--enable-comment-stripping','--enable-id-stripping','--shorten-ids','--no-line-breaks','--create-groups'],
        }
    else:
        jobs={
            'qpdf':['qpdf','--object-streams=generate','--compress-streams=y','--recompress-flate','--compression-level=9',str(source)],
            'qpdf-zopfli':['env','QPDF_ZOPFLI=force','qpdf','--object-streams=generate','--compress-streams=y','--recompress-flate','--compression-level=9',str(source)],
            'mupdf':['mutool','clean','-gggg','-z','-e','100','-f','-i','-c','-Z',str(source)],
            'ghostscript':['gs','-q','-dSAFER','-dBATCH','-dNOPAUSE','-sDEVICE=pdfwrite','-dCompatibilityLevel=1.7','-dAutoRotatePages=/None','-dDownsampleColorImages=false','-dDownsampleGrayImages=false','-dDownsampleMonoImages=false','-dPassThroughJPEGImages=true','-dDetectDuplicateImages=true','-sColorConversionStrategy=LeaveColorUnchanged'],
        }
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    for name,args in jobs.items():
        if len(sys.argv)>3 and name!=sys.argv[3]:continue
        target=outputs/(source.stem+'-'+name+source.suffix)
        if source.suffix=='.svg':args+=['-o',str(target)]
        elif name=='ghostscript':args+=['-sOutputFile='+str(target),str(source)]
        else:args+=[str(target)]
        start=time.monotonic();result=subprocess.run(args,capture_output=True,text=True,timeout=180)
        row={'source':str(source.relative_to(root)),'optimizer':name,'target':str(target.relative_to(root)),'bytes_before':source.stat().st_size,'ms':round((time.monotonic()-start)*1000),'command':args,'returncode':result.returncode}
        if result.returncode:row['error']=result.stderr
        else:row['bytes_after']=target.stat().st_size
        assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
        rows=[old for old in rows if (old['source'],old['optimizer'])!=(row['source'],row['optimizer'])]
        rows.append(row);print(json.dumps({k:v for k,v in row.items() if k not in ('command','error')},ensure_ascii=False),flush=True)
        (root/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
