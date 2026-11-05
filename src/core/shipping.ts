/**
 * Paradise Isle — daily freight board.
 *
 * Quote only goods that can exist at the islander's current level; every
 * order is drawn from the real content registry and today's market prices.
 * Accepted terms are locked, inventory can be delivered in several batches,
 * and gold/XP are granted once, after every crate is fulfilled.
 *
 * All time is explicit. No browser/global randomness or DOM dependency.
 */
import type { ActionResult, GameEvent, GameState, ShippingContract, ShippingState } from './types';
import { allAnimals, allCrops, allFish, itemDef } from './registry';
import { marketQuote } from './economy';
import { gainCoins, gainReputation, gainXp, itemCount, removeItem } from './player';
import { fail } from './types';

export const SHIPPING_DEADLINE_MS = 18 * 60 * 60 * 1000;
const DAY_MS=86_400_000;

const dayNumber=(now:number):number=>Math.floor(now/DAY_MS);
function validNow(now:number):boolean{
  return Number.isSafeInteger(now)&&now>=0&&now<=8_640_000_000_000_000;
}
export function shippingDayKey(now:number):string{
  if(!validNow(now))return '';
  return new Date(now).toISOString().slice(0,10);
}
export function emptyShippingState():ShippingState{
  return { active:null,lastAcceptedDay:'',completedDay:'',completed:0,expired:0 };
}

