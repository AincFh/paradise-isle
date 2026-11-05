import {describe,it,expect} from 'vitest';
import {makeGame,NOW} from './helpers';
import {CRAFT_RECIPES} from '../src/data/recipes.data';
import {craftBatch,craftQuote,eatCrafted,validateRecipes} from '../src/core/crafting';
import {itemDef,achievementDef,questDef} from '../src/core/registry';
import {addItem} from '../src/core/player';
import {applyEvents,achievementViews,questComplete} from '../src/core/quests';
import {sellItem,marketQuote} from '../src/core/economy';
import {deserialize,serialize} from '../src/save/save';
import {maxEnergy} from '../src/core/balance';

describe('Island kitchen content integrity',()=>{
 it('all ten recipes are distinct, fully registered and have real source inventory items',()=>{
  expect(CRAFT_RECIPES).toHaveLength(10);
  expect(validateRecipes()).toEqual([]);
  const outputs=new Set<string>();
  for(const recipe of CRAFT_RECIPES){
   expect(outputs.has(recipe.output)).toBe(false);
   outputs.add(recipe.output);
   expect(itemDef(recipe.output).category).toBe('crafted');
   expect(itemDef(recipe.output).sell).toBe(recipe.sell);
   for(const item of Object.keys(recipe.ingredients))expect(itemDef(item).id).toBe(item);
  }
 });
 it('bilingual recipe names, readable artwork and progression tiers exist',()=>{
  expect(CRAFT_RECIPES.every(r=>r.name.zh&&r.name.en&&r.color.startsWith('#'))).toBe(true);
  expect(CRAFT_RECIPES.some(r=>r.unlockLevel===1)).toBe(true);
  expect(CRAFT_RECIPES.some(r=>r.unlockLevel>=35)).toBe(true);
 });
});
describe('Real crafting transactions',()=>{
 it('consumes actual harvest, pays a bounded energy cost, adds a sellable meal and experience',()=>{
  const s=makeGame();addItem(s,'produce_carrot',3);
  const energy=s.player.energy,xp=s.player.xp,coins=s.player.coins;
  const quote=craftQuote(s,'roasted-carrots',1)!;
  expect(quote.ready).toBe(true);
  expect(quote.canAfford).toBe(true);
  const r=craftBatch(s,'roasted-carrots',1,NOW);
  expect(r.ok).toBe(true);
  expect(s.inventory.produce_carrot).toBeUndefined();
  expect(s.inventory.dish_roasted_carrots).toBe(1);
  expect(s.player.energy).toBe(energy-2);
  expect(s.player.xp).toBe(xp+5);
  expect(s.player.coins).toBe(coins);
  applyEvents(s,r.events??[],NOW);
  expect(s.stats.craftedGoods).toBe(1);
 });
 it('multiple recipes use multiple ingredients; a batch settles once and advances real quest counts',()=>{
  const s=makeGame();addItem(s,'produce_potato',6);addItem(s,'produce_carrot',3);
  s.quests.active.push({defId:'dq_workshop3',counts:[0],startedAt:NOW});
  const r=craftBatch(s,'potato-soup',3,NOW);
  expect(r.ok).toBe(true);
  applyEvents(s,r.events??[],NOW);
  expect(s.inventory.dish_potato_soup).toBe(3);
  expect(s.inventory.produce_potato).toBeUndefined();
  expect(s.inventory.produce_carrot).toBeUndefined();
  expect(s.stats.craftedGoods).toBe(3);
  expect(questComplete(s.quests.active.at(-1)!)).toBe(true);
  const ach=achievementViews(s).find(x=>x.id==='ach_chef')!;
  expect(ach.tier).toBe(1);
 });
 it('missing ingredients, too little energy, locked recipe and malformed batches never write partial inventory',()=>{
  const s=makeGame();addItem(s,'produce_carrot',8);
  for(const batch of [-1,0,1.5,Infinity,NaN,6]){
   const before=JSON.stringify(s.inventory);
   expect(craftBatch(s,'roasted-carrots',batch,NOW).ok).toBe(false);
   expect(JSON.stringify(s.inventory)).toBe(before);
  }
  expect(craftBatch(s,'starlight-tonic',1,NOW).ok).toBe(false);
  expect(craftBatch(s,'unknown',1,NOW).ok).toBe(false);
  const before=JSON.stringify(s.inventory);
  expect(craftBatch(s,'roasted-carrots',3,NOW).ok).toBe(false);
  expect(JSON.stringify(s.inventory)).toBe(before);
  s.player.energy=1;s.player.energyUpdatedAt=NOW;
  expect(craftBatch(s,'roasted-carrots',1,NOW).ok).toBe(false);
  expect(JSON.stringify(s.inventory)).toBe(before);
 });
 it('read-only quote shows exact missing stock for 1 and 3 servings',()=>{
  const s=makeGame();addItem(s,'produce_carrot',4);
  const q=craftQuote(s,'roasted-carrots',3)!;
  expect(q.missing.produce_carrot).toBe(5);
  expect(q.maxCraftable).toBe(1);
  expect(q.canAfford).toBe(false);
  expect(craftQuote(s,'roasted-carrots',5.5)).toBeNull();
 });
 it('crafting cannot fabricate items by manipulating negative or fractional stock',()=>{
  const s=makeGame();
  for(const value of [-99,1.5,NaN,Infinity]){
   s.inventory.produce_carrot=value;
   expect(craftBatch(s,'roasted-carrots',1,NOW).ok).toBe(false);
  }
 });
});
describe('Meal consumption, market and save compatibility',()=>{
 it('eating a crafted meal actually spends one item, restores bounded energy and adds food',()=>{
  const s=makeGame();addItem(s,'dish_roasted_carrots',2);
  s.player.energy=2;s.player.energyUpdatedAt=NOW;
  const before=s.player.food;
  const r=eatCrafted(s,'dish_roasted_carrots');
  expect(r.ok).toBe(true);
  expect(s.inventory.dish_roasted_carrots).toBe(1);
  expect(s.player.energy).toBe(3);
  expect(s.player.food).toBe(before+6);
  applyEvents(s,r.events??[],NOW);
  expect(s.stats.mealsEaten).toBe(1);
  s.quests.active.push({defId:'dq_tasting2',counts:[0],startedAt:NOW});
  const second=eatCrafted(s,'dish_roasted_carrots');applyEvents(s,second.events??[],NOW);
  expect(s.inventory.dish_roasted_carrots).toBeUndefined();
  expect(eatCrafted(s,'dish_roasted_carrots').ok).toBe(false);
  expect(eatCrafted(s,'produce_carrot').ok).toBe(false);
  expect(s.player.energy).toBeLessThanOrEqual(maxEnergy(1));
  expect(s.stats.mealsEaten).toBe(2);
 });
 it('player decides to sell crafted meals; real ledger and reputation settle at displayed price',()=>{
  const s=makeGame();addItem(s,'dish_roasted_carrots',2);
  const q=marketQuote('dish_roasted_carrots',NOW),old=s.player.coins;
  expect(q.trend).toBe('steady');
  expect(q.unitPrice).toBe(34);
  expect(sellItem(s,'dish_roasted_carrots',2,NOW).ok).toBe(true);
  expect(s.player.coins).toBe(old+68);
  expect(s.stats.itemsSold).toBe(2);
 });
 it('v3 saves retain crafted inventory and new achievement counters after reload',()=>{
  const s=makeGame();addItem(s,'produce_carrot',3);
  const r=craftBatch(s,'roasted-carrots',1,NOW);applyEvents(s,r.events??[],NOW);
  const clone=deserialize(serialize(s,NOW),NOW);
  expect(clone.inventory.dish_roasted_carrots).toBe(1);
  expect(clone.stats.craftedGoods).toBe(1);
  expect(achievementDef('ach_chef').stat).toBe('craftedGoods');
  expect(questDef('dq_workshop3').steps[0].type).toBe('craft');
 });
});
