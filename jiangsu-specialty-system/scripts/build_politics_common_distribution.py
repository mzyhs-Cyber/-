"""Reproducible, sanitized topic counts from the explicitly authorized backup.
Exports no stems, options, answers, original private IDs, attempts or ink.
"""
import argparse,csv,json,collections,re,pathlib

TOPICS={
2021:'十四五经济目标|2035法治建设目标|社会革命与自我革命的哲理|区域经贸协定|法治思想内容边界|对外开放政策|党史事件历史意义|芯片基础科技|行政复议资格与争议行为|公共设施侵权与物业责任|交通执法权限边界|行政许可强制程序|吊销资质与行政诉讼|违法审批政策与处罚救济|国家赔偿与先行行政处理',
2022:'新思想核心概括与新增内容|精神与事业关系的哲理|法律与道德关系|共同富裕政策内涵|敏感个人信息范围|战略高技术成就|航天时点与节气换算|法律与习俗关系|行政拘留执行与未成年人照料|执法文书事实依据与记载|名誉隐私与服务收费|网购运输损失与合同相对性|隐私权与自力救济|古语与微治理理念|行政强制执行与不履职救济|行政处罚比例与司法审查|农村房屋交易与征收补偿|林地征收与林木损失补偿|扣押违法与行政赔偿范围|征收复议诉讼与赔偿举证',
2023:'新时代成就事实核对|总体国家安全观与报告表述|中华文明探源成果|载人航天具体任务|农业文化遗产特征|人大制度与毛泽东著作|光电子基础科技|新污染物与治理科学|数字经济作用|充电桩安装与物业合同义务|行政处罚行为性质识别|末位考核调岗与解除劳动合同|处罚回避主体与行政复议|身份冒用与社会救助补发|消费者选择权与公益诉讼|下班途中事故与工伤认定|行政处罚听证与主持回避|租赁效力与安全生产责任|强制拆违职责与诉讼主体|虚假登记与行政司法效力',
2024:'中国式现代化特征与意义|高水平开放政策|新质生产力内涵边界|现代金融体系建设要求|自贸试验区制度创新|殷墟文明与古代科技|新型电力系统政策构成|结构性货币政策工具|柔性执法与首违不罚条件|公务员营利活动限制|法律价值与人本理念|紧急救助损害与补偿|停车监控与物业责任|行政刑事处罚衔接与一事不再罚|扣押程序权限期限与文书|打赏赠与与行政管制边界|民行交叉诉讼与履职救济|食品消费惩罚赔偿与公益诉讼|博弈交易效力与返还|有奖销售承诺与合同履行',
2025:'新思想历史地位与时代错配|全面从严治党与自我革命|江苏四个新任务与措施匹配|中华文明连续性依据|法治道路核心要义|高水平市场经济体制改革|以人民为中心的措施辨别|高质量充分就业的概念与政策|美丽江苏与生态措施边界|行政执法体制改革与裁量基准|政协制度与传统文化精神|国企核心功能边界|公务员职业道德|汉代竹简图像与古代知识|石墨材料基础科技|公正司法原则|网购不实宣传与合同责任|处罚主观过错与比例原则|内部批复外化与行政诉讼被告|行政许可延续与相邻利益'
}
POL_2025={1:'新思想总论',2:'党建与自我革命',3:'中国式现代化江苏任务综合',4:'文化思想与文明特征',5:'法治思想与执法改革',6:'经济体制改革',7:'民生与社会建设',8:'民生与社会建设',9:'生态文明建设',10:'法治思想与执法改革'}
GROUPS=['行政法','民法典','法理学','其他法律','理论时政与治理','科技地理环保','历史文化','经济基础']
def group(q):
 p=q.get('path',[]);y=q['year'];n=q['paperOrder']
 if q['subject']=='政治理论':return POL_2025[n]
 for label in ['行政法','民法典','法理学']:
  if label in p:return label
 if any(label in p for label in ['其他法律法规','劳动法和经济法']):return '其他法律'
 if (y,n) in [(2021,8),(2022,6),(2022,7),(2023,4),(2023,7),(2023,8),(2025,15)]:return '科技地理环保'
 if (y,n) in [(2023,3),(2023,5),(2024,6),(2025,14)]:return '历史文化'
 if (y,n) in [(2023,9),(2024,8)]:return '经济基础'
 return '理论时政与治理'

