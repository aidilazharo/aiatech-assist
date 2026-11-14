from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':1366,'height':960},device_scale_factor=1)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    markup=(root/'preview-open.html').read_text()
    for folder,name in [('quill','quill.js'),('frappe-gantt','frappe-gantt.umd.js')]:
      import re
      markup=re.sub(r'<script src="[^\"]*/media/vendor/'+folder+r'/'+name.replace('.','\\.')+r'"></script>',lambda m:'<script>'+(root/'media/vendor'/folder/name).read_text()+'</script>',markup)
    for folder,name in [('quill','quill.snow.css'),('frappe-gantt','frappe-gantt.css')]:
      import re
      markup=re.sub(r'<link rel="stylesheet" href="[^\"]*/media/vendor/'+folder+r'/'+name.replace('.','\\.')+r'">',lambda m:'<style>'+(root/'media/vendor'/folder/name).read_text()+'</style>',markup)
    page.set_content(markup, wait_until='load')
    page.wait_for_timeout(1250)
    print('discovery visible:',page.locator('#discoveryView').is_visible(),'BR cards:',page.locator('.br-card').count(),'errors:',errors)
    assert page.locator('#discoveryView').is_visible()
    assert page.locator('.br-card').count()==2
    page.locator('.br-card button').first.click()
    assert page.locator('#brEditModal').is_visible()
    page.locator('#brEditObjective').fill('Reduced processing time and fewer defects')
    page.locator('#brEditForm button[type=submit]').click()
    assert page.evaluate('window.__atgvSent.command')=='brEdit'
    print('edit command:',page.evaluate('window.__atgvSent.command'))
    page.dispatch_event('body','click')
    page.screenshot(path='/mnt/data/ATGV-0.00.28-BR-Workflow.png',full_page=True)
    page.locator('#brJiraPreview').click()
    assert page.evaluate('window.__atgvSent.command')=='brJiraPreview'
    page.evaluate("window.dispatchEvent(new MessageEvent('message',{data:{type:'brJiraPlan',revision:'test-register',changes:[{path:'BR-002',kind:'Epic',action:'create',title:'Claims approval workflow'}]}}))")
    assert page.locator('#brJiraSync').is_enabled()
    page.locator('#brJiraSync').click()
    assert page.evaluate('window.__atgvSent.command')=='brJiraSync'
    print('Jira preview and confirmation command:',page.evaluate('window.__atgvSent.command'),'errors:',errors)
    assert not errors
    browser.close()
