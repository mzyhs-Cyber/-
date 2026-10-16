from __future__ import annotations
import hashlib
import json
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
VERSION = '2.4.1-candidate'

def text(html):
    return BeautifulSoup(html or '', 'html.parser').get_text(' ', strip=True)

def has_content(html):
    s = BeautifulSoup(html or '', 'html.parser')
    return bool(s.get_text(strip=True) or s.select_one('img[src], svg, math, table'))

def rich(node, base_url):
    if node is None:
        return ''
    s = BeautifulSoup(node.decode_contents(), 'html.parser')
    for x in s.select('script, style, noscript, input, button, textarea'):
        x.decompose()
    for x in s.find_all(True):
        for attr in list(x.attrs):
            if attr.startswith('on'):
                del x[attr]
    for img in s.select('img'):
        src = img.get('data-src') or img.get('data-original') or img.get('data-lazy-src') or img.get('src', '')
        if src:
            img['src'] = urljoin(base_url, src)
        for attr in ('srcset', 'sizes', 'data-src', 'data-original', 'data-lazy-src'):
            img.attrs.pop(attr, None)
    return s.decode_contents().strip()

def parse_question(html, base_url, order=None, subject='', material_html=''):
    s = BeautifulSoup(html, 'html.parser')
    errors = []
    ids = set()
    for x in s.select("[data-global-id], [data-question-id], [id^='section-solution-']"):
        value = x.get('data-global-id') or x.get('data-question-id')
        if not value:
            value = x['id'].removeprefix('section-solution-')
        if value:
            ids.add(str(value))
    if len(ids) != 1:
        errors.append('missing_platform_id' if not ids else 'conflicting_platform_ids')
    gid = next(iter(ids)) if len(ids) == 1 else None
    if order is None:
        node = s.select_one('[data-question-no], .question-number, .ti-number, .title-index')
        if node:
            raw = node.get('data-question-no') or node.get_text(' ', strip=True)
            m = re.fullmatch('\\s*(?:第\\s*)?(\\d{1,3})\\s*(?:题|[.、．])?\\s*', raw)
            order = int(m[1]) if m else None
    # Selector priority is semantic; a selector union uses document order and
    # can select the .ti-content wrapper containing answers, tools and icons.
    stem = None
    for selector in ("app-question-choice > .question-choice-container > app-format-html",
                     "app-question-choice article", "app-question-choice app-format-html",
                     "[data-role='stem']", ".ti-content"):
        stem = s.select_one(selector)
        if stem is not None:
            break
    stem_html = rich(stem, base_url)
    labels = []
    for selector in ('app-choice-radio ul > li > label', 'app-choice-checkbox ul > li > label', '.choice-radio-label', '.choice-checkbox-label', "[data-role='option']"):
        labels = s.select(selector)
        if labels:
            break
    options = []
    for label in labels:
        content = label.select_one('p.input-text, p, .option-content')
        if content is None:
            content = BeautifulSoup(str(label), 'html.parser').find()
            for ui in content.select('input, .input-radio, .input-checkbox, .option-letter'):
                ui.decompose()
        h = rich(content, base_url)
        options.append({'key': chr(65 + len(options)), 'text': text(h), 'html': h, 'images': image_urls(h)})
    ans_node = s.select_one('app-solution-overall .correct-answer, .correct-answer')
    answer = ans_node.get_text('', strip=True).upper() if ans_node else None
    if answer and (not re.fullmatch('[A-D]', answer)):
        errors.append('unsupported_answer_encoding')
    analysis_node = s.select_one("[id^='section-solution-'] .content app-format-html, [id^='section-solution-'] .content, .solution-analysis")
    analysis = rich(analysis_node, base_url)
    if BeautifulSoup(stem_html + analysis + ''.join((o['html'] for o in options)), 'html.parser').select_one('svg, math'):
        errors.append('inline_svg_math_requires_site_compatible_conversion')
    source_node = s.select_one("[id^='section-source-'] .content, .solution-source")
    source = rich(source_node, base_url)
    keypoints = [x.get_text(' ', strip=True) for x in s.select('.solution-keypoint-item-name, .keypoint-name')]
    rate_node = s.select_one('app-solution-overall .correct-rate, .right-rate, .correct-rate')
    raw_rate = rate_node.get_text('', strip=True) if rate_node else ''
    m = re.fullmatch('\\s*(\\d+(?:\\.\\d+)?)\\s*%\\s*', raw_rate)
    rate = float(m[1]) if m else None
    if rate is not None and (not 0 <= rate <= 100):
        rate = None
        errors.append('invalid_rate')
    if material_html:
        mat = BeautifulSoup(material_html, 'html.parser')
        material_html = rich(mat.select_one('.material-content') or mat, base_url)
    materials = []
    if material_html:
        mid = 'local-material:' + hashlib.sha256(material_html.encode()).hexdigest()[:24]
        materials.append({'globalId': mid, 'content': material_html})
    return {'globalId': gid, 'question_no': order, 'question_type': subject or '待分类', 'stem': text(stem_html), 'stem_html': stem_html, 'options': options, 'answer': answer, 'accuracy': raw_rate, 'rate': rate, 'analysis_html': analysis, 'keypoints': keypoints, 'source_html': source, 'materials': materials, 'images': list(dict.fromkeys(image_urls(stem_html) + image_urls(analysis) + [u for o in options for u in o['images']])), 'errors': errors}

