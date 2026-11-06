/**
 * Paradise Isle — real fishing derby.
 *
 * Score only REAL, successful catches produced by the rod minigame after the
 * player explicitly joins. One UTC-day competition, three earned medals,
 * each paid at most once. No inventory turn-in, no bonus for repeated clicks,
 * no free fish and no service-side state.
 *
 * The same pure functions handle initial play, save restore and offline ticks.
 */
import type {
  ActionResult, FishDef, FishRarity, FishingCupState, GameEvent, GameState,
} from './types';
import { allFish } from './registry';
import { gainCoins, gainReputation, gainXp } from './player';
import { fail } from './types';
import { shippingDayKey } from './shipping';

export const FISHING_CUP_POINTS: Readonly<Record<FishRarity,number>> = {
  common:10,uncommon:26,rare:65,epic:145,legendary:360,
};
export const FISHING_CUP_VARIETY_BONUS=6;
export const FISHING_CUP_PERFECT_BONUS=8;
export const FISHING_CUP_MEDALS = [
  {id:'bronze',name:{zh:'海湾铜章',en:'Harbor Bronze'},catches:3,score:30,species:1,coins:90,xp:20,reputation:1},
  {id:'silver',name:{zh:'潮汐银章',en:'Tidal Silver'},catches:6,score:105,species:2,coins:260,xp:55,reputation:3},
  {id:'gold',name:{zh:'深海金章',en:'Deepwater Gold'},catches:10,score:240,species:3,coins:800,xp:145,reputation:7},
] as const;
export type FishingCupMedal=typeof FISHING_CUP_MEDALS[number]['id'];

export const emptyFishingCup=():FishingCupState=>({
  day:'',entered:false,catches:0,points:0,species:{},claimed:[],lifetimeMedals:0,bestDailyPoints:0,
});

const positive=(n:unknown,max:number):number=>
  Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=max?Number(n):0;
const validDay=(d:unknown):d is string=>
  typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
  Number.isFinite(Date.parse(d+'T00:00:00.000Z'))&&
  new Date(d+'T00:00:00.000Z').toISOString().slice(0,10)===d;

/** Malformed old / imported slot data is replaced rather than trusted. */
export function ensureFishingCup(state:GameState):FishingCupState{
  const raw=state.fishingCup;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    state.fishingCup=emptyFishingCup();return state.fishingCup;
  }
  const fishIds=new Set(allFish().map(f=>f.id));
  const species:Record<string,number>={};
  if(raw.species&&typeof raw.species==='object'&&!Array.isArray(raw.species)){
    for(const [id,n] of Object.entries(raw.species)){
      if(fishIds.has(id)&&positive(n,100_000)>0)species[id]=Number(n);
    }
  }
  const claimed=[...new Set(Array.isArray(raw.claimed)?raw.claimed:[])].
    filter((id):id is FishingCupMedal=>FISHING_CUP_MEDALS.some(m=>m.id===id));
  const catches=positive(raw.catches,100_000),points=positive(raw.points,10_000_000);
  const valid=validDay(raw.day)&&raw.entered===true;
  state.fishingCup={
    day:validDay(raw.day)?raw.day:'',
    entered:valid,
    catches:valid?catches:0,
    points:valid?points:0,
    species:valid?species:{},
    claimed:valid?claimed:[],
    lifetimeMedals:positive(raw.lifetimeMedals,100_000),
    bestDailyPoints:positive(raw.bestDailyPoints,10_000_000),
  };
  return state.fishingCup;
}

/**
 * Advance to the next UTC day. A backwards clock cannot reset a recorded
 * competition or grant yesterday's medals again.
 */
export function syncFishingCupDay(state:GameState,now:number):boolean{
  const current=shippingDayKey(now);
  if(!current)return false;
  const cup=ensureFishingCup(state);
  if(cup.day&&current<cup.day)return false;
  if(cup.day!==current){
    cup.bestDailyPoints=Math.max(cup.bestDailyPoints,cup.points);
    cup.day=current;cup.entered=false;cup.catches=0;cup.points=0;
    cup.species={};cup.claimed=[];
  }
  return true;
}

