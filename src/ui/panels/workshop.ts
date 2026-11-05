/**
 * Island workshop: discoverable inside the shop, but real materials and
 * energy are consumed in core/crafting.ts. No virtual ingredients.
 */
import type {ActionResult,GameState} from '../../core/types';
import {CRAFT_RECIPES} from '../../data/recipes.data';
import {craftBatch,craftQuote} from '../../core/crafting';
import {itemDef} from '../../core/registry';
import {h,clearChildren,spriteImg} from '../dom';
import {t,tl} from '../../i18n';

export function renderWorkshop(
 body:HTMLElement,state:GameState,now:()=>number,dispatch:(r:ActionResult)=>void,
):void{
 clearChildren(body);
 body.append(h('div',{class:'empty-note',style:'margin-bottom:12px'},t('craft.intro')));
 const info=h('div',{class:'workshop-status'},
   h('strong',{},t('craft.title')),
   h('span',{},t('craft.stats',{n:state.stats.craftedGoods??0,e:state.stats.mealsEaten??0})),
 );
 body.append(info);
 const list=h('div',{class:'shop-list workshop-recipes'});
 body.append(list);
 for(const recipe of CRAFT_RECIPES){
  const unlocked=state.player.level>=recipe.unlockLevel;
  const single=craftQuote(state,recipe.id,1);
  const triple=craftQuote(state,recipe.id,3);
  const label=Object.entries(recipe.ingredients).map(([id,n])=>{
   const name=tl(itemDef(id).name),owned=state.inventory[id]??0;
   const cls=owned>=n?'ingredient-ok':'ingredient-missing';
   return h('span',{class:cls},name+' ×'+n+' ('+owned+')');
  });
  const result=spriteImg('icon:'+recipe.output,'icon-lg');
  result.alt=tl(recipe.name);
  const stats=h('div',{class:'workshop-meta'},
   h('span',{},t('craft.energy',{n:recipe.energy})),
   h('span',{},t('craft.sell',{n:recipe.sell})),
   h('span',{},t('craft.eatBonus',{food:recipe.food,energy:recipe.recoverEnergy})),
  );
  const controls=h('div',{class:'workshop-actions'});
  for(const [count,quote] of [[1,single],[3,triple]] as const){
   const disabled=!unlocked||!quote?.canAfford;
   controls.append(h('button',{
    class:'btn btn-sm '+(disabled?'disabled':'btn-primary'),
    ...(disabled?{disabled:'disabled'}:{}),
    'data-craft-id':recipe.id,'data-craft-batch':String(count),
    onclick:()=>{
     const result=craftBatch(state,recipe.id,count,now());
     dispatch(result);
     renderWorkshop(body,state,now,dispatch);
    },
   },t('craft.make',{n:count})));
  }
  list.append(h('article',{class:'shop-card workshop-card'+(unlocked?'':' locked')},
    result,h('div',{class:'shop-card-info'},
     h('div',{class:'shop-card-name'},tl(recipe.name)),
     h('div',{class:'workshop-ingredients'},...label),
     stats,
     h('div',{class:'shop-card-sub'},unlocked?
       single?.ready?t('craft.ready'):t('craft.shortage'):
       t('ui.lvRequire',{lv:recipe.unlockLevel})),
    ),controls,
  ));
 }
}
