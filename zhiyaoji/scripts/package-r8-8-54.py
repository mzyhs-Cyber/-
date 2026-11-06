#!/usr/bin/env python3
"""Verify R53 provenance, stability regressions and deployable asset deltas."""
import hashlib,json,re,subprocess,tempfile,zipfile
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];APP=ROOT/'app'
BASE=ROOT.parents[1]/'output/zhiyaoji-R8.8.53-full.zip'
OUT=ROOT.parents[1]/'output/zhiyaoji-R8.8.54-stability-full.zip'
VERIFY=ROOT/'verification/r54'
CHANGED={'bundle.js','index.html','sw.js','sync-cooperate.js','immersive-mode.js','performance-diagnostics.js'}
class Page(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.scripts=[];self.script=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ['script','img','link']:
   r=a.get('src') or a.get('href')
   if r:self.refs.append(r)
  if tag=='script' and 'src' not in a:self.script=[]
 def handle_data(self,data):
  if self.script is not None:self.script.append(data)
 def handle_endtag(self,tag):
  if tag=='script' and self.script is not None:self.scripts.append(''.join(self.script));self.script=None
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(BASE.read_bytes())=='a1cf335266146d8dacc5459e4deb8f5aa493825456cb9971d4162d77c77a803a'
VERIFY.mkdir(exist_ok=True,parents=True)
for test,out in [('test-r8-8-54-stability.cjs','stability-tests.json'),('test-r8-8-52-review.cjs','review-tests.json'),('test-r8-8-54-exam-flow.cjs','exam-flow-tests.json')]:
 r=subprocess.run(['node',str(ROOT/'scripts'/test)],capture_output=True,text=True,check=True);d=json.loads(r.stdout);assert d['passed'];(VERIFY/out).write_text(r.stdout)
with zipfile.ZipFile(BASE) as z:
 assert z.testzip() is None
 names=z.namelist();assets=[n for n in names if n not in ['AUDIT_REPORT.md','RELEASE_NOTES.md']]
 changed={n for n in assets if z.read(n)!=(APP/n).read_bytes()};assert changed==CHANGED,changed
 assert z.read('birthday.html')==(APP/'birthday.html').read_bytes()
 checks=[]
 with tempfile.TemporaryDirectory(dir=ROOT) as temp:
  for f in APP.glob('*.js'):
   copy=Path(temp)/(f.stem+('.mjs' if f.name=='_worker.js' else '.js'));copy.write_bytes(f.read_bytes());subprocess.run(['node','--check',str(copy)],capture_output=True,check=True);checks.append(f.name)
  for f in APP.glob('*.html'):
   page=Page();page.feed(f.read_text())
   for ref in page.refs:
    r=ref.split('?')[0]
    if r and not re.match(r'^(?:[a-z]+:|#|/)',r):assert (APP/r).is_file(),(f.name,r)
   for i,text in enumerate(page.scripts):
    if not text.strip():continue
    copy=Path(temp)/('inline-'+str(i)+'.js');copy.write_text(text);subprocess.run(['node','--check',str(copy)],capture_output=True,check=True);checks.append(f.name+':inline:'+str(i))
 outnames=names+['ink-retention.js'];assert len(outnames)==len(set(outnames));assert 'index.html' in outnames
 with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as target:
  for n in outnames:target.write(APP/n,n)
with zipfile.ZipFile(OUT) as z:assert z.testzip() is None
result={'version':'R8.8.54','baselineCommit':'140ef15e906652d27be411a221fd936f7ce8858f','baselineZipSha256':sha(BASE.read_bytes()),'changedAssets':sorted(CHANGED),'addedAssets':['ink-retention.js'],'syntaxChecks':len(checks),'entryCount':len(outnames),'archive':OUT.name,'sha256':sha(OUT.read_bytes()),'size':OUT.stat().st_size,'privateBirthdayPreserved':True,'workerUnchanged':True,'deployed':False,'browserQA':'unavailable: sites-previewd mailbox missing','deviceQA':False}
(VERIFY/'package.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
