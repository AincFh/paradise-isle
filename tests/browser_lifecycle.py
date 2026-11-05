"""Paradise Isle production-bundle browser regression: session lifecycle and backup restore.
Exercises UI paths in a fresh Selenium/Chromium profile; no mocked app methods.
Checks that exiting removes old HUD/QA hooks, re-entry does not duplicate HUDs,
and importing a save is not overwritten by a stale beforeunload handler.
"""
import json
import os
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BASE=os.environ.get('PI_BROWSER_BASE','http://127.0.0.1:4173/paradise-isle/')
OUT=Path('artifacts/session-lifecycle')
OUT.mkdir(parents=True,exist_ok=True)
opts=Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--window-size=1280,840')
opts.set_capability('goog:loggingPrefs',{'browser':'ALL'})
driver=webdriver.Chrome(options=opts)
driver.set_page_load_timeout(60)
wait=WebDriverWait(driver,35)
record=[]

def snapshot(label):
    details=driver.execute_script("""return {
      playing:!!window.__PI__, titleVisible:!document.querySelector('#title-screen')?.classList.contains('hidden'),
      hudCount:document.querySelectorAll('.hud-root').length,
      modalOpen:!document.querySelector('.modal-overlay')?.classList.contains('hidden'),
      canvasVisible:!document.querySelector('#game-canvas')?.classList.contains('hidden'),
      stored:JSON.parse(localStorage.getItem('paradise-isle:save:0')||'null')?.player?.coins??null
    }""")
    record.append({'step':label,**details})
    driver.save_screenshot(str(OUT/(f'{len(record):02d}-{label}.png')))
    return details

def dismiss_offline():
    buttons=driver.find_elements(By.CSS_SELECTOR,'.dialog-overlay .btn-primary')
    for button in buttons:
        if button.is_displayed():
            button.click()
            wait.until(lambda d:not d.find_elements(By.CSS_SELECTOR,'.dialog-overlay'))
            break

def open_slot():
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main'))
    driver.find_element(By.CSS_SELECTOR,'.slot-card:not(.empty) .slot-main').click()
    wait.until(lambda d:d.execute_script('return !!window.__PI__'))
    dismiss_offline()
    assert driver.execute_script("return document.querySelectorAll('.hud-root').length")==1

def open_settings():
    # Real bottom bar's final entry is the Settings button on both languages.
    driver.find_element(By.CSS_SELECTOR,'.hud-bottom button:last-child').click()
    wait.until(lambda d:d.find_element(By.CSS_SELECTOR,'.modal-overlay').is_displayed())

def click_settings_button(fragment):
    buttons=driver.find_elements(By.CSS_SELECTOR,'.modal-panel .set-row button')
    matches=[b for b in buttons if fragment in b.text]
    assert len(matches)==1,[(b.text) for b in buttons]
    matches[0].click()

try:
    driver.get(BASE)
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.slot-card.empty .slot-main'))
    driver.find_element(By.CSS_SELECTOR,'.slot-card.empty .slot-main').click()
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.dialog-input'))
    field=driver.find_element(By.CSS_SELECTOR,'.dialog-input')
    field.clear()
    field.send_keys('Session QA')
    driver.find_element(By.CSS_SELECTOR,'.dialog-box .btn-primary').click()
    wait.until(lambda d:d.execute_script('return !!window.__PI__'))
    first=snapshot('new-game')
    assert first['playing'] and first['hudCount']==1 and first['canvasVisible']

    # Set a recognizable value in the isolated test profile. The subsequent
    # save and title transition are still performed exclusively through the UI.
    driver.execute_script('window.__PI__.state().player.coins=777')
    for cycle in range(1,6):
        open_settings()
        click_settings_button('回到标题')
        wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.dialog-overlay .btn-primary'))
        driver.find_element(By.CSS_SELECTOR,'.dialog-overlay .btn-primary').click()
        wait.until(lambda d:d.execute_script(
            "return !window.__PI__ && !document.querySelector('#title-screen').classList.contains('hidden')"))
        returned=snapshot('title-'+str(cycle))
        assert returned['hudCount']==0 and not returned['playing'],returned
        assert not returned['canvasVisible']
        assert returned['stored']==777,returned
        open_slot()
        resumed=snapshot('resume-'+str(cycle))
        assert resumed['hudCount']==1 and resumed['stored']==777,resumed
        assert driver.execute_script('return window.__PI__.state().player.coins')==777

    # Mobile viewport must also keep only a single visible HUD after cycling.
    driver.set_window_size(390,844)
    mobile=snapshot('mobile-resumed')
    assert mobile['hudCount']==1 and mobile['playing']
    assert driver.execute_script('return document.documentElement.scrollWidth <= innerWidth+4')
    driver.set_window_size(1280,840)

    # Prepare a valid alternate backup from the game schema and feed it through
    # the real in-game import prompt. Only test data fields are varied.
    backup=driver.execute_script("""return (() => {
      const save=structuredClone(window.__PI__.state());
      save.player.coins=2048;save.player.name='Recovered QA';
      const bytes=new TextEncoder().encode(JSON.stringify(save));
      let out='';for(const byte of bytes)out+=String.fromCharCode(byte);
      return btoa(out);
    })()""")
    open_settings()
    click_settings_button('导入')
    wait.until(lambda d:d.find_elements(By.CSS_SELECTOR,'.dialog-input'))
    driver.execute_script("""const field=document.querySelector('.dialog-input');
      field.value=arguments[0];field.dispatchEvent(new Event('input',{bubbles:true}));""",backup)
    driver.find_element(By.CSS_SELECTOR,'.dialog-overlay .btn-primary').click()
    wait.until(lambda d:d.execute_script("""return !window.__PI__ &&
      !document.querySelector('#title-screen').classList.contains('hidden') &&
      JSON.parse(localStorage.getItem('paradise-isle:save:0')||'{}').player?.coins===2048"""))
    imported=snapshot('imported-and-reloaded')
    assert imported['stored']==2048 and imported['hudCount']==0
    open_slot()
    restored=snapshot('restored-session')
    assert restored['hudCount']==1 and restored['stored']==2048
    assert driver.execute_script("""return {
      name:window.__PI__.state().player.name,coins:window.__PI__.state().player.coins
    }""")=={'name':'Recovered QA','coins':2048}

    errors=[x['message'] for x in driver.get_log('browser')
            if x['level']=='SEVERE' and 'favicon' not in x['message']]
    assert not errors,errors
    report={'result':'PASS','roundTrips':5,'importedCoins':2048,'browserErrors':errors,
            'steps':record}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'result':'PASS','roundTrips':5,'importedCoins':2048,
                      'steps':len(record)},ensure_ascii=False),flush=True)
except Exception:
    try:
        print('Lifecycle browser console:',driver.get_log('browser'),flush=True)
        driver.save_screenshot(str(OUT/'failure.png'))
        (OUT/'partial-report.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:
        pass
    raise
finally:
    driver.quit()