def image_urls(html):
    return [x.get('src', '') for x in BeautifulSoup(html or '', 'html.parser').select('img')]

def validate_question(q):
    checks = {'platform_id': bool(q.get('globalId')), 'order': type(q.get('question_no')) is int and q['question_no'] > 0, 'stem': has_content(q.get('stem_html')), 'options': len(q.get('options', [])) == 4 and all((has_content(o.get('html')) for o in q['options'])), 'answer': q.get('answer') in ('A', 'B', 'C', 'D'), 'analysis': has_content(q.get('analysis_html')), 'media_sources': all((all(image_urls(h)) for h in [q.get('stem_html'), q.get('analysis_html')] + [o.get('html') for o in q.get('options', [])] + [m.get('content') for m in q.get('materials', [])])), 'materials': all((has_content(m.get('content')) and (not BeautifulSoup(m.get('content', ''), 'html.parser').select_one('svg, math')) for m in q.get('materials', []))), 'extraction': not q.get('errors')}
    return {'ok': all(checks.values()), 'checks': checks, 'missing': [k for k, v in checks.items() if not v]}

def to_v2(data):
    questions, materials, nodes = ([], {}, [])
    year_match = re.search('(?:19|20)\\d{2}', data.get('paper_title', ''))
    for q in sorted(data.get('questions', []), key=lambda x: x.get('question_no') or 10 ** 9):
        keys = []
        for mat in q.get('materials', []):
            mid = mat['globalId']
            if mid in materials and materials[mid] != mat:
                raise ValueError('material_id_conflict: ' + mid)
            materials[mid] = mat
            keys.append(mid)
        gid = q.get('globalId')
        subject = q.get('question_type') or '待分类'
        tags = list(dict.fromkeys(q.get('keypoints', [])))
        questions.append({'id': 'fenbi:' + gid if gid else None, 'globalId': gid, 'subject': subject, 'path': [t for t in tags if t != subject], 'tags': tags, 'year': int(year_match[0]) if year_match else None, 'order': q.get('question_no'), 'stemHtml': q.get('stem_html', ''), 'optionsHtml': [o.get('html', '') for o in q.get('options', [])], 'answer': q.get('answer'), 'explanationHtml': q.get('analysis_html') or None, 'source': text(q.get('source_html')), 'demo': False, 'rate': q.get('rate'), 'rateSource': data.get('page_url') if q.get('rate') is not None else None, 'totalCount': None, 'mostWrong': None})
        if not nodes or nodes[-1]['name'] != subject:
            nodes.append({'nodeType': 1, 'name': subject, 'children': []})
        nodes[-1]['children'].append({'nodeType': 2, 'key': gid, 'materialKeys': keys})
    return {'name': data.get('paper_title'), 'question_count': len(questions), 'card': {'nodeType': 0, 'children': nodes}, 'materials': list(materials.values()), 'questions': questions}

def validate_exam(data):
    qs = data.get('questions', [])
    rows = [{'question_no': q.get('question_no'), **validate_question(q)} for q in qs]
    expected = data.get('expected_count')
    issues = list(data.get('collection_errors', []))
    if not data.get('paper_title') or data['paper_title'] == '未命名试卷':
        issues.append('missing_paper_title')
    if type(expected) is not int or expected <= 0:
        issues.append('unknown_expected_count')
    elif len(qs) != expected:
        issues.append('question_count_mismatch')
    orders = [q.get('question_no') for q in qs]
    if type(expected) is int and sorted((n for n in orders if type(n) is int)) != list(range(1, expected + 1)):
        issues.append('non_contiguous_orders')
    ids = [q.get('globalId') for q in qs]
    if len(set(ids)) != len(ids):
        issues.append('duplicate_platform_ids')
    try:
        to_v2(data)
    except ValueError as exc:
        issues.append(str(exc))
    return {'ok': bool(qs) and (not issues) and all((r['ok'] for r in rows)), 'expected_questions': expected, 'total_questions': len(qs), 'complete_questions': sum((r['ok'] for r in rows)), 'incomplete_questions': sum((not r['ok'] for r in rows)), 'issues': issues, 'questions': rows, 'warnings': [{'question_no': q.get('question_no'), 'missing': [k for k in ('rate', 'keypoints', 'source_html') if q.get(k) in (None, '', [])] + (['subject'] if q.get('question_type') in (None, '', '待分类') else [])} for q in qs if q.get('rate') is None or not q.get('keypoints') or (not q.get('source_html')) or (q.get('question_type') in (None, '', '待分类'))]}

def media_manifest(v2):
    rows = []

    def add(html, **where):
        for index, src in enumerate(image_urls(html), 1):
            rows.append({**where, 'index': index, 'source': src, 'status': 'unchecked'})
    for q in v2['questions']:
        for field in ('stemHtml', 'explanationHtml'):
            add(q.get(field), globalId=q['globalId'], order=q['order'], field=field)
        for i, h in enumerate(q['optionsHtml']):
            add(h, globalId=q['globalId'], order=q['order'], field='optionsHtml', option=chr(65 + i))
    for m in v2['materials']:
        add(m['content'], materialId=m['globalId'], field='materials')
    return rows

def json_write(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)
