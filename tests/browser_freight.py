"""Paradise Isle production bundle: freight acceptance, cargo deductions, persistence and mobile."""
import json
import os
import pathlib
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BASE=os.environ.get("PI_BROWSER_BASE","http://127.0.0.1:4173/paradise-isle/")
PROOF=pathlib.Path("artifacts/freight")
PROOF.mkdir(parents=True,exist_ok=True)
opts=Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--window-size=1240,820")
opts.set_capability("goog:loggingPrefs",{"browser":"ALL"})
browser=webdriver.Chrome(options=opts)
wait=WebDriverWait(browser,35)

try:
 browser.get(BASE)
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,".slot-card.empty .slot-main"))
 browser.find_element(By.CSS_SELECTOR,".slot-card.empty .slot-main").click()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,".dialog-input"))
 browser.find_element(By.CSS_SELECTOR,".dialog-input").send_keys("Freight Port QA")
 browser.find_element(By.CSS_SELECTOR,".dialog-box .btn-primary").click()
 wait.until(lambda b:b.execute_script("return !!window.__PI__"))
 before=browser.execute_script("""return (()=>{const s=window.__PI__.state();
   return {coins:s.player.coins,shipping:s.shipping,inventory:{...s.inventory}}})()""")
 assert before["shipping"]["completed"]==0,before
 browser.find_element(By.CSS_SELECTOR,'[data-panel="shop"]').click()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'.tab-btn[data-tab="freight"]'))
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="freight"]').click()
 wait.until(lambda b:len(b.find_elements(By.CSS_SELECTOR,'[data-freight-offer]'))==3)
 quote=browser.execute_script("""return (()=>{const cards=[...document.querySelectorAll('[data-freight-offer]')];
   return {count:cards.length,first:cards[0].getAttribute('data-freight-offer'),
   title:document.querySelector('.freight-overview h3')?.textContent,
   buttons:cards.map(c=>c.querySelector('[data-freight-accept]')!==null)}})()""")
 assert quote["count"]==3 and all(quote["buttons"]),quote
 browser.save_screenshot(str(PROOF/"01-freight-offers.png"))

 browser.find_element(By.CSS_SELECTOR,'[data-freight-offer] [data-freight-accept]').click()
 accepted=browser.execute_script("""return (()=>{const s=window.__PI__.state();
   return {job:s.shipping.active,coins:s.player.coins,accepted:s.shipping.lastAcceptedDay,
     hasDeliver:!!document.querySelector('[data-freight-deliver]')}})()""")
 assert accepted["job"] and accepted["hasDeliver"],accepted
 assert accepted["coins"]==before["coins"],accepted
 cargo=accepted["job"]["itemId"]
 quantity=accepted["job"]["quantity"]
 assert quantity>=2
 # Speed the E2E along with a test-provided harvest. The acceptance,
 # delivery, rewarding and save/reload paths are all real UI interactions.
 browser.execute_script("""window.__PI__.state().inventory[%s]=1;"""%json.dumps(cargo))
 # Re-open the tab to refresh the actual inventory-checked action.
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="workshop"]').click()
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="freight"]').click()
 browser.find_element(By.CSS_SELECTOR,'[data-freight-deliver]').click()
 partial=browser.execute_script("""return (()=>{const s=window.__PI__.state();
  return {delivered:s.shipping.active?.delivered,coins:s.player.coins,
   stock:s.inventory[%s]||0,completed:s.shipping.completed}})()"""%json.dumps(cargo))
 assert partial=={"delivered":1,"coins":before["coins"],"stock":0,"completed":0},partial
 browser.save_screenshot(str(PROOF/"02-partial-freight.png"))

 browser.execute_script("window.__PI__.app.save()")
 browser.refresh()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main'))
 browser.find_element(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main').click()
 wait.until(lambda b:b.execute_script("return !!window.__PI__"))
 recovered=browser.execute_script("""return (()=>{const s=window.__PI__.state();
  return {job:s.shipping.active,coins:s.player.coins,completed:s.shipping.completed}})()""")
 assert recovered["job"]["delivered"]==1 and recovered["coins"]==before["coins"],recovered
 browser.execute_script("window.__PI__.state().inventory[%s]=%s"%(json.dumps(cargo),quantity-1))
 browser.find_element(By.CSS_SELECTOR,'[data-panel="shop"]').click()
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="freight"]').click()
 browser.find_element(By.CSS_SELECTOR,'[data-freight-deliver]').click()
 settled=browser.execute_script("""return (()=>{const s=window.__PI__.state();
  return {coins:s.player.coins,xp:s.player.xp,completed:s.shipping.completed,
  active:s.shipping.active,stock:s.inventory[%s]||0,
  summary:document.querySelector('[data-freight-done]')?.textContent}})()"""%json.dumps(cargo))
 assert settled["coins"]==before["coins"]+accepted["job"]["rewardCoins"],settled
 assert settled["completed"]==1 and settled["active"] is None,settled
 assert settled["stock"]==0 and settled["summary"],settled
 assert not browser.find_elements(By.CSS_SELECTOR,'[data-freight-accept]'),settled
 browser.save_screenshot(str(PROOF/"03-completed-freight.png"))

 browser.set_window_size(390,844)
 # Mobile must keep the full order board accessible without horizontal clip.
 mobile=browser.execute_script("""return (()=>{const a=document.querySelector('.freight-overview').getBoundingClientRect();
   return {width:innerWidth,left:a.left,right:a.right,
     panel:document.querySelector('.modal-panel').getBoundingClientRect().right,
     completed:!!document.querySelector('[data-freight-done]')}})()""")
 assert mobile["completed"] and mobile["left"]>=0 and mobile["right"]<=mobile["width"]+2,mobile
 browser.save_screenshot(str(PROOF/"04-mobile-freight.png"))
 errors=[x["message"] for x in browser.get_log("browser") if x["level"]=="SEVERE" and "favicon" not in x["message"]]
 assert not errors,errors
 result={"status":"PASS","offers":quote,"accepted":accepted,"partial":partial,
   "restored":recovered,"completed":settled,"mobile":mobile,"consoleErrors":errors}
 (PROOF/"report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps(result,ensure_ascii=False),flush=True)
finally:
 browser.quit()
