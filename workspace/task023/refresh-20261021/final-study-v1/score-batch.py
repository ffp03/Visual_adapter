import sys,os,json,hashlib,subprocess
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../..'))
sys.path.insert(0,os.path.join(ROOT,'workspace/task023/refresh-20261021'))
from owned_job import OwnedJob
NODE=r'C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
JS=os.path.join(os.path.dirname(__file__),'score-batch.cjs')
HELPER=os.path.join(ROOT,'tests/local/study-preparation.cjs')
def digest(file):
 with open(file,'rb') as stream:return hashlib.sha256(stream.read()).hexdigest()
def save(file,value):
 with open(file,'x',encoding='utf8') as stream:json.dump(value,stream,indent=2);stream.flush();os.fsync(stream.fileno())
def completed(result):
 return result['exitCode']==0 and result['cleanup'].get('rootExited') is True and result['cleanup'].get('activeProcesses')==0
def execute(args,stdout,stderr,seconds):
 job=OwnedJob()
 try:
  with open(stdout,'xb') as out,open(stderr,'xb') as err:
   process=job.start(args,cwd=ROOT,stdout=out,stderr=err)
   try:code=process.wait(timeout=seconds)
   except subprocess.TimeoutExpired:code=124
 finally:cleanup=job.close()
 return {'exitCode':code,'cleanup':cleanup}
if __name__=='__main__':
 mode,file,extra=sys.argv[1:4]
 if mode=='page':
  result=execute([NODE,HELPER,'_score-one',file],file+'.stdout.txt',file+'.stderr.txt',90);result['configSha256']=digest(file);save(extra,result)
 elif mode=='run':
  if digest(file)!=extra:raise RuntimeError('Unapproved contract')
  with open(file,encoding='utf8') as stream:contract=json.load(stream)
  for key,expected in [('controllerJs',JS),('controllerPy',__file__)]:
   binding=contract['bindings'][key];actual=os.path.realpath(os.path.join(ROOT,binding['file']))
   if os.path.normcase(actual)!=os.path.normcase(os.path.realpath(expected)) or digest(actual)!=binding['sha256']:raise RuntimeError('Controller drift')
  count=len(contract['selectedIds'])
  if count not in [4,8]:raise RuntimeError('Batch size')
  result=execute([NODE,JS,'run',file,extra],file+'.stdout.txt',file+'.stderr.txt',450 if count==4 else 900)
  result['contractSha256']=extra;status=file+'.root-status.json';save(status,result)
  if completed(result):
   folder=os.path.realpath(os.path.join(ROOT,contract['outputFolder']));pending=os.path.join(folder,'summary.pending.json')
   with open(pending,encoding='utf8') as stream:summary=json.load(stream)
   if summary['contractSha256']!=extra or summary['selectedIds']!=contract['selectedIds'] or len(summary['rows'])!=count*3:raise RuntimeError('Incomplete root summary')
   with open(file+'.stdout.txt',encoding='utf8') as stream:reported=json.loads(stream.read().strip().splitlines()[-1])
   if reported['summaryPendingSha256']!=digest(pending) or reported['pages']!=count or reported['rows']!=count*3:raise RuntimeError('Controller summary binding changed')
   for checkpoint in summary['checkpoints']:
    pagefolder=os.path.join(folder,checkpoint['id']);checkfile=os.path.join(pagefolder,'checkpoint.json')
    if digest(checkfile)!=checkpoint['checkpointSha256']:raise RuntimeError('Checkpoint drift')
    with open(checkfile,encoding='utf8') as stream:pagecheck=json.load(stream)
    for name,expected in pagecheck['files'].items():
     if os.path.basename(name)!=name or digest(os.path.join(pagefolder,name))!=expected:raise RuntimeError('Page artifact drift')
   summary['rootStatusSha256']=digest(status);summary['rootCleanupAccepted']=True;save(os.path.join(folder,'summary.json'),summary)
 else:raise RuntimeError('Use run CONTRACT SHA or page CONFIG STATUS')
 print(json.dumps(result));sys.exit(0 if completed(result) else 1)
