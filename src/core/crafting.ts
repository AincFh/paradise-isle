/**
 * Atomic island workshop and food consumption.
 * No DOM, clock randomness, hidden inventory grants or external services.
 */
import type {ActionResult,GameState,CraftRecipeDef} from './types';
import {fail} from './types';
import {CRAFT_RECIPES,recipeById,recipeForItem} from '../data/recipes.data';
import {addItem,gainEnergy,gainFood,gainXp,hasEnergy,removeItem,spendEnergy} from './player';

export const MAX_CRAFT_BATCH=5;

export interface CraftQuote {
 recipe:CraftRecipeDef;
 batch:number;
 ready:boolean;
 canAfford:boolean;
 missing:Readonly<Record<string,number>>;
 energyNeeded:number;
 maxCraftable:number;
}

/** Preview uses current registered recipes and inventory, never changes ingredients. */
export function craftQuote(state:GameState,id:string,batch=1):CraftQuote|null{
 const recipe=recipeById(id);
 if(!recipe||!Number.isSafeInteger(batch)||batch<1||batch>MAX_CRAFT_BATCH)return null;
 const missing:Record<string,number>={};
 let maxCraftable=MAX_CRAFT_BATCH;
 for(const [item,needed] of Object.entries(recipe.ingredients)){
  const available=Number.isSafeInteger(state.inventory[item])?Math.max(0,state.inventory[item]):0;
  const total=needed*batch;
  if(available<total)missing[item]=total-available;
  maxCraftable=Math.min(maxCraftable,Math.floor(available/needed));
 }
 maxCraftable=Math.min(maxCraftable,Math.floor(Math.max(0,state.player.energy)/recipe.energy));
 return {recipe,batch,ready:Object.keys(missing).length===0,canAfford:
  state.player.level>=recipe.unlockLevel&&maxCraftable>=batch,
  missing,energyNeeded:recipe.energy*batch,maxCraftable:Math.max(0,maxCraftable)};
}

export function craftBatch(state:GameState,id:string,batch:number,now:number):ActionResult{
 if(!Number.isSafeInteger(batch)||batch<1||batch>MAX_CRAFT_BATCH)return fail('craft.invalidCount');
 const recipe=recipeById(id);
 if(!recipe)return fail('craft.unknown');
 if(state.player.level<recipe.unlockLevel)return fail('msg.locked');
 // Compute everything before writing any inventory entry. A rejected craft is atomic.
 if(!Number.isFinite(now)||now<0)return fail('craft.invalidCount');
 const energy=recipe.energy*batch;
 const missing=Object.entries(recipe.ingredients).some(([key,amount])=>{
  const n=state.inventory[key]??0;
  return !Number.isSafeInteger(n)||n<amount*batch;
 });
 if(missing)return fail('craft.noIngredients');
 if(!hasEnergy(state,energy,now))return fail('msg.noEnergy');
 if(!spendEnergy(state,energy,now))return fail('msg.noEnergy');
 for(const [key,qty] of Object.entries(recipe.ingredients))removeItem(state,key,qty*batch);
 addItem(state,recipe.output,batch);
 const levelEvents=gainXp(state,recipe.xp*batch);
 return {ok:true,events:[{type:'craft',target:recipe.id,amount:batch},...levelEvents]};
}

/** Food can be sold or eaten. Only registered crafted recipes are consumable. */
export function eatCrafted(state:GameState,itemId:string):ActionResult{
 const recipe=recipeForItem(itemId);
 if(!recipe)return fail('craft.notEdible');
 if(!Number.isSafeInteger(state.inventory[itemId])||state.inventory[itemId]<1)return fail('msg.notEnough');
 if(!removeItem(state,itemId,1))return fail('msg.notEnough');
 gainFood(state,recipe.food);
 gainEnergy(state,recipe.recoverEnergy);
 return {ok:true,events:[{type:'eatCrafted',target:recipe.id,amount:1}]};
}

/** Validate all registered recipes at startup and in tests. */
export function validateRecipes():string[]{
 const ids=new Set<string>(),outputs=new Set<string>(),failures:string[]=[];
 for(const r of CRAFT_RECIPES){
  if(ids.has(r.id)||outputs.has(r.output))failures.push(r.id+':duplicate');
  ids.add(r.id);outputs.add(r.output);
  if(r.unlockLevel<1||!Number.isInteger(r.unlockLevel)||!Number.isSafeInteger(r.sell)||r.sell<=0)
   failures.push(r.id+':price/level');
  if(!Number.isSafeInteger(r.energy)||r.energy<=0||!Number.isSafeInteger(r.xp)||r.xp<=0)
   failures.push(r.id+':energy/xp');
  if(!Object.keys(r.ingredients).length)failures.push(r.id+':no ingredients');
  for(const amount of Object.values(r.ingredients))if(!Number.isSafeInteger(amount)||amount<1)failures.push(r.id+':ingredient');
  if(!Number.isSafeInteger(r.food)||r.food<0||!Number.isSafeInteger(r.recoverEnergy)||r.recoverEnergy<0)
   failures.push(r.id+':effects');
 }
 return failures;
}
