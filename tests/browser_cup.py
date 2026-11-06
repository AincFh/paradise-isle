"""Production Chromium: enter Harbor Fishing Cup, award medals, persist and test touch layout.

The *core unit tests* verify score generation from real resolveCatch() only.
Browser QA seeds a completed competition (as freight QA seeds earned cargo) so
it can check UI payout and persistence without relying on random bite timing.
"""
import json
import os
import pathlib
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE=os.environ.get("PI_BROWSER_BASE","http://127.0.0.1:4173/paradise-isle/")
PROOF=pathlib.Path("artifacts/cup")
PROOF.mkdir(parents=True,exist_ok=True)
opts=Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--window-size=1240,820")
opts.set_capability("goog:loggingPrefs",{"browser":"ALL"})
browser=webdriver.Chrome(options=opts)
wait=WebDriverWait(browser,40)
try:
 browser.get(BASE)
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'.slot-card.empty .slot-main'))
 browser.find_element(By.CSS_SELECTOR,'.slot-card.empty .slot-main').click()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'.dialog-input'))
 browser.find_element(By.CSS_SELECTOR,'.dialog-input').send_keys('Angler Cup QA')
 browser.find_element(By.CSS_SELECTOR,'.dialog-box .btn-primary').click()
 wait.until(lambda b:b.execute_script("return !!window.__PI__"))
 before=browser.execute_script("""return (()=>{const s=window.__PI__.state();return {
   coins:s.player.coins,level:s.player.level,rep:s.player.reputation,cup:s.fishingCup
 }})()""")
 assert before["cup"]["entered"] is False,before
 browser.find_element(By.CSS_SELECTOR,'[data-panel="shop"]').click()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'.tab-btn[data-tab="cup"]'))
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="cup"]').click()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'[data-cup-board]'))
 initial=browser.execute_script("""return {
  join:!!document.querySelector('[data-cup-join]'),
  medals:document.querySelectorAll('[data-cup-medal]').length,
  title:document.querySelector('.cup-overview h3')?.textContent
 }""")
 assert initial["join"] and initial["medals"]==0,initial
 browser.save_screenshot(str(PROOF/"01-before-registration.png"))
 browser.find_element(By.CSS_SELECTOR,'[data-cup-join]').click()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'[data-cup-points]'))
 joined=browser.execute_script("""return (()=>{const s=window.__PI__.state();return {
   entered:s.fishingCup.entered,points:s.fishingCup.points,
   catches:s.fishingCup.catches,
   medalCards:document.querySelectorAll('[data-cup-medal]').length,
   bronzeDisabled:document.querySelector('[data-cup-claim="bronze"]')?.disabled,
   coins:s.player.coins
 }})()""")
 assert joined["entered"] and joined["points"]==0 and joined["catches"]==0,joined
 assert joined["medalCards"]==3 and joined["bronzeDisabled"],joined
 assert joined["coins"]==before["coins"],joined
 browser.save_screenshot(str(PROOF/"02-registered-no-fake-points.png"))

 # The accepted completion fixture is set through the QA hook. In normal play
 # only src/core/fishing.resolveCatch can increase this state; verified by unit.
 browser.execute_script("""(()=>{
    const s=window.__PI__.state(),c=s.fishingCup;
    c.catches=10;c.points=300;
    c.species={fish_sardine:4,fish_seabream:3,fish_grouper:3};
 })()""")
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="freight"]').click()
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="cup"]').click()
 ready=browser.execute_script("""return {
   count:[...document.querySelectorAll('[data-cup-claimable="true"]')].length,
   score:document.querySelector('[data-cup-points]')?.textContent,
   bars:document.querySelectorAll('.cup-track[role="progressbar"]').length
 }""")
 assert ready["count"]==3 and ready["score"]=="300" and ready["bars"]==9,ready
 browser.save_screenshot(str(PROOF/"03-all-medals-ready.png"))

 for medal in ('bronze','silver','gold'):
  browser.find_element(By.CSS_SELECTOR,f'[data-cup-claim="{medal}"]').click()
  wait.until(lambda b:b.find_element(By.CSS_SELECTOR,f'[data-cup-medal="{medal}"]').get_attribute('class').find('cup-medal-claimed')>=0)
 award=browser.execute_script("""return (()=>{const s=window.__PI__.state();return {
    coins:s.player.coins,claimed:[...s.fishingCup.claimed],
    lifetime:s.fishingCup.lifetimeMedals,
    disabled:[...document.querySelectorAll('[data-cup-claim]')].every(x=>x.disabled),
    total:document.querySelectorAll('.cup-medal-claimed').length
 }})()""")
 expected_coins=before["coins"]+90+260+800
 assert award["coins"]==expected_coins,award
 assert award["lifetime"]==3 and award["total"]==3,award
 assert award["claimed"]==['bronze','silver','gold'] and award["disabled"],award
 browser.save_screenshot(str(PROOF/"04-medals-claimed.png"))

 browser.execute_script("window.__PI__.app.save()")
 browser.refresh()
 wait.until(lambda b:b.find_elements(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main'))
 browser.find_element(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main').click()
 wait.until(lambda b:b.execute_script("return !!window.__PI__"))
 recovered=browser.execute_script("""return (()=>{const c=window.__PI__.state().fishingCup;return {
    claimed:c.claimed,catches:c.catches,points:c.points,
    best:c.bestDailyPoints,lifetime:c.lifetimeMedals,
    coins:window.__PI__.state().player.coins
 }})()""")
 assert recovered["claimed"]==['bronze','silver','gold'] and recovered["catches"]==10,recovered
 assert recovered["points"]==300 and recovered["coins"]==expected_coins,recovered
 browser.find_element(By.CSS_SELECTOR,'[data-panel="shop"]').click()
 browser.find_element(By.CSS_SELECTOR,'.tab-btn[data-tab="cup"]').click()
 assert len(browser.find_elements(By.CSS_SELECTOR,'.cup-medal-claimed'))==3
 assert not browser.find_elements(By.CSS_SELECTOR,'[data-cup-join]')

 browser.set_window_size(390,844)
 mobile=browser.execute_script("""return (()=>{const a=document.querySelector('.cup-overview').getBoundingClientRect();
   const b=document.querySelector('.cup-scoreboard').getBoundingClientRect();
   const m=document.querySelector('[data-cup-medal="bronze"]').getBoundingClientRect();
   return {width:innerWidth,overviewLeft:a.left,overviewRight:a.right,
    scoreRight:b.right,medalRight:m.right,
    scrollWidth:document.documentElement.scrollWidth};
 })()""")
 assert mobile["overviewLeft"]>=0 and mobile["overviewRight"]<=mobile["width"]+2,mobile
 assert mobile["scoreRight"]<=mobile["width"]+2 and mobile["medalRight"]<=mobile["width"]+2,mobile
 browser.save_screenshot(str(PROOF/"05-mobile-medal-history.png"))
 errors=[x["message"] for x in browser.get_log("browser") if x["level"]=="SEVERE" and "favicon" not in x["message"]]
 assert not errors,errors
 report={"status":"PASS","initial":initial,"registered":joined,"ready":ready,
    "awarded":award,"restored":recovered,"mobile":mobile,"consoleErrors":errors}
 (PROOF/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False),flush=True)
finally:
 browser.quit()
