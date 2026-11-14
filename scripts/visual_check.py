from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
 for mode in ['search','selected','tested','initialized','open']:
  page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
  page.add_init_script('''window.__atgvErrors=[];window.addEventListener('error',e=>window.__atgvErrors.push(e.message));''')
  page.set_content((root/f'preview-{mode}.html').read_text(),wait_until='load',timeout=10000)
  page.wait_for_timeout(550)
  print(mode,'errors',page.evaluate('window.__atgvErrors'),'shell',page.locator('.sidebar').is_visible(),'gate',page.locator('#gateView').is_visible())
  page.screenshot(path=str(root.parent/f'ATGV-0.00.09-{mode}.png'),full_page=True)
  if mode=='search':
   assert page.locator('.sidebar').is_visible()==False
   assert page.locator('#gateQuery').is_visible()
  if mode=='selected':
   assert page.locator('#gatePrimary').inner_text()=='Test Connection'
   page.locator('#gatePrimary').click()
   assert page.evaluate('window.__atgvSent.command')=='openingTest'
  if mode=='tested':
   assert page.locator('#gatePrimary').inner_text()=='Initialize Folder and Files'
   page.locator('#gatePrimary').click()
   assert page.evaluate('window.__atgvSent.command')=='openingInitialize'
  if mode=='initialized':
   assert page.locator('#gatePrimary').inner_text()=='Open Project'
   page.locator('#gatePrimary').click()
   assert page.evaluate('window.__atgvSent.command')=='openingOpen'
  if mode=='open':assert page.locator('.sidebar').is_visible()
  assert not page.evaluate('window.__atgvErrors')
  page.close()
 browser.close()
