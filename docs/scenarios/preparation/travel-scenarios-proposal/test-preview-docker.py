from pathlib import Path
import subprocess,json,sys,os,re
root=Path.cwd();prep='docs/scenarios/preparation/travel-scenarios-proposal';batch=json.loads((root/prep/'batch.json').read_text());image=os.environ.get('TRAVEL_TEST_IMAGE','sha256:72c1e6d03a0840a1b00f2172a9ae4add7562341fbc400b34e9391b7e7be66b6a')
if not re.fullmatch(r'sha256:[a-f0-9]{64}',image):raise SystemExit('TRAVEL_TEST_IMAGE須為已核對的本機Docker image SHA-256 ID')
audio='englishlearning_travel_20261112_audio_test';images='englishlearning_travel_20261112_images_test'
def mount(args,source,target,mode='ro'):args.extend(['-v',str(source)+':'+target+':'+mode])
def command(mode):
 args=['docker','run']
 if mode=='api':args+=['-d','--name','englishlearning-travel-preview-api-test','--label','englishlearning.purpose=travel-test-preview','-p','127.0.0.1:5180:5180']
 else:args+=['--rm','--user','0:0']
 args+=['--network','englishlearning-test_default','--entrypoint','node']
 for key,value in [('TEST_DATABASE_URL','postgres://app:app@db-test:5432/english_learning_test'),('TEST_AUDIO_DIR','/data/audio'),('TEST_IMAGE_DIR','/data/images'),('TEST_REUSE_AUDIO_DIR','/source-audio'),('TEST_PREVIEW_HOST','0.0.0.0')]:args+=['-e',key+'='+value]
 if mode!='check':args+=['-e','TRAVEL_TEST_PREVIEW=1']
 mount(args,audio,'/data/audio','ro' if mode=='api' else 'rw');mount(args,images,'/data/images','ro' if mode=='api' else 'rw')
 mount(args,root/'config','/app/config');mount(args,root/prep,'/app/'+prep)
 if mode!='api':
  mount(args,'englishlearning_audio','/source-audio')
  for relative in ['source/vocabulary-database.json','scripts/check-scenario-package.mjs','scripts/import-scenario.ts','scripts/generate-wordbank-audio.mjs','data/scenario-preparation/travel-scenarios/test-preview','data/scenario-audio/travel-scenarios-qwen17b']:
   mount(args,root/relative,'/app/'+relative)
  for s in batch['scenes']:
   for relative in [str(Path(s['preparation']['packagePath']).parent),str(Path(s['assetSource']['image']).parent)]:mount(args,root/relative,'/app/'+relative)
 entry='test-preview-api.ts' if mode=='api' else 'test-preview-data.ts'
 args += [image,'--import','tsx','/app/'+prep+'/'+entry]
 return args
mode=sys.argv[1] if len(sys.argv)>1 else 'check';assert mode in ['check','bootstrap','api'];r=subprocess.run(command(mode),text=True,capture_output=True);print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr)
if mode=='check':
 if r.returncode!=1 or 'TRAVEL_TEST_PREVIEW=1' not in r.stderr:raise SystemExit('隔離容器未通過opt-in退出檢查')
 print('container opt-in guard passed; no DB/media writes');sys.exit(0)
sys.exit(r.returncode)
