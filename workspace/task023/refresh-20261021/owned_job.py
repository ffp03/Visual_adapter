"""Windows child starts suspended, joins our job, then resumes. No escaped descendants."""
import ctypes,ctypes.wintypes as w,subprocess,time
K=ctypes.WinDLL('kernel32',use_last_error=True)
for name,args,result in [
 ('CreateJobObjectW',[ctypes.c_void_p,w.LPCWSTR],w.HANDLE),
 ('SetInformationJobObject',[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD],w.BOOL),
 ('AssignProcessToJobObject',[w.HANDLE,w.HANDLE],w.BOOL),
 ('TerminateJobObject',[w.HANDLE,w.UINT],w.BOOL),
 ('QueryInformationJobObject',[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD,ctypes.c_void_p],w.BOOL),
 ('CloseHandle',[w.HANDLE],w.BOOL),
 ('CreateToolhelp32Snapshot',[w.DWORD,w.DWORD],w.HANDLE),
 ('OpenThread',[w.DWORD,w.BOOL,w.DWORD],w.HANDLE),
 ('ResumeThread',[w.HANDLE],w.DWORD)]:
 f=getattr(K,name);f.argtypes=args;f.restype=result
class BASIC(ctypes.Structure):
 _fields_=[('PerProcessUserTimeLimit',ctypes.c_longlong),('PerJobUserTimeLimit',ctypes.c_longlong),('LimitFlags',w.DWORD),('MinimumWorkingSetSize',ctypes.c_size_t),('MaximumWorkingSetSize',ctypes.c_size_t),('ActiveProcessLimit',w.DWORD),('Affinity',ctypes.c_size_t),('PriorityClass',w.DWORD),('SchedulingClass',w.DWORD)]
class IO(ctypes.Structure):
 _fields_=[(n,ctypes.c_ulonglong) for n in ['ReadOperationCount','WriteOperationCount','OtherOperationCount','ReadTransferCount','WriteTransferCount','OtherTransferCount']]
class EXTENDED(ctypes.Structure):
 _fields_=[('BasicLimitInformation',BASIC),('IoInfo',IO),('ProcessMemoryLimit',ctypes.c_size_t),('JobMemoryLimit',ctypes.c_size_t),('PeakProcessMemoryUsed',ctypes.c_size_t),('PeakJobMemoryUsed',ctypes.c_size_t)]
class THREAD(ctypes.Structure):
 _fields_=[('dwSize',w.DWORD),('cntUsage',w.DWORD),('th32ThreadID',w.DWORD),('th32OwnerProcessID',w.DWORD),('tpBasePri',w.LONG),('tpDeltaPri',w.LONG),('dwFlags',w.DWORD)]
class ACCOUNTING(ctypes.Structure):
 _fields_=[('TotalUserTime',ctypes.c_longlong),('TotalKernelTime',ctypes.c_longlong),('ThisPeriodTotalUserTime',ctypes.c_longlong),('ThisPeriodTotalKernelTime',ctypes.c_longlong),('TotalPageFaultCount',w.DWORD),('TotalProcesses',w.DWORD),('ActiveProcesses',w.DWORD),('TotalTerminatedProcesses',w.DWORD)]
K.Thread32First.argtypes=[w.HANDLE,ctypes.POINTER(THREAD)];K.Thread32First.restype=w.BOOL
K.Thread32Next.argtypes=[w.HANDLE,ctypes.POINTER(THREAD)];K.Thread32Next.restype=w.BOOL
def create_job():
 h=K.CreateJobObjectW(None,None)
 if not h:raise ctypes.WinError(ctypes.get_last_error())
 info=EXTENDED();info.BasicLimitInformation.LimitFlags=0x2000
 if not K.SetInformationJobObject(h,9,ctypes.byref(info),ctypes.sizeof(info)):
  error=ctypes.get_last_error();K.CloseHandle(h);raise ctypes.WinError(error)
 return h
def resume(pid):
 snapshot=K.CreateToolhelp32Snapshot(4,0)
 if snapshot==ctypes.c_void_p(-1).value:raise ctypes.WinError(ctypes.get_last_error())
 thread_ids=[]
 try:
  entry=THREAD();entry.dwSize=ctypes.sizeof(entry)
  more=K.Thread32First(snapshot,ctypes.byref(entry))
  while more:
   if entry.th32OwnerProcessID==pid:thread_ids.append(entry.th32ThreadID)
   more=K.Thread32Next(snapshot,ctypes.byref(entry))
 finally:K.CloseHandle(snapshot)
 if len(thread_ids)!=1:raise RuntimeError('Expected exactly one suspended initial thread')
 thread=K.OpenThread(2,False,thread_ids[0])
 if not thread:raise ctypes.WinError(ctypes.get_last_error())
 try:
  if K.ResumeThread(thread)!=1:raise RuntimeError('Unexpected suspended-thread resume result')
 finally:K.CloseHandle(thread)
class OwnedJob:
 def __init__(self):self.handle=create_job();self.process=None;self.assigned=False
 def start(self,args,**options):
  try:
   self.process=subprocess.Popen(args,creationflags=subprocess.CREATE_NO_WINDOW|4,**options)
   if not K.AssignProcessToJobObject(self.handle,w.HANDLE(int(self.process._handle))):raise ctypes.WinError(ctypes.get_last_error())
   self.assigned=True;resume(self.process.pid)
   return self.process
  except BaseException:
   self.close();raise
 def close(self):
  if not self.handle:return {'alreadyClosed':True}
  result={}
  try:
   if self.assigned:
    result['terminationRequested']=bool(K.TerminateJobObject(self.handle,124))
   elif self.process and self.process.poll() is None:self.process.kill()
   if self.process:
    try:self.process.wait(timeout=5)
    except subprocess.TimeoutExpired:result['rootWaitTimedOut']=True
    result['rootExited']=self.process.poll() is not None
   deadline=time.monotonic()+0.5
   while True:
    accounting=ACCOUNTING()
    if not K.QueryInformationJobObject(self.handle,1,ctypes.byref(accounting),ctypes.sizeof(accounting),None):
     result['activeProcesses']=None;break
    result['activeProcesses']=accounting.ActiveProcesses
    if accounting.ActiveProcesses==0 or time.monotonic()>=deadline:break
    time.sleep(0.025)
  finally:K.CloseHandle(self.handle);self.handle=None
  return result