def main():
 a=argparse.ArgumentParser();a.add_argument('backup');a.add_argument('--out',default='pc_audit');args=a.parse_args();out=pathlib.Path(args.out);out.mkdir(exist_ok=True)
 bank=json.load(open(args.backup))['bank'];rows=[];seen=set()
 for q in sorted(bank,key=lambda q:(q.get('year') or 0,q.get('paperOrder') or 0)):
  y=q.get('year');title=q.get('paperTitle','')
  if y not in TOPICS or '江苏' not in title or not re.search(r'B|Ｂ',title) or q.get('subject') not in ['常识判断','政治理论']:continue
  n=q['paperOrder'];key=(y,n)
  if key in seen:raise AssertionError('duplicate year/number')
  seen.add(key);topic=TOPICS[y].split('|')[n-1];stem=re.sub('<[^>]*>','',q['stemHtml'])
  multi=any(x in stem for x in ['①','（1）','(1)']);count_form=all(re.fullmatch(r'\s*\d+项\s*',re.sub('<[^>]*>','',o)) for o in q['optionsHtml'])
  form='多陈述计数单选' if multi and count_form else '陈述组合单选' if multi else '普通四选一'
  rows.append({'year':y,'paper':'江苏B回忆版','question_number':n,'original_section':q['subject'],'primary_group':group(q),'micro_topic':topic,'original_taxonomy':'/'.join(q.get('path',[])),'question_format':form,'has_stem_image':bool(re.search('<img|<svg',q['stemHtml'],re.I)),'jiangsu_named_context':y==2025 and n in [3,9],'scope':'topic-classification only; not solution/media/live-dedup eligible'})
 expected={2021:15,2022:20,2023:20,2024:20,2025:20}
 for y,n in expected.items():assert {r['question_number'] for r in rows if r['year']==y}==set(range(1,n+1))
 with open(out/'politics-common-sense-question-map.csv','w',newline='') as f:w=csv.DictWriter(f,rows[0].keys());w.writeheader();w.writerows(rows)
 summary={'version':'PC-DIST-20261027-v1','requested_window':[2022,2023,2024,2025,2026],'available_window':[2022,2023,2024,2025],'supplemental_year':2021,'missing_year':2026,'classification':'one mutually exclusive primary group per question; extra local-context and format tags are non-additive','raw_total':len(rows),'years':{},'politics_2025':{},'eligible_added':0}
 for y,n in expected.items():
  yr=[r for r in rows if r['year']==y];common=[r for r in yr if r['original_section']=='常识判断'];law=[r for r in common if r['primary_group'] in ['行政法','民法典','法理学','其他法律']]
  summary['years'][str(y)]={'politics_section':len(yr)-len(common),'common_sense':len(common),'primary_common_sense_counts':dict(collections.Counter(r['primary_group'] for r in common)),'law':len(law),'official_separate_politics':y==2025}
 pol=[r for r in rows if r['original_section']=='政治理论'];summary['politics_2025']={'topic_counts':dict(collections.Counter(r['primary_group'] for r in pol)),'formats':dict(collections.Counter(r['question_format'] for r in pol)),'jiangsu_context_question_numbers':[r['question_number'] for r in pol if r['jiangsu_named_context']]}
 assert summary['politics_2025']['formats']=={'陈述组合单选':8,'多陈述计数单选':1,'普通四选一':1}
 assert sum(summary['years'][str(y)]['common_sense'] for y in range(2022,2026))==70
 assert sum(summary['years'][str(y)]['law'] for y in range(2022,2026))==42
 (out/'politics-common-sense-counts.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
