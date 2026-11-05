/**
 * HUD：顶部资源栏（头像/等级/经验条/金币/食物/能量/声望）+ 底部功能按钮 + 任务提示条。
 */
import type { GameState } from '../core/types';
import { maxEnergy, xpForNextLevel } from '../core/balance';
import { energyEta } from '../core/player';
import { readyPlotCount } from '../core/crops';
import { questDef } from '../core/registry';
import { questComplete } from '../core/quests';
import { charKey, spriteDataUrl } from '../render/sprites';
import { fmtDuration, t, tl } from '../i18n';
import { h, spriteImg } from './dom';

export interface HudCallbacks {
  onOpen: (panel: 'inventory' | 'shop' | 'quests' | 'collections' | 'wardrobe' | 'neighbors' | 'settings') => void;
  onToggleEdit: () => void;
  onGoHome: () => void;
  onHarvestReady: () => void;
}

export class Hud {
  private root: HTMLElement;
  private avatarImg: HTMLImageElement;
  private levelEl: HTMLElement;
  private xpFill: HTMLElement;
  private coinsEl: HTMLElement;
  private foodEl: HTMLElement;
  private energyEl: HTMLElement;
  private energyEtaEl: HTMLElement;
  private repEl: HTMLElement;
  private nameEl: HTMLElement;
  private questHint: HTMLElement;
  private visitBanner: HTMLElement;
  private editBtn: HTMLButtonElement;
  private homeBtn: HTMLButtonElement;
  private harvestBtn: HTMLButtonElement;
  private lastAvatarKey = '';
  private isVisiting = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(cb: HudCallbacks) {
    this.avatarImg = spriteImg('fx:sparkle', 'hud-avatar');
    this.levelEl = h('span', { class: 'hud-level' }, '1');
    this.xpFill = h('div', { class: 'xp-fill' });
    this.nameEl = h('span', { class: 'hud-name' }, '');
    this.coinsEl = h('span', {}, '0');
    this.foodEl = h('span', {}, '0');
    this.energyEl = h('span', {}, '0');
    this.energyEtaEl = h('span', { class: 'energy-eta' }, '');
    this.repEl = h('span', {}, '0');

    const topBar = h('div', { class: 'hud-top' },
      h('div', { class: 'hud-portrait' },
        this.avatarImg,
        h('div', { class: 'hud-level-badge' }, this.levelEl),
      ),
      h('div', { class: 'hud-info' },
        this.nameEl,
        h('div', { class: 'xp-bar' }, this.xpFill),
      ),
      h('div', { class: 'hud-res' },
        h('span', { class: 'res-badge', title: t('ui.coins') }, spriteImg('fx:coin', 'icon-sm'), this.coinsEl),
        h('span', { class: 'res-badge', title: t('ui.food') }, spriteImg('icon:produce_carrot', 'icon-sm'), this.foodEl),
        h('span', { class: 'res-badge', title: t('ui.reputation') }, spriteImg('fx:sparkle', 'icon-sm'), this.repEl),
        h('span', { class: 'res-badge energy', title: t('ui.energy') },
          spriteImg('fx:heart', 'icon-sm'), this.energyEl, this.energyEtaEl),
      ),
    );

    this.editBtn = h('button', { class: 'hud-btn', onclick: () => cb.onToggleEdit() },
      spriteImg('icon:item_amber', 'icon-md'), h('span', {}, t('hud.edit'))) as HTMLButtonElement;
    this.homeBtn = h('button', { class: 'hud-btn hidden', onclick: () => cb.onGoHome() },
      spriteImg('fx:heart', 'icon-md'), h('span', {}, t('hud.home'))) as HTMLButtonElement;

    this.harvestBtn = this.mkBtn('fx:ready', t('hud.harvestAll'), () => cb.onHarvestReady());
    this.harvestBtn.classList.add('hud-harvest-all', 'hidden');
    const bottomBar = h('div', { class: 'hud-bottom' },
      this.harvestBtn,
      this.homeBtn,
      this.mkBtn('icon:seed_carrot', t('hud.bag'), () => cb.onOpen('inventory'), 'inventory'),
      this.mkBtn('fx:coin', t('hud.shop'), () => cb.onOpen('shop'), 'shop'),
      this.mkBtn('fx:ready', t('hud.quests'), () => cb.onOpen('quests')),
      this.mkBtn('fish:fish_goldkoi', t('hud.collections'), () => cb.onOpen('collections')),
      this.mkBtn('icon:item_shell', t('hud.wardrobe'), () => cb.onOpen('wardrobe')),
      this.mkBtn('fx:heart', t('hud.neighbors'), () => cb.onOpen('neighbors')),
      this.editBtn,
      this.mkBtn('fx:sleep', t('hud.settings'), () => cb.onOpen('settings')),
    );

    this.questHint = h('div', { class: 'quest-hint hidden' });
    this.questHint.addEventListener('click', () => cb.onOpen('quests'));
    this.visitBanner = h('div', { class: 'visit-banner hidden' });

    this.root = h('div', { class: 'hud-root' }, topBar, bottomBar, this.questHint, this.visitBanner);
    document.body.append(this.root);
    // On narrow screens the top bar wraps onto two rows; keep the quest hint below it.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.root.style.setProperty('--hud-top-bottom', `${Math.round(topBar.getBoundingClientRect().bottom)}px`);
      });
      this.resizeObserver.observe(topBar);
    }
  }

  /** HUD belongs to one game session. Remove its DOM and observation on exit. */
  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.root.remove();
  }

  private mkBtn(icon: string, label: string, onClick: () => void, panel?: string): HTMLButtonElement {
    return h('button', { class: 'hud-btn', ...(panel ? {'data-panel':panel} : {}), onclick: onClick },
      spriteImg(icon, 'icon-md'), h('span', {}, label)) as HTMLButtonElement;
  }

  setEditActive(active: boolean): void {
    this.editBtn.classList.toggle('active', active);
  }

  setVisiting(name: string | null, snapshotNote: boolean): void {
    this.isVisiting = !!name;
    this.homeBtn.classList.toggle('hidden', !name);
    this.editBtn.classList.toggle('hidden', !!name);
    this.harvestBtn.classList.toggle('hidden', !!name);
    if (name) {
      this.visitBanner.textContent = snapshotNote
        ? t('nb.snapshotNote', { name })
        : t('nb.visiting', { name });
      this.visitBanner.classList.remove('hidden');
    } else {
      this.visitBanner.classList.add('hidden');
    }
  }

  update(state: GameState, now: number): void {
    const p = state.player;
    const ak = charKey(p.avatar);
    if (ak !== this.lastAvatarKey) {
      this.lastAvatarKey = ak;
      this.avatarImg.src = spriteDataUrl(ak);
    }
    this.nameEl.textContent = p.name;
    this.levelEl.textContent = String(p.level);
    this.xpFill.style.width = `${Math.min(100, (p.xp / xpForNextLevel(p.level)) * 100)}%`;
    this.coinsEl.textContent = String(p.coins);
    this.foodEl.textContent = String(p.food);
    this.repEl.textContent = String(p.reputation);
    this.energyEl.textContent = `${p.energy}/${maxEnergy(p.level)}`;
    const ripe = readyPlotCount(state,now);
    this.harvestBtn.classList.toggle('hidden',ripe===0 || this.isVisiting);
    this.harvestBtn.disabled = ripe===0 || p.energy<=0;
    this.harvestBtn.setAttribute('aria-label',t('hud.harvestAllCount',{n:ripe}));
    const label=this.harvestBtn.querySelector('span');
    if(label)label.textContent=t('hud.harvestAllCount',{n:ripe});
    const eta = energyEta(state, now);
    this.energyEtaEl.textContent = eta > 0 ? t('hud.nextEnergy', { t: fmtDuration(eta) }) : '';

    // 教程提示：第一条未完成的教程任务
    const active = state.quests.active.filter((q) => !questDef(q.defId).daily);
    if (active.length > 0) {
      const q = active[0];
      const def = questDef(q.defId);
      const done = questComplete(q);
      this.questHint.textContent = `${t('tut.hint')}: ${tl(def.name)}${done ? ' ✓' : ''} — ${tl(def.desc)}`;
      this.questHint.classList.toggle('done', done);
      this.questHint.classList.remove('hidden');
    } else {
      this.questHint.classList.add('hidden');
    }
  }
}
