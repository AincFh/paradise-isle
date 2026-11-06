/** Farm operations planner. All bulk actions call the ordinary single-plot
 * transactions so XP, quest progress, seed consumption, regeneration and energy
 * stay identical to doing the actions manually. No automated time travel.
 */
import type {ActionResult,GameState} from './types';
import {fail} from './types';
import {allCrops} from './registry';
import {cropView,plant,water} from './crops';
import {ENERGY_COST,WATER_COOLDOWN_MS} from './balance';

export const FARM_BATCH_LIMIT=50;
export function validFarmBatch(value:number):boolean{
 return Number.isSafeInteger(value)&&value>=1&&value<=FARM_BATCH_LIMIT;
}
export interface FarmPlan {
 empty:number;planted:number;ready:number;withered:number;waterable:number;
 cropId:string;seedId:string;ownedSeeds:number;seedPrice:number;
 plantable:number;waterCapacity:number;energy:number;estimatedHarvestMin:number;
 estimatedHarvestMax:number;
}
export function farmPlan(state:GameState,cropId:string,now:number):FarmPlan|null{
 const crop=allCrops().find(c=>c.id===cropId);
 if(!crop||!Number.isFinite(now)||now<0)return null;
 let empty=0,planted=0,ready=0,withered=0,waterable=0;
 for(const plot of state.plots){
  if(!plot.crop){empty++;continue}
  planted++;
  const view=cropView(plot.crop,now);
  if(view.stage==='ready')ready++;
  else if(view.stage==='withered')withered++;
  else if(!view.wet&&now-plot.crop.lastWateredAt>=WATER_COOLDOWN_MS)waterable++;
 }
 const raw=state.inventory[crop.seedId]??0;
 const ownedSeeds=Number.isSafeInteger(raw)&&raw>0?raw:0;
 const energy=Math.max(0,Math.floor(Number.isFinite(state.player.energy)?state.player.energy:0));
 const plantable=state.player.level>=crop.unlockLevel?
  Math.min(empty,ownedSeeds,Math.floor(energy/ENERGY_COST.plant),FARM_BATCH_LIMIT):0;
 return {empty,planted,ready,withered,waterable,
  cropId:crop.id,seedId:crop.seedId,ownedSeeds,seedPrice:crop.seedPrice,
  plantable,waterCapacity:Math.min(waterable,Math.floor(energy/ENERGY_COST.water),
   FARM_BATCH_LIMIT),
  energy,estimatedHarvestMin:plantable*crop.yieldMin,
  estimatedHarvestMax:plantable*crop.yieldMax};
}
export interface FarmBatchResult extends ActionResult{
 completed?:number;remaining?:number;
}
export function sowBatch(state:GameState,cropId:string,limit:number,now:number):FarmBatchResult{
 if(!validFarmBatch(limit)||!Number.isFinite(now)||now<0)return fail('farm.invalidCount');
 const crop=allCrops().find(c=>c.id===cropId);
 if(!crop)return fail('farm.unknownCrop');
 if(state.player.level<crop.unlockLevel)return fail('msg.locked');
 const ids=state.plots.filter(p=>!p.crop).slice(0,limit).map(p=>p.uid);
 if(!ids.length)return fail('farm.noEmpty');
 const events:NonNullable<ActionResult['events']>=[];
 let completed=0;let lastFailure='msg.noSeed';
 for(const uid of ids){
  const result=plant(state,uid,cropId,now);
  if(!result.ok){lastFailure=result.reason??'msg.noEnergy';break}
  completed++;
  if(result.events)events.push(...result.events);
 }
 if(!completed)return fail(lastFailure);
 return {ok:true,events,completed,remaining:state.plots.filter(p=>!p.crop).length};
}
export function waterBatch(state:GameState,limit:number,now:number):FarmBatchResult{
 if(!validFarmBatch(limit)||!Number.isFinite(now)||now<0)return fail('farm.invalidCount');
 const eligible=()=>state.plots.filter(p=>p.crop&&
  !['ready','withered'].includes(cropView(p.crop,now).stage)&&
  now-p.crop.lastWateredAt>=WATER_COOLDOWN_MS);
 const ids=eligible().slice(0,limit).map(p=>p.uid);
 if(!ids.length)return fail('farm.noWater');
 const events:NonNullable<ActionResult['events']>=[];
 let completed=0;let lastFailure='msg.noEnergy';
 for(const uid of ids){
  const result=water(state,uid,now);
  if(!result.ok){lastFailure=result.reason??'msg.noEnergy';break}
  completed++;
  if(result.events)events.push(...result.events);
 }
 if(!completed)return fail(lastFailure);
 return {ok:true,events,completed,remaining:eligible().length};
}
