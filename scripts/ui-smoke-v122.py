#!/usr/bin/env python3
"""Optional local browser smoke. No external services or project writes."""
from pathlib import Path
import re, subprocess

root=Path(__file__).resolve().parent.parent
subprocess.run(['node',str(root/'scripts/render-preview.js'),'open'],check=True,capture_output=True,text=True)
markup=(root/'preview-open.html').read_text()

def inline(match):
    name=match.group(1)
    source=Path(name) if name.startswith('/') else root/name
    return '<script>\n'+source.read_text()+'\n</script>'

markup=re.sub(r'<script src="([^"]+)"></script>',inline,markup)
from playwright.sync_api import sync_playwright
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    try:
        page=browser.new_page(viewport={'width':1440,'height':920})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(markup,wait_until='load',timeout=60000)
        page.wait_for_timeout(350)
        assert not errors,errors
        assert page.locator('.nav-icon svg').count()==8
        assert page.locator('#discoveryView .workflow-step').count()==9
        assert page.locator('main:not(.hidden)').count()==1
        assert page.locator('button > svg.atgv-flat-icon + svg.atgv-flat-icon').count()==0
        page.evaluate("""() => {
          const row=document.createElement('div');row.id='atgvSmokeActions';row.className='handoff-row';
          row.innerHTML='<span class="handoff-badge blocked">Blocked</span><button id="atgvSmokeTransfer" class="secondary">Transfer</button><button id="atgvSmokeReject" class="secondary">Reject Transfer</button><button id="atgvSmokeMain">Start Work</button>';
          row.querySelector('#atgvSmokeTransfer').addEventListener('click',()=>window.__smokeTransfer=true);
          document.body.append(row);
        }""")
        page.wait_for_timeout(250)
        assert page.locator('#atgvSmokeActions .atgv-row-actions>button').count()==1
        assert page.locator('#atgvSmokeActions .atgv-action-menu>button').count()==2
        assert page.locator('#atgvSmokeActions .handoff-badge').get_attribute('data-atgv-status')=='warning'
        menu=page.locator('#atgvSmokeActions details')
        page.locator('#atgvSmokeActions summary').click()
        assert menu.get_attribute('open') is not None
        page.locator('#atgvSmokeTransfer').click()
        assert page.evaluate('window.__smokeTransfer===true')
        page.locator('#atgvSmokeActions summary').click()
        page.keyboard.press('Escape')
        assert menu.get_attribute('open') is None
        page.evaluate("atgvInlineNotice('Cannot save changes',true)")
        assert page.locator('#workView .atgv-page-feedback[role="alert"]').count()==1
        print('UI smoke: PASS — navigation, 9 milestones, icons, contextual actions, event handlers, menu keyboard, inline errors, no JS page errors.')
    finally:
        browser.close()
