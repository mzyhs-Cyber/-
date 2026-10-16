"""End-to-end packaged EXE check using only original synthetic pages."""
import asyncio
import base64
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from PIL import Image
from playwright.async_api import async_playwright

async def batch_smoke_test():
    from batch_runner import choose_targets, run_batch
    from fenbi_crawler_v2 import valid_receipt
    pixels=io.BytesIO();Image.new('RGB',(2,2),'white').save(pixels,format='PNG')
    pixel='data:image/png;base64,'+base64.b64encode(pixels.getvalue()).decode()
    names=['国考','安徽','北京','江苏'];visits=[]
    listing=''.join(f'<span class="categories-item" onclick="sessionStorage.cat={i};draw()">{name}</span>' for i,name in enumerate(names))
    listing+='<main></main><script>const names='+json.dumps(names)+';function draw(){let c=Number(sessionStorage.cat||0);document.querySelector("main").innerHTML=[1,2].map(n=>`<div class="paper-item"><a class="item-info-title" href="/exam/solution/${c}-${n}">${names[c]}原创验收卷${n}</a></div>`).join("")}draw()</script>'
    async def route(r):
        url=r.request.url
        if url.endswith('/list'):body=listing
        else:
            key=url.rsplit('/',1)[-1];visits.append(key);c,n=map(int,key.split('-'))
            options=''.join(f'<li><label class="choice-radio-label"><p class="input-text">原创选项{x}</p></label></li>' for x in 'ABCD')
            body=f'''<h1>{names[c]}原创验收卷{n}</h1><div class="paper-summary">共1题</div>
            <div class="question-group"><app-materials><div class="materials-container"><div class="material-content"><p>原创公共材料<img src="{pixel}"></p></div></div></app-materials>
            <app-ti data-question-no="1" data-subject="判断推理"><app-question-choice><div class="question-choice-container"><app-format-html><p>原创验收题{key}<img src="{pixel}"></p></app-format-html><app-choice-radio><ul>{options}</ul></app-choice-radio></div></app-question-choice>
            <app-solution-overall><span class="correct-answer">B</span><span class="correct-rate">60%</span></app-solution-overall>
            <section id="section-solution-id{key}"><div class="content"><p>原创解析<img src="{pixel}"></p></div></section></app-ti></div>'''
        await r.fulfill(body=body,content_type='text/html; charset=utf-8')
    async with async_playwright() as p:
        launch={'headless':True}
        if os.environ.get('TEST_CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['TEST_CHROMIUM_EXECUTABLE']
        browser=await p.chromium.launch(**launch)
        try:
            context=await browser.new_context();await context.route('https://www.fenbi.com/**',route)
            page=await context.new_page();await page.goto('https://www.fenbi.com/list')
            with patch('builtins.input',side_effect=['1,2,3,4']+['1-2','s']*4):plan=await choose_targets(page,None)
            if len(plan)!=8 or [t['listing']['category'] for t in plan]!=[c for c in names for _ in range(2)]:raise RuntimeError('Multi-category selection mismatch')
            with TemporaryDirectory() as td,patch('builtins.input',side_effect=AssertionError('Unexpected midrun input')):
                args=SimpleNamespace(output=Path(td),daily_target=8,max_rounds=3,download_images=True,auto_submit=False,headless=True,paper_retries=0,paper_timeout=30,auth_wait=1)
                job=await run_batch(context,page,args,{},plan)
                if not job['target_met'] or job['complete_papers']!=8:raise RuntimeError('Packaged batch failed: '+json.dumps(job,ensure_ascii=False))
                for paper in job['papers']:
                    receipt=paper['receipt'];folder=Path(receipt['path'])
                    if not valid_receipt(receipt):raise RuntimeError('Invalid receipt')
                    data=json.loads((folder/'paper_v2.json').read_text(encoding='utf-8'))
                    if len(data['questions'])!=1 or data['questions'][0]['answer']!='B' or len(data['materials'])!=1:raise RuntimeError('Packaged output content mismatch')
                    media=json.loads((folder/'media_manifest.json').read_text(encoding='utf-8'))
                    if not media or any(m['status']!='verified' or not (folder/m['local_path']).is_file() for m in media):raise RuntimeError('Packaged media missing')
                before=list(visits);resumed=await run_batch(context,page,args,{},None)
                if not resumed['target_met'] or before!=visits:raise RuntimeError('Resume reopened completed papers')
            print('Packaged multi-category batch smoke test passed: 4 categories, 8 papers, exported content/materials/images and no-reopen resume.',flush=True)
        finally:await browser.close()
