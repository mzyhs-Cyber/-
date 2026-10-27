"""Independent local text-sequence checks; authorized backup required.
Only public source identity, method and verification status leave this process.
Does not certify live dedup, image-based explanations, or release eligibility.
"""
import argparse,csv,json,re,pathlib,math

def plain(s):return re.sub('<[^>]*>','',s)
def nums(s):return [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?',plain(s))]
def diff(v):return [b-a for a,b in zip(v,v[1:])]
def constant(v):return all(abs(x-v[0])<1e-8 for x in v)
def check(kind,v,options):
 if kind=='second-difference':
  d=diff(v);assert constant(diff(d));return v[-1]+d[-1]+diff(d)[0]
 if kind=='digit-sum':
  sums=[sum(map(int,str(int(x)))) for x in v];assert constant(sums)
  match=[x for x in options if sum(map(int,str(int(x))))==sums[0]];assert len(match)==1;return match[0]
 if kind=='factorial-difference':
  d=diff(v);assert d==[math.factorial(i) for i in range(len(d))];return v[-1]+math.factorial(len(d))
 if kind=='short-recurrence':
  assert all(v[i]==v[i-2]-3*v[i-1] for i in range(2,len(v)));return v[-2]-3*v[-1]
 if kind=='digit-rotation':
  s=[str(int(x)) for x in v];assert all(s[i]==s[i-1][1:]+s[i-1][0] for i in range(1,len(s)));return float(s[-1][1:]+s[-1][0])
 if kind in ['mean-recurrence','third-difference','half-recurrence']:
  # The blank is before the last supplied term: test every source option
  valid=[]
  for x in options:
   vv=v[:-1]+[x]+v[-1:]
   if kind=='mean-recurrence':ok=all(abs(vv[i]-(vv[i-2]+vv[i-1])/2)<1e-8 for i in range(2,len(vv)))
   elif kind=='half-recurrence':ok=all(abs(vv[i]-(vv[i-2]-vv[i-1]/2))<1e-8 for i in range(2,len(vv)))
   else:ok=constant(diff(diff(diff(vv))))
   if ok:valid.append(x)
  assert len(valid)==1;return valid[0]
 if kind=='digits-sum-and-tail':
  lead=[int(x)//10 for x in v];tail=[int(x)%10 for x in v]
  assert all(lead[i]==lead[i-2]+lead[i-1] for i in range(2,len(v)))
  assert all(tail[i]==tail[i-2] for i in range(2,len(v)))
  return (lead[-2]+lead[-1])*10+tail[-2]
 raise ValueError(kind)

CASES=[('2021','广东','乡镇',32,'QS-N01','second-difference'),('2021','广东','乡镇',33,'QS-N02','second-difference'),('2021','广东','乡镇',34,'QS-N06','digit-sum'),('2023','浙江','C类',36,'QS-N01','factorial-difference'),('2023','浙江','C类',38,'QS-N02','short-recurrence'),('2026','广东','',31,'QS-N06','digit-rotation'),('2026','广东','',32,'QS-N02','mean-recurrence'),('2026','广东','',33,'QS-N06','digits-sum-and-tail'),('2021','浙江','C类',53,'QS-N01','third-difference'),('2021','浙江','C类',54,'QS-N02','half-recurrence')]
def main():
 a=argparse.ArgumentParser();a.add_argument('backup');a.add_argument('--out',required=True);args=a.parse_args();p=json.load(open(args.backup));rows=[]
 for year,region,variant,no,bucket,method in CASES:
  found=[q for q in p['bank'] if all(x in q.get('source','') for x in [year,region,variant,'第'+str(no)+'题']) and q['subject']=='数量关系']
  assert found,(year,region,no);q=found[0]
  assert not re.search('<img|<svg',q['stemHtml']+''.join(q['optionsHtml']),re.I)
  v=nums(q['stemHtml']);options=[nums(x)[0] for x in q['optionsHtml']];result=check(method,v,options)
  winners=[i for i,x in enumerate(options) if abs(x-result)<1e-8];assert len(winners)==1 and chr(65+winners[0])==q['answer']
  rows.append({'source':q['source'],'bucket':bucket,'method':method,'full_stem_options':'text-read','independent_solved':'yes','source_answer_checked':'yes','reference_explanation_media':'not-certified','live_dedup':'pending','publishable':'no'})
 dest=pathlib.Path(args.out);dest.parent.mkdir(parents=True,exist_ok=True)
 with open(dest,'w',newline='') as f:w=csv.DictWriter(f,rows[0].keys());w.writeheader();w.writerows(rows)
 print(json.dumps({'independently_solved':len(rows),'source_answer_matched':len(rows),'release_eligible':0}))
if __name__=='__main__':main()
