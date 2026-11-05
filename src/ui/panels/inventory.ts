/**
 * 背包面板：物品网格 + 出售。
 */
import type { GameState } from '../../core/types';
import { itemDef } from '../../core/registry';
import { sellItem, marketQuote } from '../../core/economy';
import type { ActionResult } from '../../core/types';
import { t, tl } from '../../i18n';
import { h, clearChildren, spriteImg } from '../dom';
import { openPanel } from '../modal';

export function openInventory(state: GameState, dispatch: (r: ActionResult) => void): void {
  openPanel({
    title: t('panel.inventory'),
    className: 'panel-wide',
    body: (body) => renderBody(body, state, dispatch),
  });
}

function renderBody(body: HTMLElement, state: GameState, dispatch: (r: ActionResult) => void): void {
  clearChildren(body);
  const marketNow=Date.now();
  body.append(h('div', { class: 'empty-note', style: 'margin-bottom:12px' }, t('market.notice')));
  const entries = Object.entries(state.inventory).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    body.append(h('div', { class: 'empty-note' }, t('inv.empty')));
    return;
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const grid = h('div', { class: 'item-grid' });
  for (const [id, count] of entries) {
    let def;
    try {
      def = itemDef(id);
    } catch {
      continue;
    }
    const canSell = def.sell > 0;
    const quote=canSell?marketQuote(id,marketNow):null;
    const trendLabel=quote?.trend==='hot'?t('market.hot'):quote?.trend==='quiet'?t('market.quiet'):t('market.steady');
    const cell = h('div', { class: 'item-cell' },
      spriteImg(`icon:${id}`, 'icon-lg'),
      h('div', { class: 'item-count' }, `×${count}`),
      h('div', { class: 'item-name' }, tl(def.name)),
      canSell
        ? h('div', { class: 'item-actions' },
            h('span', { class: 'item-price' }, t('inv.sellFor', { n: quote!.unitPrice })+' · '+trendLabel),
            h('button', {
              class: 'btn btn-sm',
              onclick: () => {
                dispatch(sellItem(state, id, 1, marketNow));
                renderBody(body, state, dispatch);
              },
            }, t('ui.sell')),
            count > 1
              ? h('button', {
                  class: 'btn btn-sm',
                  onclick: () => {
                    dispatch(sellItem(state, id, count, marketNow));
                    renderBody(body, state, dispatch);
                  },
                }, t('ui.sellAll'))
              : null,
          )
        : h('div', { class: 'item-actions' }),
    );
    grid.append(cell);
  }
  body.append(grid);
}
