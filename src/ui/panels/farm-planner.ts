/** Farming operations board integrated into the existing shop (no separate
 * economy or special-case UI state). The domain layer owns all mutations.
 */
import type {ActionResult,GameState} from '../../core/types';
import {allCrops} from '../../core/registry';
import {buySeed} from '../../core/economy';
import {farmPlan,sowBatch,waterBatch,clearWitheredBatch} from '../../core/farm-planner';
import {harvestReadyPlots} from '../../core/crops';
import {fmtDuration,t,tl} from '../../i18n';
import {h,clearChildren,spriteImg} from '../dom';

export function renderFarmPlanner(
 body:HTMLElement,state:GameState,now:()=>number,dispatch:(r:ActionResult)=>void,
):void{
 const crops=allCrops().slice().sort((a,b)=>a.unlockLevel-b.unlockLevel);
 let selectedCrop=crops.find(c=>c.id==='crop_carrot')?.id??crops[0]?.id??'';
 let quantity=5;
 const options=[1,3,5,10,20,50];
 const stat=(label:string,n:number)=>h('div',{class:'farm-stat'},
  h('span',{},label),h('strong',{},String(n)));
 const button=(label:string,data:string,disabled:boolean,act:()=>void)=>
  h('button',{class:'btn btn-sm btn-primary','data-farm-action':data,
   ...(disabled?{disabled:'disabled'}:{}),
   onclick:()=>{act();draw()}},label);
 function draw():void{
  const current=crops.find(c=>c.id===selectedCrop)??crops[0];
  if(!current)return;
  const quote=farmPlan(state,current.id,now());
  if(!quote)return;
  clearChildren(body);
  body.append(h('section',{class:'farm-overview'},
   h('small',{},t('farm.kicker')),h('h3',{},t('farm.title')),
   h('p',{},t('farm.intro')),
   h('div',{class:'farm-stats'},
    stat(t('farm.empty'),quote.empty),
    stat(t('farm.growing'),quote.planted),
    stat(t('farm.ready'),quote.ready),
    stat(t('farm.withered'),quote.withered),
    stat(t('farm.waterable'),quote.waterable),
    stat(t('farm.energy'),quote.energy))));
  const selector=h('select',{'data-farm-crop':'true','aria-label':t('farm.choose'),
   onchange:(event:Event)=>{
    selectedCrop=(event.target as HTMLSelectElement).value;draw();
   }},
   ...crops.map(c=>h('option',{value:c.id,
     ...(c.unlockLevel>state.player.level?{disabled:'disabled'}:{})},
     tl(c.name)+(c.unlockLevel>state.player.level?
      ' · '+t('ui.lvRequire',{lv:c.unlockLevel}):''))));
  selector.value=current.id;
  const batchSelect=h('select',{'data-farm-count':'true','aria-label':t('farm.quantity'),
   onchange:(event:Event)=>{
    quantity=Number((event.target as HTMLSelectElement).value);draw();
   }},
   ...options.map(n=>h('option',{value:String(n)},String(n))));
  batchSelect.value=String(quantity);
  const controls=h('div',{class:'farm-control-grid'},
   h('label',{},t('farm.choose'),selector),
   h('label',{},t('farm.quantity'),batchSelect));
  body.append(controls);
  const buyQty=Math.min(quantity,50);
  const canBuy=state.player.level>=current.unlockLevel&&
   state.player.coins>=current.seedPrice*buyQty;
  const canPlant=Math.min(quote.plantable,quantity)>0;
  const waterable=Math.min(quote.waterCapacity,quantity)>0;
  const harvestable=Math.min(quote.ready,quote.energy,quantity)>0;
  const clearable=Math.min(quote.withered,quote.energy,quantity)>0;
  const row=h('div',{class:'farm-workflow'},
   h('article',{class:'farm-operation','data-farm-op':'buy'},
    spriteImg('icon:'+current.seedId,'icon-lg'),
    h('div',{},h('strong',{},t('farm.seedStock',{n:quote.ownedSeeds})),
     h('p',{},t('farm.buyCost',{n:buyQty,cost:current.seedPrice*buyQty}))),
    button(t('farm.buy',{n:buyQty}),'buy',!canBuy,()=>{
     dispatch(buySeed(state,current.id,buyQty));
    })),
   h('article',{class:'farm-operation','data-farm-op':'sow'},
    spriteImg('icon:'+current.seedId,'icon-lg'),
    h('div',{},h('strong',{},t('farm.plantable',{n:quote.plantable})),
     h('p',{},t('farm.harvestEstimate',{
      min:quote.estimatedHarvestMin,max:quote.estimatedHarvestMax,
      t:fmtDuration(current.growMs)
     }))),
    button(t('farm.sow',{n:Math.min(quantity,quote.plantable)}),'sow',!canPlant,()=>{
     const result=sowBatch(state,current.id,quantity,now());dispatch(result);
     if(result.ok)dispatch({ok:true,events:[{type:'toast',target:'farm.sowed'}]});
    })),
   h('article',{class:'farm-operation','data-farm-op':'water'},
    spriteImg('fx:ready','icon-lg'),
    h('div',{},h('strong',{},t('farm.waterable',{n:quote.waterable})),
     h('p',{},t('farm.waterHint'))),
    button(t('farm.water',{n:Math.min(quantity,quote.waterCapacity)}),
     'water',!waterable,()=>{
      const result=waterBatch(state,quantity,now());dispatch(result);
      if(result.ok)dispatch({ok:true,events:[{type:'toast',target:'farm.watered'}]});
     })),
   h('article',{class:'farm-operation','data-farm-op':'harvest'},
    spriteImg('icon:produce_carrot','icon-lg'),
    h('div',{},h('strong',{},t('farm.harvestReady',{n:quote.ready})),
     h('p',{},t('farm.harvestHint'))),
    button(t('farm.harvest',{n:Math.min(quantity,quote.ready,quote.energy)}),
     'harvest',!harvestable,()=>{
      const result=harvestReadyPlots(state,now(),quantity);dispatch(result);
      if(result.ok)dispatch({ok:true,events:[{type:'toast',target:'farm.harvested'}]});
     })),
   h('article',{class:'farm-operation','data-farm-op':'clear'},
    spriteImg('icon:seed_carrot','icon-lg'),
    h('div',{},h('strong',{},t('farm.clearReady',{n:quote.withered})),
     h('p',{},t('farm.clearHint'))),
    button(t('farm.clear',{n:Math.min(quantity,quote.withered,quote.energy)}),
     'clear',!clearable,()=>{
      const result=clearWitheredBatch(state,quantity,now());dispatch(result);
     }))
  );
  body.append(row);
  body.append(h('p',{class:'farm-footnote'},t('farm.note')));
 }
 draw();
}