/** Restore old slots without wiping gameplay. Discard invalid shipment data. */
export function ensureShippingState(state:GameState):ShippingState{
  const existing=state.shipping;
  if(!existing||typeof existing!=='object'){
    state.shipping=emptyShippingState();return state.shipping;
  }
  const num=(x:unknown,max=1e8):number=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=max?Number(x):0;
  const str=(x:unknown):string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?x:'';
  const box:ShippingState={
    active:null,
    lastAcceptedDay:str(existing.lastAcceptedDay),completedDay:str(existing.completedDay),
    completed:num(existing.completed),expired:num(existing.expired),
  };
  const active=existing.active;
  if(active&&typeof active==='object'&&typeof active.id==='string'&&
     typeof active.itemId==='string'&&active.id.length<100&&
     active.itemId.length<100&&Number.isSafeInteger(active.quantity)&&
     active.quantity>=1&&active.quantity<=10&&Number.isSafeInteger(active.delivered)&&
     active.delivered>=0&&active.delivered<active.quantity&&
     Number.isSafeInteger(active.rewardCoins)&&active.rewardCoins>0&&
     active.rewardCoins<=1e8&&Number.isSafeInteger(active.rewardXp)&&active.rewardXp>0&&
     active.rewardXp<=10000&&validNow(active.acceptedAt)&&
     validNow(active.expiresAt)&&active.expiresAt>active.acceptedAt&&
     active.expiresAt-active.acceptedAt<=SHIPPING_DEADLINE_MS){
    try {
      const item=itemDef(active.itemId);
      if(item.sell>0&&['produce','animalGood','fish','crafted'].includes(item.category)){
        box.active={...active};
      }
    }catch{ /* Save contains an item no longer present in registry. */ }
  }
  state.shipping=box;
  return box;
}
const mix=(n:number):number=>{
  let x=(n^0x9e3779b9)>>>0;
  x=Math.imul(x^(x>>>16),0x21f0aaad);
  x=Math.imul(x^(x>>>15),0x735a2d97);
  return (x^(x>>>15))>>>0;
};
const hashItem=(id:string):number=>{
  let h=2166136261>>>0;
  for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
  return h;
};
export interface FreightOffer {
  id:string;
  itemId:string;
  quantity:number;
  rewardCoins:number;
  rewardXp:number;
  unitMarketPrice:number;
  premiumPercent:number;
}
/** Three deterministic, distinct offers for the UTC day. No paid reroll. */
export function freightOffers(state:GameState,now:number):FreightOffer[]{
  if(!validNow(now))return[];
  const items=[
    ...allCrops().filter(c=>c.unlockLevel<=state.player.level).map(c=>c.produceId),
    ...allAnimals().filter(a=>a.unlockLevel<=state.player.level).map(a=>a.produceId),
    ...allFish().filter(f=>f.minRodTier<=state.player.rodTier&&
      (f.rarity==='common'||(state.player.level>=6&&f.rarity==='uncommon'))).map(f=>f.id),
  ];
  const eligible=[...new Set(items)].filter(id=>itemDef(id).sell>0);
  const day=dayNumber(now),base=mix((state.seed>>>0)^day);
  const ranked=eligible.map(id=>({id,order:mix(base^hashItem(id))})).
    sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  return ranked.slice(0,3).map(({id,order},i)=>{
    const quantity=2+mix(order^base^0x77a5f78b)%4;
    const unitMarketPrice=marketQuote(id,now).unitPrice;
    const premiumPercent=35+mix(order^0x5f3759df)%31;
    const rewardCoins=Math.round(unitMarketPrice*quantity*(1+premiumPercent/100))+10;
    const rewardXp=8+quantity*4+Math.min(25,Math.floor(state.player.level/2));
    return {id:`${day}-${i}-${(order>>>0).toString(36)}`,itemId:id,
      quantity,rewardCoins,rewardXp,unitMarketPrice,premiumPercent};
  });
}
export interface FreightStatus{
  active:ShippingContract|null;
  offers:FreightOffer[];
  available:number;
  remaining:number;
  expiresInMs:number;
  acceptedToday:boolean;
  completedToday:boolean;
  completed:number;
  expired:number;
}
export function freightStatus(state:GameState,now:number):FreightStatus{
  const board=ensureShippingState(state),today=shippingDayKey(now);
  const active=board.active;
  const remaining=active?Math.max(0,active.quantity-active.delivered):0;
  return {active:active?{...active}:null,offers:freightOffers(state,now),
    available:active?Math.max(0,Math.min(remaining,itemCount(state,active.itemId))):0,
    remaining,expiresInMs:active?Math.max(0,active.expiresAt-now):0,
    acceptedToday:board.lastAcceptedDay===today,completedToday:board.completedDay===today,
    completed:board.completed,expired:board.expired};
}
/** One accepted order per real UTC day, even after completion/expiration. */
export function acceptFreight(state:GameState,id:string,now:number):ActionResult{
  if(!validNow(now))return fail('freight.invalid');
  expireFreight(state,now);
  const board=ensureShippingState(state),day=shippingDayKey(now);
  if(board.active)return fail('freight.busy');
  if(board.lastAcceptedDay===day)return fail('freight.dailyLimit');
  const offer=freightOffers(state,now).find(x=>x.id===id);
  if(!offer)return fail('freight.unknown');
  board.active={id:offer.id,itemId:offer.itemId,quantity:offer.quantity,delivered:0,
    rewardCoins:offer.rewardCoins,rewardXp:offer.rewardXp,
    acceptedAt:now,expiresAt:now+SHIPPING_DEADLINE_MS};
  board.lastAcceptedDay=day;
  return {ok:true,events:[{type:'toast',target:'freight.accepted'}]};
}
/** Only already-deposited cargo is lost at expiry; never award incomplete work. */
export function expireFreight(state:GameState,now:number):boolean{
  if(!validNow(now)||!state.shipping?.active)return false;
  const board=ensureShippingState(state);
  if(!board.active||now<board.active.expiresAt)return false;
  board.active=null;board.expired++;
  return true;
}
/** Explicit batch delivery; invalid requests have zero side effects. */
export function deliverFreight(state:GameState,count:number,now:number):ActionResult{
  if(!validNow(now)||!Number.isSafeInteger(count)||count<1||count>10)return fail('freight.invalid');
  const board=ensureShippingState(state);
  if(!board.active)return fail('freight.noActive');
  if(now>=board.active.expiresAt){expireFreight(state,now);return fail('freight.expired')}
  const job=board.active,remaining=job.quantity-job.delivered;
  if(count>remaining||itemCount(state,job.itemId)<count)return fail('msg.notEnough');
  if(!removeItem(state,job.itemId,count))return fail('msg.notEnough');
  job.delivered+=count;
  if(job.delivered<job.quantity)return {ok:true,events:[{type:'toast',target:'freight.partial'}]};
  board.active=null;board.completed++;board.completedDay=shippingDayKey(now);
  const coinEvents=gainCoins(state,job.rewardCoins);
  gainReputation(state,Math.max(1,Math.round(job.rewardCoins/180)));
  const xpEvents=gainXp(state,job.rewardXp);
  const events:GameEvent[]=[...coinEvents,...xpEvents,{type:'toast',target:'freight.completed'}];
  return {ok:true,events};
}
