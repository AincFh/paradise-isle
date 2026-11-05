# ATLAS Fork Development · Paradise Isle

> This repository is a **fork**, not an original work by AincFh.
>
> Original creator: [appleweiping](https://github.com/appleweiping/paradise-isle). Original repository: https://github.com/appleweiping/paradise-isle. License: [MIT](LICENSE), retained from upstream. Full original game code, artwork and existing documentation remain credited to the upstream author.

## Current status

- Complete upstream island life-sim code imported; this does **not** mean AincFh built the original game.
- GitHub Actions workflow inherited from upstream: TypeScript checking, Vitest, Vite build and Pages deployment.
- Fork development status: **integration and validation**, not an AincFh-released derivative yet.

## Baseline verification

```bash
npm ci
npm run typecheck
npm test
BASE_PATH=/paradise-isle/ npm run build
```

User-facing verification: open the fork's published Pages URL, start an island, plant and harvest, use menus and saved progress, then reload. Check on both desktop and touch browsers before declaring a forked release.

## ATLAS development scope

- Improve onboarding and Chinese-language guidance for first-time visitors.
- Verify that optional friend-code server features are not misrepresented as available on static GitHub Pages.
- Add accessible keyboard / touch controls and visual performance options where worthwhile.
- Expand content only through original assets/code or properly attributed licensed changes; never copy original Tencent art.
- Preserve original MIT license and upstream attribution in any forked distribution.

## Release gate

Build passes AND real browser gameplay and save/load pass. Green tests alone are insufficient. Issue and PR evidence should be retained in this repository.
