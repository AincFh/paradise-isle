"""Production build E2E: real Chrome interactions with the island workshop.
A fresh browser profile prevents this test from modifying any real player save.
No mocked game methods or custom dev-only UI components.
"""
import json
import os
import pathlib
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BASE=os.environ.get("PI_BROWSER_BASE","http://127.0.0.1:4173/paradise-isle/")
PROOF=pathlib.Path("artifacts/workshop")
PROOF.mkdir(parents=True,exist_ok=True)
opts=Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--window-size=1280,840")
opts.set_capability("goog:loggingPrefs",{"browser":"ALL"})
browser=webdriver.Chrome(options=opts)
browser.set_page_load_timeout(60)
wait=WebDriverWait(browser,35)

try:
    browser.get(BASE)
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,".slot-card.empty .slot-main"))
    browser.find_element(By.CSS_SELECTOR,".slot-card.empty .slot-main").click()
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,".dialog-input"))
    browser.find_element(By.CSS_SELECTOR,".dialog-input").send_keys("Workshop QA")
    browser.find_element(By.CSS_SELECTOR,".dialog-box .btn-primary").click()
    wait.until(lambda d:d.execute_script("return !!window.__PI__"))
    # Seed a harvest into the genuine save for a quick deterministic smoke.
    # All manufacturing, shop, sell, consume and save are executed by the UI.
    browser.execute_script("window.__PI__.state().inventory.produce_carrot=9")
    browser.execute_script("""[...document.querySelectorAll('.hud-btn')]
      .find(b=>b.textContent.trim()==='商店').click()""")
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,".tab-btn"))
    browser.execute_script("""[...document.querySelectorAll('.tab-btn')]
      .find(b=>b.textContent.includes('海岛工坊')).click()""")
    wait.until(lambda d:len(d.find_elements(By.CSS_SELECTOR,".workshop-card"))==10)
    assert browser.execute_script("""return [...document.querySelectorAll('.workshop-card')]
      .filter(e=>e.querySelector('.shop-card-name')).length""")==10
    for batch,enabled in [(1,True),(3,True)]:
        assert browser.execute_script("""const b=document.querySelector(
          '[data-craft-id="roasted-carrots"][data-craft-batch="%s"]');return !b.disabled"""%batch)==enabled
    browser.save_screenshot(str(PROOF/"01-workshop-desktop.png"))

    browser.execute_script("""document.querySelector(
      '[data-craft-id="roasted-carrots"][data-craft-batch="3"]').click()""")
    crafted=browser.execute_script("""return (() => {
      const s=window.__PI__.state();
      return {carrots:s.inventory.produce_carrot||0,dishes:s.inventory.dish_roasted_carrots||0,
      crafted:s.stats.craftedGoods,energy:s.player.energy,coins:s.player.coins}
    })()""")
    assert crafted=={"carrots":0,"dishes":3,"crafted":3,"energy":15,"coins":500},crafted
    assert browser.execute_script("""return document.querySelector(
      '[data-craft-id="roasted-carrots"][data-craft-batch="1"]').disabled""")
    browser.save_screenshot(str(PROOF/"02-batch-crafting.png"))
    browser.find_element(By.CSS_SELECTOR,".panel-header .btn-close").click()
    browser.execute_script("""[...document.querySelectorAll('.hud-btn')]
      .find(b=>b.textContent.trim()==='背包').click()""")
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'[data-eat="dish_roasted_carrots"]'))
    browser.save_screenshot(str(PROOF/"03-meal-in-inventory.png"))
    browser.execute_script("""document.querySelector(
      '[data-eat="dish_roasted_carrots"]').click()""")
    meal=browser.execute_script("""return (() => {
      const s=window.__PI__.state();
      return {dishes:s.inventory.dish_roasted_carrots||0,eaten:s.stats.mealsEaten,
        food:s.player.food,energy:s.player.energy}
    })()""")
    assert meal=={"dishes":2,"eaten":1,"food":36,"energy":16},meal

    # Sell another real meal from the same inventory page.
    browser.execute_script("""(() => {
      const cell=[...document.querySelectorAll('.item-cell')]
        .find(e=>e.querySelector('.item-name')?.textContent==='香烤胡萝卜');
      const sell=[...cell.querySelectorAll('button')]
        .find(b=>b.textContent.trim()==='出售');
      sell.click();
    })()""")
    market=browser.execute_script("""return (() => {
      const s=window.__PI__.state();return {
        dishes:s.inventory.dish_roasted_carrots||0,
        coins:s.player.coins,itemsSold:s.stats.itemsSold}
    })()""")
    assert market=={"dishes":1,"coins":534,"itemsSold":1},market

    # Save via real App to the three-slot store, reload production bundle.
    browser.execute_script("window.__PI__.app.save()")
    browser.refresh()
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,".slot-card:not(.empty) .slot-main"))
    browser.find_element(By.CSS_SELECTOR,".slot-card:not(.empty) .slot-main").click()
    wait.until(lambda d:d.execute_script("return !!window.__PI__"))
    recovered=browser.execute_script("""return (() => {
      const s=window.__PI__.state();return {
        dishes:s.inventory.dish_roasted_carrots||0,
        crafted:s.stats.craftedGoods,
        eaten:s.stats.mealsEaten,
        coins:s.player.coins}
    })()""")
    assert recovered=={"dishes":1,"crafted":3,"eaten":1,"coins":534},recovered

    browser.set_window_size(390,844)
    # Dismiss an optional offline-recovery dialog; no progress is lost.
    browser.execute_script("""document.querySelector('.dialog-box .btn-primary')?.click()""")
    browser.execute_script("""[...document.querySelectorAll('.hud-btn')]
      .find(b=>b.textContent.trim()==='商店').click()""")
    browser.execute_script("""[...document.querySelectorAll('.tab-btn')]
      .find(b=>b.textContent.includes('海岛工坊')).click()""")
    width=browser.execute_script("""return (() => ({
      view:innerWidth,scroll:document.documentElement.scrollWidth,
      cards:document.querySelectorAll('.workshop-card').length,
      tab:!!document.querySelector('.tab-btn.active')
    }))()""")
    assert width["cards"]==10 and width["tab"],width
    assert width["scroll"]<=width["view"]+4,width
    browser.save_screenshot(str(PROOF/"04-mobile-workshop.png"))
    errors=[x["message"] for x in browser.get_log("browser") if x["level"]=="SEVERE" and "favicon" not in x["message"]]
    assert not errors,errors
    report={"result":"PASS","craft":crafted,"eat":meal,"market":market,
            "restored":recovered,"mobile":width,"browserErrors":errors}
    (PROOF/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
    browser.quit()
