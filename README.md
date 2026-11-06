# Paradise Isle

An island life-sim for the browser: farm, raise animals, fish, fight off wild beasts, dress up and visit neighbours, with progress saved in your browser and no account.

**Play this AincFh fork:** https://aincfh.github.io/paradise-isle/ (desktop or phone)

> This is an independent MIT-licensed fork of [appleweiping/paradise-isle](https://github.com/appleweiping/paradise-isle). Original mechanics and artwork remain credited to the upstream creator. This fork adds a deterministic daily island market, with real buyback prices shown in the inventory and seed catalog.

![A new island: planting four carrots, skipping ahead the 90 seconds they take to grow, then harvesting](docs/paradise-isle.gif)

It is a homage to QQ天堂岛, a 2011 Chinese web game. The rules are rebuilt from how that game played; all code, art, text and numbers here are new.

[中文说明](README.zh-CN.md)

## New: Daily Harbor Fishing Cup — competition driven by real catches

The **Shop → Fishing Cup** is a new, fully bilingual fishing competition with genuine short- and long-term progression. Joining is free. Only fish successfully landed **after registering** through the existing cast → bite → reel minigame earn competition points. A failed reel, old backpack inventory, buying/selling fish and refreshing the board never count as catches.

The score depends on actual rarity (common 10, uncommon 26, rare 65, epic 145, legendary 360), adds 6 points the first time a new species is caught in that day's tournament, and adds 8 for a precision reel (85%+ quality). Three independent medals require progressively higher **landed fish, score and species-diversity** thresholds: Bronze (3 / 30 / 1), Silver (6 / 105 / 2) and Gold (10 / 240 / 3). Each medal has an explicit, single-use claim for coins, XP and reputation; opening the UI itself never pays anything.

The daily competition resets on a new **UTC calendar day** while preserving best daily score and lifetime medals. Backwards system clock changes do not reset progress. Existing save slots and imported backups are automatically normalized without a save-version bump; a midway tournament, completed medals and pending claims survive reload. Real Chromium UI tests cover registration, disabled unearned rewards, all three medal claims, one-time persistence and mobile layout. Deterministic Vitest tests cover the actual fishing resolver, rarity scoring, daily reset, reward idempotency, malformed saves and rollback.

## New: real harbor freight contracts

**Shop → Freight Dock** adds a real logistics loop to the island's existing farming, ranching and fishing economy. The harbor generates three deterministic contracts each UTC day, drawn only from goods obtainable at your current level and fishing-rod tier. Every quote locks the daily market value, a transparent shipping premium and an 18-hour deadline once accepted. A player can accept **one order per UTC day**.

Cargo must come from the actual backpack. Deliver it in one or more batches; coins, XP and reputation are paid **only on full completion**. Repeated clicks and invalid deliveries cannot claim an extra payout. Expired contracts are cleared by the ordinary world tick, including offline return, and cargo already delivered is not refunded. The economy therefore rewards planning actual harvests rather than tapping a cosmetic mission button.

The bilingual harbor UI includes progress, remaining inventory, timers and rewards, with mobile layout. Old three-slot saves remain compatible, and a partially fulfilled order persists across reload, import/export and re-entry. Deterministic Vitest regression tests and real Selenium/Chrome acceptance cover quote rules, inventory deductions, expiry, reload, final payment and screenshots.

## Island workshop: ten genuinely craftable dishes

In the **Shop → Workshop** tab you can now turn real crop yields, animal goods, and fish into prepared meals and handcrafted food. There are 10 level-gated, bilingual recipes, from roasted carrots and potato soup to coconut pudding, fish platters, truffle rice and starlight tonic. They use existing inventory and energy. The player can craft 1 or 3 servings at once, with all required materials and resulting food/sale value shown before committing.

Finished meals are actual items in the Bag: **sell** at the displayed fixed artisan price or **eat** to gain food and recover limited energy. No ingredients or currencies are conjured by the interface. The same domain events count toward two daily cooking tasks and two multi-tier culinary achievements, with normal slot save/load and import/export. All four icon families (plates, soup bowls, jam jars, bottles) are painted locally at runtime.

Automated Vitest tests and a real Selenium/Chrome production-build acceptance (craft → eat → sell → reload → mobile layout, with screenshots) cover output registration, batch/level/energy validation, atomicity, real quest/stat accounting, eating, selling and old-save preservation. This is an expanded production loop within the browser sim, not a claim that a complete cooking animation or commercial-quality crafting game exists.

## Controls

| Action | Mouse | Touch |
|---|---|---|
| Do something with a tile, animal, beast or the water's edge | Click it. Your islander walks over and a small menu appears (plant, water, harvest, feed, fight, fish...) | Tap it |
| Move the camera | Drag | Drag with one finger |
| Zoom | Mouse wheel | Pinch with two fingers |
| Close a menu or panel | `Esc`, or click outside it | Tap outside it |
| Bag, shop, quests, collection, wardrobe, friends, decorate, settings | Bottom toolbar | Same |
| Switch language | `EN` / `中文` button on the title screen, or Settings in game | Same |

Crops and animals run on the real clock: a carrot takes 90 seconds, later crops take hours, and things keep growing while the tab is closed. When you come back, a summary shows what happened while you were away.

![The shop in English](docs/screenshots/shop.png)

| A built-up island at noon | The same island at night |
|---|---|
| ![Island at noon](docs/screenshots/island-day.png) | ![Island at night with lamps lit](docs/screenshots/island-night.png) |

The two island screenshots were taken with the Chinese UI; the language follows your browser and can be switched at any time.

## Run it locally

Needs Node.js 20 or newer.

```bash
git clone https://github.com/appleweiping/paradise-isle.git
cd paradise-isle
npm install
npm run dev      # http://localhost:5173
npm test         # 75 unit tests (Vitest)
npm run build    # type check + production build into dist/
```

CI runs the type check, the tests and the build on every push and deploys `main` to GitHub Pages.

## How it's built

- **TypeScript, Vite and Canvas 2D, with no runtime dependencies.** The only dev dependencies are `typescript`, `vite` and `vitest`.
- **The game rules don't touch the DOM.** Everything in `src/core/` is a function of the game state and an explicit `now` timestamp, for example `harvest(state, plotUid, now)`. Offline progress runs the same code with a later `now`, and the tests in `tests/` drive it directly in Node.
- **No image files.** Every sprite (terrain, crops, animals, buildings, clothes, icons) is drawn by code in `src/render/paint/` into offscreen canvases when the game starts. Sound effects and music are generated with Web Audio.
- **Content is data.** Crops, animals, fish, buildings, clothes, pets, neighbours and quests are tables in `src/data/`; adding a crop is one line in `crops.data.ts`.
- **Saves stay on your machine.** Three `localStorage` slots with versioned migrations and base64 export/import. A friend code compresses a snapshot of your island (LZW, then base64url) into a string a friend can paste to visit it, without a server. `npm run server` starts an optional small Node service that swaps long codes for short ids.

## Credits

Inspired by QQ天堂岛 (Tencent, 2011). This project is not affiliated with or endorsed by Tencent and contains none of its assets, code or text.

## License

[MIT](LICENSE)

## Batch harvesting on your own island

When crops or fruit trees are ready, the bottom action bar now offers **Harvest N**. It processes at most 20 ready plots per click using exactly the same single-plot harvest transaction and costs as harvesting manually. An insufficient energy balance stops the operation safely and preserves all already harvested items; the remaining ripe plots can be harvested later. Withered or growing crops do not qualify, fruit trees respect regrowth timers, and every harvested plot still emits quest and achievement events. The contextual action is hidden while visiting neighbours. UI labels support English and Chinese, and the behavior has dedicated regression tests.
