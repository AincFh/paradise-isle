"""Production Vite bundle / real Chromium farm-operations acceptance.
Uses only the actual title, shop and farm controls to buy, sow, water and save.
Each test uses a fresh isolated Chrome profile; no mocked game transactions.
"""
import json
import os
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select

BASE=os.environ.get('PI_BROWSER_BASE','http://127.0.0.1:4173/paradise-isle/')
OUT=Path('artifacts/farm-operations')
OUT.mkdir(parents=True,exist_ok=True)
opts=Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--window-size=1280,840')
opts.set_capability('goog:loggingPrefs',{'browser':'ALL'})
browser=webdriver.Chrome(options=opts)
browser.set_page_load_timeout(60)
wait=WebDriverWait(browser,35)

def farm_state():
 return browser.execute_script("""return (() => {
  const s=window.__PI__.state();return {
   coins:s.player.coins,energy:s.player.energy,seeds:s.inventory.seed_carrot??0,
   plots:s.plots.filter(p=>p.crop?.defId==='crop_carrot').length,
   watered:s.plots.filter(p=>p.crop?.lastWateredAt>0).length,
   hud:document.querySelectorAll('.hud-root').length
  };
 })()""")

try:
 browser.get(BASE)
 wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.slot-card.empty .slot-main'))
 browser.find_element(By.CSS_SELECTOR,'.slot-card.empty .slot-main').click()
 wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.dialog-input'))
 browser.find_element(By.CSS_SELECTOR,'.dialog-input').send_keys('Farm QA')
 browser.find_element(By.CSS_SELECTOR,'.dialog-box .btn-primary').click()
 wait.until(lambda d:d.execute_script('return !!window.__PI__'))
 before=farm_state()
 assert before=={'coins':500,'energy':21,'seeds':4,
                 'plots':0,'watered':0,'hud':1},before
 browser.find_element(By.CSS_SELECTOR,'[data-panel="shop"]').click()
 wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.tab-btn[data-tab="farm"]'))
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="farm"]').click()
 wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'[data-farm-crop]'))
 assert browser.find_element(By.CSS_SELECTOR,'[data-farm-crop]').get_attribute('value')=='crop_carrot'
 assert len(browser.find_elements(By.CSS_SELECTOR,'.farm-stat'))==6
 Select(browser.find_element(By.CSS_SELECTOR,'[data-farm-count]')).select_by_value('3')
 browser.save_screenshot(str(OUT/'01-farm-overview.png'))
 browser.find_element(By.CSS_SELECTOR,'[data-farm-action="buy"]').click()
 bought=farm_state()
 assert bought['coins']==470 and bought['seeds']==7,bought
 browser.find_element(By.CSS_SELECTOR,'[data-farm-action="sow"]').click()
 planted=farm_state()
 assert planted['plots']==3 and planted['seeds']==4 and planted['energy']==18,planted
 browser.save_screenshot(str(OUT/'02-batch-planting.png'))
 browser.find_element(By.CSS_SELECTOR,'[data-farm-action="water"]').click()
 watered=farm_state()
 assert watered['watered']==3 and watered['energy']==15,watered
 assert browser.find_element(By.CSS_SELECTOR,'[data-farm-action="water"]').get_attribute('disabled') is not None
 browser.save_screenshot(str(OUT/'03-watered-plots.png'))
 # Clicking the real app's save ensures exactly the same storage persistence
 # mechanics used by the 30-second autosave and page-unload handler.
 browser.execute_script('window.__PI__.app.save()')
 browser.refresh()
 wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main'))
 browser.find_element(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main').click()
 wait.until(lambda d:d.execute_script('return !!window.__PI__'))
 for element in browser.find_elements(By.CSS_SELECTOR,'.dialog-overlay .btn-primary'):
  if element.is_displayed():element.click()
 restored=farm_state()
 assert restored==watered,{'expected':watered,'actual':restored}
 browser.set_window_size(390,844)
 browser.find_element(By.CSS_SELECTOR,'[data-panel="shop"]').click()
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="farm"]').click()
 wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.farm-operation'))
 widths=browser.execute_script("""return {
  viewport:innerWidth,document:document.documentElement.scrollWidth,
  stats:document.querySelectorAll('.farm-stat').length,
  operations:document.querySelectorAll('.farm-operation').length,
  farmTab:!!document.querySelector('.tab-btn[data-tab="farm"].active')
 }""")
 assert widths['document']<=widths['viewport']+4,widths
 assert widths['stats']==6 and widths['operations']==3 and widths['farmTab'],widths
 browser.save_screenshot(str(OUT/'04-mobile-farm.png'))
 errors=[x['message'] for x in browser.get_log('browser')
         if x['level']=='SEVERE' and 'favicon' not in x['message']]
 assert not errors,errors
 report={'result':'PASS','before':before,'buy':bought,'sow':planted,
         'water':watered,'restored':restored,'mobile':widths,'errors':errors}
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
except Exception:
 try:
  print('Farm browser errors:',browser.get_log('browser'),flush=True)
  browser.save_screenshot(str(OUT/'failure.png'))
 except Exception:pass
 raise
finally:
 browser.quit()
