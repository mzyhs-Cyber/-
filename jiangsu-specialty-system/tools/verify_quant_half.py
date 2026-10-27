"""Check selected historical anchors without exporting source questions/answers."""
import json, re, sys, math
from pathlib import Path

data=json.loads(Path(sys.argv[1]).read_text())
papers={p['id']:p for p in data['papers'] if '江苏' in p.get('title','') and 'B类' in p.get('title','') and p.get('year') in range(2021,2026)}
bank={(papers[q['paperId']]['year'],q['paperOrder']):q for q in data['bank'] if q.get('paperId') in papers and q.get('subject')=='数量关系'}
assert len(bank)==100
plain=lambda t: re.sub(r'<[^>]+>','',t)
results=[]
def check(year,number,computed,kind='number'):
 q=bank[year,number];options=[plain(o) for o in q['optionsHtml']]
 if kind=='clock':matches=[i for i,t in enumerate(options) if str(int(computed))+':00' in t or str(int(computed))+'：00' in t]
 else:
  def equal(t):
   nums=re.findall(r'-?\d+(?:\.\d+)?',t)
   if not nums:return False
   value=float(nums[0]);value=value*60 if kind=='minutes' and '小时' in t else value
   return math.isclose(value,computed,rel_tol=1e-8,abs_tol=1e-8)
  matches=[i for i,t in enumerate(options) if equal(t)]
 assert len(matches)==1 and chr(65+matches[0])==q['answer'],(year,number,'independent result mismatch')
 results.append({'year':year,'paper':'江苏B回忆版','question_number':number,'independent_calculation':'passed','source_option_match':'unique','media_check':'not claimed'})

# Difference, simple factor/ratio, digit sums. No blind extrapolation from one pair.
check(2021,46,-4+(4+6));check(2021,47,133+54*1.5)
assert all(value==60/(i+1) for i,value in enumerate([60,30,20,15,12]));check(2023,47,60/6)
check(2024,46,5*13);check(2024,47,56+27*1.5)
check(2025,51,74+39+24);check(2025,52,572+5+7+2);check(2025,53,(50+18+4)+(162*1.5)/1000)
# Proportion/one-variable equations and constant-rate work.
check(2021,51,3/(5+9+10)*100);check(2021,52,((1132-31-2)/3.5)*1.5+2)
sum_eff=3/8;eff_b=1-2*sum_eff;eff_a=sum_eff-eff_b;check(2021,64,62/(11*eff_a+10*eff_b))
check(2022,55,(15*11-10*12.5)/(15-10),'clock');check(2022,57,4500/9+(8-5)*((4500/9-420)/(5-3)));check(2022,59,870+750+690-2*1000);check(2022,63,2*((21400-30*500)/(50-30))-500)
check(2023,51,(20*.84+388*1.2+612*.4+54*1.2)*30/132,'minutes');check(2023,52,(84-20-1.5*((84-35)-20/2.5))/.1)
check(2024,51,500*.9/(10*.02)*17.5);check(2024,52,(420/3.6)*3.6-180)
check(2024,59,.6+.5-.25);check(2024,61,(60*(5+6)-4*74)/(11-4))
widths=[n for n in range(1,271) if n*(n+3)==270];assert len(widths)==1;check(2024,63,(widths[0]+3)*3)
check(2024,64,180*.5-(180*.6-80))
check(2025,56,40-40*(24/32));v=800/36;length=v*45-800;v2=v*.75;check(2025,60,(v2*60+length)/v2)
check(2025,61,(2*2+5*1)/2);check(2025,63,21+22+19-(45-5)-12)
q=bank[2025,65];valid=[]
for i,t in enumerate(q['optionsHtml']):
 n=int(re.findall(r'\d+',plain(t))[0])
 if n%6==3 and n%11==0 and n%13==2:valid.append(i)
assert len(valid)==1 and chr(65+valid[0])==q['answer']
results.append({'year':2025,'paper':'江苏B回忆版','question_number':65,'independent_calculation':'passed','source_option_match':'unique','media_check':'not claimed'})
report={'version':'QS-HALF-20261027-v1','scope':'selected text-readable anchors, not 100 solved questions and not a released exercise pool','historical_rows':100,'numeric_rows':25,'arithmetic_rows':75,'checks':len(results),'results':results,'personal_records_exported':False,'source_questions_exported':False}
print(json.dumps(report,ensure_ascii=False,indent=2))