export function enterFishingCup(state:GameState,now:number):ActionResult{
  if(!syncFishingCupDay(state,now))return fail('cup.invalidDate');
  const cup=state.fishingCup!;
  if(cup.entered)return fail('cup.alreadyJoined');
  cup.entered=true;
  return {ok:true,events:[{type:'toast',target:'cup.joined'}]};
}

/** Called only from a successful, fully resolved rod catch. Never accepts inventory. */
export function recordFishingCupCatch(state:GameState,fish:FishDef,quality:number,now:number):number{
  if(!Number.isFinite(quality)||quality<.45||quality>1)return 0;
  if(!syncFishingCupDay(state,now))return 0;
  const cup=state.fishingCup!;
  if(!cup.entered)return 0;
  if(!allFish().some(f=>f.id===fish.id))return 0;
  const first=(cup.species[fish.id]||0)===0;
  const gained=FISHING_CUP_POINTS[fish.rarity]+(first?FISHING_CUP_VARIETY_BONUS:0)+
    (quality>=.85?FISHING_CUP_PERFECT_BONUS:0);
  cup.catches=Math.min(100_000,cup.catches+1);
  cup.points=Math.min(10_000_000,cup.points+gained);
  cup.species[fish.id]=Math.min(100_000,(cup.species[fish.id]||0)+1);
  cup.bestDailyPoints=Math.max(cup.bestDailyPoints,cup.points);
  return gained;
}

export interface FishingCupMedalStatus{
  id:FishingCupMedal;
  name:{zh:string;en:string};
  catches:number;score:number;species:number;coins:number;xp:number;reputation:number;
  earned:boolean;claimed:boolean;claimable:boolean;
}
export interface FishingCupStatus{
  day:string;entered:boolean;catches:number;points:number;speciesCount:number;
  claimed:FishingCupMedal[];
  medals:FishingCupMedalStatus[];
  lifetimeMedals:number;bestDailyPoints:number;
  nextDayMs:number;
  clockRollback:boolean;
}

export function fishingCupStatus(state:GameState,now:number):FishingCupStatus{
  const allowed=syncFishingCupDay(state,now);
  const cup=state.fishingCup!;
  const current=shippingDayKey(now);
  const sameDay=allowed&&current===cup.day;
  const speciesCount=Object.keys(cup.species).filter(k=>cup.species[k]>0).length;
  const medals=FISHING_CUP_MEDALS.map(m=>{
    const claimed=cup.claimed.includes(m.id),earned=sameDay&&cup.entered&&
      cup.catches>=m.catches&&cup.points>=m.score&&speciesCount>=m.species;
    return {...m,earned,claimed,claimable:earned&&!claimed};
  });
  const tomorrow=sameDay?(Math.floor(now/86_400_000)+1)*86_400_000-now:0;
  return {day:cup.day,entered:sameDay&&cup.entered,
    catches:sameDay?cup.catches:0,points:sameDay?cup.points:0,
    speciesCount:sameDay?speciesCount:0,
    claimed:sameDay?[...cup.claimed]:[],medals,lifetimeMedals:cup.lifetimeMedals,
    bestDailyPoints:cup.bestDailyPoints,nextDayMs:tomorrow,clockRollback:!allowed};
}

/** Medal rewards are a single atomic, explicit claim per tier per UTC day. */
export function claimFishingCup(state:GameState,id:string,now:number):ActionResult{
  if(!FISHING_CUP_MEDALS.some(m=>m.id===id))return fail('cup.invalidMedal');
  const status=fishingCupStatus(state,now);
  if(status.clockRollback)return fail('cup.invalidDate');
  if(!status.entered)return fail('cup.notJoined');
  const medal=status.medals.find(m=>m.id===id)!;
  if(medal.claimed)return fail('cup.alreadyClaimed');
  if(!medal.claimable)return fail('cup.notReady');
  const cup=state.fishingCup!;
  cup.claimed.push(medal.id);
  cup.lifetimeMedals++;
  const events:GameEvent[]=[
    ...gainCoins(state,medal.coins),
    ...gainXp(state,medal.xp),
    {type:'toast',target:'cup.medalAwarded'},
  ];
  gainReputation(state,medal.reputation);
  return {ok:true,events};
}
