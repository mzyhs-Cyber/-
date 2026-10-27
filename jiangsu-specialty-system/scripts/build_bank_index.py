"""Make public source indices from an explicitly authorized local backup.

No private IDs, stems, options, answers, learning history or ink are exported.
Metadata routing is a candidate hint, never an independent solution certificate.
"""
import argparse,collections,csv,json,re,pathlib

QUANT={
 'QS-N01':('差分',r'多级数列|基础数列'),
 'QS-N02':('因数比值短递推',r'因数分解数列|作商数列|递推数列|作和作积数列|幂次数列|多重数列'),
 'QS-N03':('分数',r'分数数列'),
 'QS-N04':('小数拆分',r'(?!)'),
 'QS-N05':('根式',r'(?!)'),
 'QS-N06':('数位机械划分',r'机械划分'),
 'QS-M01':('比例方程简单利润',r'和差倍比问题|经济利润问题'),
 'QS-M02':('定量工程等时',r'给效率比例型|给完工时间型|给具体单位型'),
 'QS-M03':('基本行程',r'普通行程|相遇追及|过桥'),
 'QS-M04':('等差均值',r'数列问题|平均数问题'),
 'QS-M05':('整除余数代入',r'周期余数问题|普通不定方程'),
 'QS-M06':('基础容斥',r'两集合|三集合'),
}
CORE={
 'CORE-V-FILL':('言语填空',r'填空|词的辨析|对应关系'),
 'CORE-V-PASSAGE':('篇章阅读',r'篇章'),
 'CORE-V-DETAIL':('细节与中心',r'细节判断|主题词|关联词|标题填入'),
 'CORE-V-ORDER':('语句排序衔接',r'语句排序|接语|横线'),
 'CORE-G-SPATIAL':('空间重构候选',r'空间重构|空间组合|截面|视图'),
 'CORE-G-GRAPH':('平面图形候选',r'平面类|位置规律|属性规律|数量规律|样式规律'),
 'CORE-L-TRANSLATE':('翻译与条件逻辑候选',r'常规翻译|翻译推理'),
 'CORE-L-MATERIAL':('材料与分析推理候选',r'分析推理|组合排列|真假|排序|匹配'),
 'CORE-L-ARGUMENT':('论证结构候选',r'论点|论据|搭桥|大前提|假设'),
 'CORE-C-DEFINITION':('定义条件边界',r'单定义|多定义'),
 'CORE-C-ANALOGY':('类比关系层级',r'逻辑关系|方式目的|原因结果'),
 'CORE-D-PART':('比重贡献候选',r'比重|贡献'),
 'CORE-D-GROWTH':('跨期与增长候选',r'增长|年均'),
 'CORE-D-MEAN':('均值倍数候选',r'平均数|倍数'),
 'CORE-D-COMPARE':('比较与综合候选',r'综合分析|大小比较'),
}

def main():
 a=argparse.ArgumentParser();a.add_argument('backup');a.add_argument('--out',required=True);args=a.parse_args()
 p=json.load(open(args.backup));out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
 by_source={}
 for q in p['bank']:
  source=q.get('source','').strip();year=q.get('year') or 0
  if not source or year<2021 or q.get('subject') not in ['数量关系','言语理解','判断推理','资料分析']:continue
  if '江苏' in source:continue # Keep recent Jiangsu papers held out.
  by_source.setdefault(source,q)
 pools={'01-quantity':collections.defaultdict(list),'02-three-subjects':collections.defaultdict(list)}
 for source,q in sorted(by_source.items(),key=lambda x:(-(x[1].get('year') or 0),x[0])):
  label='/'.join(q.get('path',[]));sub=q['subject'];plain=re.sub('<[^>]*>','',q.get('stemHtml',''))
  keys=[]
  if sub=='数量关系':
   keys=[k for k,(_,pat) in QUANT.items() if re.search(pat,label)]
   numeric=any(k.startswith('QS-N') for k in keys)
   if numeric and re.search(r'√|根号|\\sqrt',plain):keys=['QS-N05']
   elif numeric and re.search(r'\d+\.\d+',plain):keys=['QS-N04']
   stream='01-quantity'
  else:
   keys=[k for k,(_,pat) in CORE.items() if re.search(pat,label) and ((sub=='言语理解' and k.startswith('CORE-V'))or(sub=='判断推理' and k.startswith(('CORE-G','CORE-L','CORE-C')))or(sub=='资料分析' and k.startswith('CORE-D')))];stream='02-three-subjects'
  if not keys:continue
  key=keys[0]
  if len(pools[stream][key])>=8:continue
  full=' '.join([q.get('stemHtml',''),*q.get('optionsHtml',[]),q.get('materialHtml','')]);images=bool(re.search(r'<img|<svg|<canvas',full,re.I))
  match=re.search(r'第\s*(\d+)\s*题',source)
  pools[stream][key].append({'bucket':key,'subject':sub,'year':q.get('year'),'source':source,'original_question_number':match.group(1) if match else '', 'taxonomy_hint':label,'has_media':'yes' if images else 'no','has_material':'yes' if q.get('materialKey') else 'no','status':'snapshot-indexed','independent_solved':'no','answer_cross_checked':'no','live_dedup':'pending','strict_model_match':'pending','publishable':'no'})
 summary={'version':'BANK-20261027-v1','basis':'authorized backup metadata; source deduplicated; no latest personal dedup','eligible':0,'streams':{}}
 for stream,catalog in [('01-quantity',QUANT),('02-three-subjects',CORE)]:
  dest=out/stream;dest.mkdir(exist_ok=True);rows=[]
  for key in catalog:
   for row in pools[stream][key]:rows.append({'candidate_id':('Q' if stream.startswith('01') else 'C')+f'{len(rows)+1:04}',**row})
  fields=['candidate_id','bucket','subject','year','source','original_question_number','taxonomy_hint','has_media','has_material','status','independent_solved','answer_cross_checked','live_dedup','strict_model_match','publishable']
  with open(dest/'source-index.csv','w',newline='') as f:w=csv.DictWriter(f,fields);w.writeheader();w.writerows(rows)
  summary['streams'][stream]={'candidates':len(rows),'buckets':{key:{'name':value[0],'candidates':len(pools[stream][key])} for key,value in catalog.items()}}
 (out/'INDEX.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
