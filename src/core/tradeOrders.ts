/** Paradise Isle trade board: deterministic daily demand for actually crafted meals.
 * The quote is a premium to ordinary open-market sales, and every paid
 * delivery consumes actual backpack items exactly once.
 */
import type {ActionResult,GameState} from './types';
import {fail} from './types';
import {CRAFT_RECIPES} from '../data/recipes.data';
import {hashSeed,mulberry32,shuffle} from './rng';
import {gainCoins,gainReputation,gainXp,itemCount,removeItem} from './player';

export interface IslandOrder{
 id:string;recipeId:string;itemId:string;name:{zh:string;en:string};
 count:number;reward:number;xp:number;client:{zh:string;en:string};
}
const CLIENTS=[
 {zh:'海湾咖啡馆',en:'Bayfront Café'},
 {zh:'灯塔管理员',en:'Lighthouse Keeper'},
 {zh:'邻岛民宿',en:'Island Guesthouse'},
 {zh:'山丘野餐会',en:'Hillside Picnic'},
 {zh:'渡船服务站',en:'Ferry Stop'},
] as const;
const dayKey=(now:number)=>new Date(Number.isFinite(now)&&now>=0?now:0).toISOString().slice(0,10);
const level=(n:number)=>Number.isSafeInteger(n)?Math.min(100,Math.max(1,n)):1;
export function tradeBoard(state:GameState,now:number):IslandOrder[]{
 const day=dayKey(now);
 if(!state.tradeBoard||state.tradeBoard.day!==day){
  state.tradeBoard={day,level:level(state.player.level),completed:[]};
 }
 const tier=level(state.tradeBoard.level);
 const rng=mulberry32(hashSeed(`${state.seed}:${day}:${tier}:trade`));
 const eligible=shuffle(rng,CRAFT_RECIPES.filter(r=>r.unlockLevel<=tier));
 return eligible.slice(0,Math.min(3,eligible.length)).map((recipe,i)=>{
  const count=1+Math.floor(rng()*(tier>=4?3:2));
  const premium=1.40+(rng()*.40);
  return{
   id:`${day}:${tier}:${i}:${recipe.id}`,
   recipeId:recipe.id,itemId:recipe.output,name:recipe.name,count,
   reward:Math.max(recipe.sell*count+1,Math.round(recipe.sell*count*premium)),
   xp:Math.round(recipe.xp*count*(1.5+.3*rng())),
   client:CLIENTS[Math.floor(rng()*CLIENTS.length)]
  };
 });
}
export function deliverTradeOrder(state:GameState,id:string,now:number):ActionResult{
 if(typeof id!=='string'||id.length>120)return fail('trade.invalid');
 const board=tradeBoard(state,now);
 const offer=board.find(o=>o.id===id);
 if(!offer)return fail('trade.expired');
 if(state.tradeBoard!.completed.includes(id))return fail('trade.claimed');
 const have=itemCount(state,offer.itemId);
 if(!Number.isSafeInteger(have)||have<offer.count)return fail('trade.insufficient');
 // Atomic transaction: check all failure conditions before any inventory debit.
 if(!removeItem(state,offer.itemId,offer.count))return fail('trade.insufficient');
 state.tradeBoard!.completed.push(id);
 state.stats.itemsSold+=offer.count;
 gainReputation(state,Math.min(8,offer.count*2));
 const coins=gainCoins(state,offer.reward);
 const experience=gainXp(state,offer.xp);
 return {ok:true,events:[
  {type:'fulfillOrder',target:offer.recipeId,amount:1},
  {type:'toast',target:'trade.success',data:{n:offer.count,coins:offer.reward,xp:offer.xp}},
  ...coins,...experience
 ]};
}
export function completedTradeOrders(state:GameState,now:number):number{
 tradeBoard(state,now);
 return state.tradeBoard?.completed.length??0;
}
