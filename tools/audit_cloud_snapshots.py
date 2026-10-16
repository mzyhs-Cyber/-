"""Audit saved, authorized cloud-browser DOM snapshots without browser credentials.
This audits live DOM reads, not the standalone collector's browser navigation.
"""
import argparse
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin
from bank_core import parse_question, validate_exam, to_v2, media_manifest

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def run(source, output):
    output.mkdir(parents=True, exist_ok=True)
    results=[]
    for path in sorted(source.glob('live_*_snapshot.json')):
        raw=json.loads(path.read_text()); s=raw['snapshot']; label=path.stem.removeprefix('live_').removesuffix('_snapshot')
        folder=output/label;folder.mkdir(exist_ok=True)
        counts=s['counts']; errors=[]
        if len(counts)!=1:errors.append('ambiguous_or_missing_page_total')
        if s['unresolvedMaterials']:errors.append('unresolved_visible_material')
        qs=[parse_question(r['html'],raw['url'],r['order'],r['subject'],r['material']) for r in s['rows']]
        data={'paper_title':s['title'],'page_url':raw['url'],'expected_count':counts[0] if len(counts)==1 else None,'questions':qs,'collection_errors':errors,'count_evidence':s['countEvidence']}
        audit=validate_exam(data);v2=to_v2(data)
        seen={}
        for item in json.loads(path.with_name(path.name.replace('_snapshot','_media')).read_text()):
            u=urljoin(raw['url'],item['src'] or '');seen[u]=seen.get(u,False) or item['loaded']
        manifest=media_manifest(v2)
        for item in manifest:
            item['status']='loaded_in_live_browser' if seen.get(item['source']) else ('failed_in_live_browser' if item['source'] in seen else 'not_observed_in_live_browser')
        bad=[m for m in manifest if m['status']!='loaded_in_live_browser']
        okay=audit['ok'] and not bad
        write(folder/'questions.json',data);write(folder/'audit.json',audit);write(folder/'media_manifest.json',manifest)
        write(folder/('paper_v2.json' if okay else 'paper_v2_pending.json'),v2)
        write(folder/'source_provenance.json',{'page_url':raw['url'],'captured_at':raw['capturedAt'],'method':raw['kind'],'count_evidence':s['countEvidence'],'media_policy':'Online rendered-image check only; remote URLs retained, no offline media bundle.'})
        result={'paper':label,'name':s['title'],'page_total':data['expected_count'],'questions':len(qs),'structure_ok':audit['ok'],'material_groups':len(v2['materials']),'material_questions':sum(bool(q.get('materials')) for q in qs),'rates':sum(q['rate'] is not None for q in qs),'subjects':dict(Counter(q['question_type'] for q in qs)),'media_references':len(manifest),'bad_media_references':len(bad),'bad_media_unique':len({m['source'] for m in bad}),'bad_media_questions':sorted({m['order'] for m in bad if 'order' in m}),'online_dom_check_passed':okay,'standalone_collector_acceptance':False,'website_import_acceptance':False}
        write(folder/'validation_receipt.json',result);results.append(result)
    write(output/'RESULTS.json',results)
    print(json.dumps(results,ensure_ascii=False,indent=2))

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('source',type=Path);a.add_argument('output',type=Path);args=a.parse_args();run(args.source,args.output)
