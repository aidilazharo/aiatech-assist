from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
  page=browser.new_page(viewport={'width':1536,'height':920},device_scale_factor=1)
  errors=[]; logs=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:logs.append(m.text) if m.type=='error' else None)
  markup=(root/'preview-open.html').read_text()
  for folder,name in [('quill','quill.js'),('frappe-gantt','frappe-gantt.umd.js')]:
    import re
    markup=re.sub(r'<script src="[^"]*/media/vendor/'+folder+r'/'+name.replace('.','\.')+r'"></script>',lambda m:'<script>'+(root/'media/vendor'/folder/name).read_text()+'</script>',markup)
  markup=markup.replace('<script src="media/vendor/quill/quill.js"></script>','<script>'+(root/'media/vendor/quill/quill.js').read_text()+'</script>')
  markup=markup.replace('<script src="media/vendor/frappe-gantt/frappe-gantt.umd.js"></script>','<script>'+(root/'media/vendor/frappe-gantt/frappe-gantt.umd.js').read_text()+'</script>')
  for folder,name in [('frappe-gantt','frappe-gantt.css'),('quill','quill.snow.css')]:
    import re
    markup=re.sub(r'<link rel="stylesheet" href="(?:/mnt/data/atgv-dev-026/)?media/vendor/'+folder+r'/'+name.replace('.','\.')+r'">',lambda m:'<style>'+(root/'media/vendor'/folder/name).read_text()+'</style>',markup)
  page.set_content(markup,wait_until='load',timeout=15000)
  page.wait_for_timeout(700)
  print('view',page.locator('#workView').is_visible(),'planning',page.locator('#planningView').is_visible(),'roles',page.locator('#roleTimelineRole option').count(),'errors',errors)
  page.locator('[data-nav="planning"]').click()
  page.evaluate("""() => {
    const roles=[...document.querySelectorAll('#sidebarRole option')];
    const add=(n)=>{const d=new Date('2026-10-26T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
    const tasks=roles.map((opt,i)=>({id:opt.value,name:opt.textContent,start:add(i*7),end:add(i*7+6),progress:0,dependencies:''}));
    window.dispatchEvent(new MessageEvent('message',{data:{type:'planningLoaded',timeline:{tasks,revision:'mock'}}}));
  }""")
  page.wait_for_timeout(350)
  print('planning view' ,page.locator('#planningView').is_visible(), 'gantt bars', page.locator('#ganttChart .bar-wrapper').count(), 'fallback',page.locator('#ganttFallback').inner_text()[:130], 'errors',errors)
  page.evaluate("window.__clicks=[];document.querySelector('#ganttChart').addEventListener('click', e=>window.__clicks.push({tag:e.target.tagName,cls:e.target.getAttribute('class')}),true)")
  
  if page.locator('#ganttChart .bar-wrapper').count():
    b=page.locator('#ganttChart .bar-wrapper').nth(0)
    b.scroll_into_view_if_needed(timeout=5000)
    print('clicked bar',b.get_attribute('data-id'))
    page.locator('#ganttChart .bar-wrapper .bar').first.click(force=True)
  else:
    page.locator('#ganttFallback button').first.click()
  print('click events',page.evaluate('window.__clicks'))
  print('one modal visible',page.locator('#timelineModal').is_visible(),'class',page.locator('#timelineModal').get_attribute('class'),'role selected',page.locator('#roleTimelineRole').input_value(),'errors',errors,'logs',logs)
  assert page.locator('#timelineModal').is_visible(), 'Clicking Gantt bar did not open role modal'
  page.locator('#roleTimelineDuration').fill('10')
  print('duration 10',page.locator('#roleTimelineStart').input_value(),page.locator('#roleTimelineEnd').input_value(),page.locator('#roleTimelineSave').is_enabled())
  page.screenshot(path='/mnt/data/ATGV-0.00.26-Role-Modal.png',full_page=True)
  page.on('dialog',lambda d:d.accept())
  page.locator('#timelineModalCancel').click()
  page.locator('#openPlanningTimelineModal').click()
  print('bulk visible',page.locator('#bulkTimelineModal').is_visible(),'rows',page.locator('#bulkTimelineRows tr').count())
  a=page.locator('#bulkTimelineRows tr').first
  a.locator('[data-field="duration"]').fill('14')
  print('bulk first row',a.locator('[data-field="start"]').input_value(),a.locator('[data-field="end"]').input_value())
  page.screenshot(path='/mnt/data/ATGV-0.00.26-Bulk-Modal.png',full_page=True)
  assert page.locator('#bulkTimelineRows tr').count()==page.locator('#sidebarRole option').count()
  page.locator('#bulkTimelineSave').click()
  print('bulk posted command',page.evaluate('window.__atgvSent.command'))
  assert page.evaluate('window.__atgvSent.command')=='saveBulkRoleTimelines'
  print('errors',errors,'logs',logs)
  browser.close()
