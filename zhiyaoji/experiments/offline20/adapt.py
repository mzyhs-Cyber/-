"""Read authorized local backup once; write private lightweight metadata, no ink traversal."""
import json,hashlib,re,collections,pathlib,datetime
ROOT=pathlib.Path(__file__).resolve().parent
SOURCE=ROOT.parent/'project_sources/02-_-_v3.json'
d=json.load(open(SOURCE)); extra=json.load(open(ROOT/'private/review_pages.json'))
subjects={'言语理解':'verbal','判断推理':'reasoning','资料分析':'data'}
formats={'文字资料','统计表','统计图','综合资料','普通篇章','常规问法','未细分','单定义-其他句式'}
def norm(s):
    # Include media URLs/embedded bytes before removing markup. Conservative exact fingerprint.
    s=str(s or '')
    media=re.findall(r'(?:src|href)=[\"\x27]([^\"\x27]+)',s)
    return re.sub(r'\s+','',re.sub('<[^>]+>','',s)).lower()+'|'+ '|'.join(media)
def adapt(q):
    sub=subjects.get(q.get('subject'))
    if not sub:return None
    paths=[p for p in q.get('path',[]) if p not in formats]
    topic='/'.join(sorted(set(paths)))
    ident=[]
    for k in ('canonicalId','sourceQuestionId','globalId'):
        if q.get(k):ident.append(k+':'+str(q[k]).removeprefix('fenbi:'))
    # sourceQuestionId/globalId share the same namespace, across imported paper aliases.
    sid=q.get('sourceQuestionId') or q.get('globalId')
    if sid:ident.append('source-id:'+str(sid).removeprefix('fenbi:'))
    if '::' in str(q.get('id')):ident.append('source-id:'+q['id'].split('::')[-1])
    if q.get('source'):ident.append('source:'+norm(q['source']))
    normalized=norm(q.get('stemHtml'))+'|'+json.dumps(sorted(norm(x)for x in q.get('optionsHtml',[])),ensure_ascii=False)+'|'+norm(q.get('materialHtml'))
    ident.append('fingerprint:'+hashlib.sha256(normalized.encode()).hexdigest())
    rate=q.get('rate');valid=isinstance(rate,(int,float))and not isinstance(rate,bool)and 0<=rate<=100
    media=bool(re.search('<img|<svg|<canvas',str(q.get('stemHtml',''))+str(q.get('materialHtml',''))+str(q.get('optionsHtml',[])),re.I))
    material=q.get('materialKey')
    if material:material=str(q.get('paperId'))+'::'+str(material)
    return dict(id=q['id'],subject=sub,topic=topic,topicKnown=bool(topic),difficulty=100-rate if valid else None,difficultyBasis='platform_rate_proxy' if valid else 'unknown',identities=ident,materialId=material,expectedCount=q.get('materialExpectedCount'),complete=bool(q.get('stemHtml'))and len(q.get('optionsHtml',[]))==4 and bool(q.get('explanationHtml')) and q.get('answer')in list('ABCD') and (not material or bool(q.get('materialHtml'))) and q.get('contentStatus')!='source_placeholder',verified=False,offlineMedia=not media,disputed=bool(q.get('answerConflict')),recentJiangsu='江苏' in q.get('source','')and(q.get('year')or 0)>=2022)
questions=[x for q in d['bank'] if(x:=adapt(q))]
byid={q['id']:q for q in d['bank']}
sessions=[]
for s in d['sessions']:
    rows=[]
    for q in s.get('questions',[]):
        if isinstance(q,str):qid=q;q=byid.get(qid,{})
        else:qid=q.get('id')
        if not qid:continue
        a=s.get('answers',{}).get(qid,{})
        rows.append(dict(questionId=qid,included=False,outcome='unanswered' if not a.get('selected') else 'correct' if a.get('selected')==q.get('answer') else 'wrong',confidence='unknown'))
    sessions.append(dict(id=s['id'],revision=0,updatedAt=s.get('updatedAt',0),finished=s.get('finished',False),confirmed=False,finishedAt=s.get('finishedAt')or 0,training=s.get('mode')=='daily',rows=rows))
merged={}
for p in extra:
    s=p['session'];t=merged.setdefault(s['id'],dict(s,questions=[],answers={},reviewFeedback={}))
    t['questions']+=s.get('questions',[]);t['answers'].update(s.get('answers',{}));t['reviewFeedback'].update(s.get('reviewFeedback',{}))
known={x['id']for x in questions}
for s in merged.values():
    rows=[]
    for q in s['questions']:
        a=s['answers'].get(q['id'],{});f=s['reviewFeedback'].get(q['id'],{})
        if q['id']not in known and(x:=adapt(q)):questions.append(x);known.add(x['id'])
        rows.append(dict(questionId=q['id'],included=f.get('excludeFromLearning')is False,outcome='unanswered' if not a.get('selected')else 'correct' if a.get('selected')==q.get('answer')else 'wrong',confidence='unknown'))
    sessions.append(dict(id=s['id'],revision=s.get('reviewRevision',0),updatedAt=s.get('reviewCompletion',{}).get('confirmedAt',0),finished=s.get('finished',False),confirmed=s.get('reviewCompletion',{}).get('status')=='confirmed',finishedAt=s.get('finishedAt')or 0,training=s.get('mode')=='daily',rows=rows))
out=ROOT/'private/metadata.json';out.write_text(json.dumps(dict(questions=questions,sessions=sessions),ensure_ascii=False))
audit=dict(backupDate=d['exportedAt'],bankTotal=len(d['bank']),threeSubjects=len(questions),legacySessions=len(d['sessions']),legacyConfirmed=0,cloudSampleSessions=len(merged),cloudSamplePositions=sum(len(s['questions'])for s in merged.values()),coverage='44 legacy backup sessions plus three confirmed cloud sample sessions; not full up-to-date account coverage',subjects={s:dict(total=sum(q['subject']==s for q in questions),knownTopics=sum(q['subject']==s and q['topicKnown']for q in questions),validRateProxy=sum(q['subject']==s and q['difficulty']is not None for q in questions),verifiedAnswers=sum(q['subject']==s and q['verified']for q in questions),offlineMediaKnown=sum(q['subject']==s and q['offlineMedia']for q in questions))for s in subjects.values()})
(ROOT/'private/audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
print(json.dumps(audit,ensure_ascii=False,indent=2))
