import {describe,it,expect} from 'vitest';
import {makeGame,NOW} from './helpers';
import {farmPlan,sowBatch,waterBatch,clearWitheredBatch,FARM_BATCH_LIMIT} from '../src/core/farm-planner';
import {buySeed} from '../src/core/economy';
import {cropView,harvestReadyPlots} from '../src/core/crops';
import {applyEvents} from '../src/core/quests';
import {deserialize,serialize} from '../src/save/save';
import {ENERGY_COST,WATER_COOLDOWN_MS} from '../src/core/balance';

describe('Farm operations desk: quotes and live inventory',()=>{
 it('quotes all four starting farm plots without writing to game state',()=>{
  const s=makeGame(),before=JSON.stringify(s);
  const p=farmPlan(s,'crop_carrot',NOW)!;
  expect(p).toMatchObject({empty:4,planted:0,ready:0,withered:0,waterable:0,
   ownedSeeds:4,plantable:4,seedPrice:10,seedId:'seed_carrot'});
  expect(p.estimatedHarvestMin).toBe(8);
  expect(p.estimatedHarvestMax).toBe(12);
  expect(JSON.stringify(s)).toBe(before);
 });
 it('locked crops and missing crop IDs never report actionable planting capacity',()=>{
  const s=makeGame();
  s.inventory.seed_starfruit=999;
  expect(farmPlan(s,'crop_starfruit',NOW)!.plantable).toBe(0);
  expect(farmPlan(s,'missing',NOW)).toBeNull();
  expect(farmPlan(s,'crop_carrot',Number.NaN)).toBeNull();
 });
 it('prevents buying negative, fractional, infinite or excess seed counts',()=>{
  const s=makeGame(),before=JSON.stringify(s);
  for(const count of [-500,-1,0,1.5,NaN,Infinity,51,Number.MAX_SAFE_INTEGER]){
   expect(buySeed(s,'crop_carrot',count).ok).toBe(false);
   expect(JSON.stringify(s)).toBe(before);
  }
  expect(buySeed(s,'crop_carrot',5).ok).toBe(true);
  expect(s.player.coins).toBe(450);
  expect(s.inventory.seed_carrot).toBe(9);
 });
});
describe('Farm operations desk: actual farming gameplay',()=>{
 it('sows real plots using actual seeds and energy; emits genuine quest events',()=>{
  const s=makeGame(),energy=s.player.energy;
  const r=sowBatch(s,'crop_carrot',3,NOW);
  expect(r).toMatchObject({ok:true,completed:3,remaining:1});
  expect(s.plots.filter(p=>p.crop?.defId==='crop_carrot')).toHaveLength(3);
  expect(s.inventory.seed_carrot).toBe(1);
  expect(s.player.energy).toBe(energy-3*ENERGY_COST.plant);
  applyEvents(s,r.events??[],NOW);
  expect(s.stats.plantings).toBe(3);
  expect(farmPlan(s,'crop_carrot',NOW)!.plantable).toBe(1);
 });
 it('stops safely mid-batch on low seeds and never spends imaginary stock',()=>{
  const s=makeGame();
  s.inventory.seed_carrot=2;
  const r=sowBatch(s,'crop_carrot',5,NOW);
  expect(r).toMatchObject({ok:true,completed:2,remaining:2});
  expect(s.inventory.seed_carrot).toBeUndefined();
  const before=JSON.stringify(s);
  expect(sowBatch(s,'crop_carrot',3,NOW).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
 });
 it('stops safely mid-batch on depleted energy',()=>{
  const s=makeGame();
  s.player.energy=2;s.player.energyUpdatedAt=NOW;
  expect(sowBatch(s,'crop_carrot',4,NOW)).toMatchObject({
   ok:true,completed:2,remaining:2
  });
  expect(s.player.energy).toBe(0);
  expect(s.inventory.seed_carrot).toBe(2);
  const before=JSON.stringify(s);
  expect(sowBatch(s,'crop_carrot',1,NOW).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
 });
 it('batch watering accelerates growth, respects per-plot cooldown and charges energy',()=>{
  const s=makeGame();
  expect(sowBatch(s,'crop_carrot',3,NOW).ok).toBe(true);
  const t=NOW+1000;
  const plot=s.plots[0];
  const before=cropView(plot.crop!,t).etaMs;
  const startingEnergy=s.player.energy;
  const r=waterBatch(s,3,t);
  expect(r).toMatchObject({ok:true,completed:3,remaining:0});
  expect(s.player.energy).toBe(startingEnergy-3);
  expect(cropView(plot.crop!,t).etaMs).toBeLessThan(before);
  expect(s.plots.slice(0,3).every(p=>p.crop!.lastWateredAt===t)).toBe(true);
  applyEvents(s,r.events??[],t);
  expect(s.stats.waterings).toBe(3);
  const inv=JSON.stringify(s);
  expect(waterBatch(s,3,t+1000).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(inv);
  expect(farmPlan(s,'crop_carrot',t)!.waterable).toBe(0);
  // Carrots ripen sooner than the watering cooldown, so they are no longer waterable.
  expect(farmPlan(s,'crop_carrot',t+WATER_COOLDOWN_MS)!.waterable).toBe(0);
 });
 it('does not water mature or withered crops',()=>{
  const s=makeGame();
  expect(sowBatch(s,'crop_carrot',3,NOW).ok).toBe(true);
  const future=NOW+90*1000;
  expect(farmPlan(s,'crop_carrot',future)!.ready).toBe(3);
  expect(waterBatch(s,3,future).ok).toBe(false);
 });
 it('rejects malformed requests without any mutation',()=>{
  const s=makeGame(),before=JSON.stringify(s);
  for(const count of [-1,0,1.5,NaN,Infinity,FARM_BATCH_LIMIT+1]){
   expect(sowBatch(s,'crop_carrot',count,NOW).ok).toBe(false);
   expect(waterBatch(s,count,NOW).ok).toBe(false);
  }
  expect(sowBatch(s,'unknown',1,NOW).ok).toBe(false);
  expect(sowBatch(s,'crop_starfruit',1,NOW).ok).toBe(false);
  expect(sowBatch(s,'crop_carrot',1,Number.NaN).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
 });
 it('round-trips planted and watered plots through the existing v3 save schema',()=>{
  const s=makeGame();
  sowBatch(s,'crop_carrot',3,NOW);
  waterBatch(s,3,NOW+1000);
  const clone=deserialize(serialize(s,NOW+1500),NOW+1500);
  expect(clone.plots.slice(0,3).every(p=>p.crop?.lastWateredAt===NOW+1000)).toBe(true);
  expect(clone.inventory.seed_carrot).toBe(1);
  expect(clone.player.energy).toBe(s.player.energy);
  expect(farmPlan(clone,'crop_carrot',NOW+1500)!.waterable).toBe(0);
 });
});

describe('Closed farming loop: harvest ripe plots and reclaim withered farmland',()=>{
 it('batch harvest pays actual produce and XP via ordinary crop transactions',()=>{
  const s=makeGame();const food=s.player.food,energy=s.player.energy;
  expect(sowBatch(s,'crop_carrot',3,NOW).ok).toBe(true);
  const ripe=NOW+90_000;
  expect(farmPlan(s,'crop_carrot',ripe)).toMatchObject({ready:3,withered:0});
  const result=harvestReadyPlots(s,ripe,3);
  expect(result).toMatchObject({ok:true,harvested:3,remaining:0});
  applyEvents(s,result.events??[],ripe);
  expect(s.stats.harvests).toBeGreaterThan(0);
  expect(s.inventory.produce_carrot).toBeGreaterThanOrEqual(6);
  expect(s.inventory.produce_carrot).toBeLessThanOrEqual(9);
  expect(s.player.food).toBeGreaterThan(food);
  expect(s.player.energy).toBeLessThanOrEqual(energy);
  expect(s.plots.filter(p=>p.crop)).toHaveLength(0);
  const quantity=s.inventory.produce_carrot;
  expect(harvestReadyPlots(s,ripe,3).ok).toBe(false);
  expect(s.inventory.produce_carrot).toBe(quantity);
 });
 it('clears withered plots, costs energy, and creates no fictional produce',()=>{
  const s=makeGame();sowBatch(s,'crop_carrot',3,NOW);
  const expiry=NOW+90_000+30*60_000+1000;
  // Disable lazy regeneration for precise energy accounting in this test.
  s.player.energy=5;s.player.energyUpdatedAt=expiry;
  const inventory=JSON.stringify(s.inventory);
  expect(farmPlan(s,'crop_carrot',expiry)).toMatchObject({ready:0,withered:3});
  const r=clearWitheredBatch(s,2,expiry);
  expect(r).toMatchObject({ok:true,completed:2,remaining:1});
  expect(s.player.energy).toBe(3);
  expect(JSON.stringify(s.inventory)).toBe(inventory);
  expect(s.plots.filter(p=>p.crop)).toHaveLength(1);
  expect(clearWitheredBatch(s,2,expiry)).toMatchObject({ok:true,completed:1,remaining:0});
  expect(s.player.energy).toBe(2);
  expect(farmPlan(s,'crop_carrot',expiry)!.empty).toBe(4);
  expect(clearWitheredBatch(s,1,expiry)).toMatchObject({ok:false,reason:'farm.noWithered'});
  // Ordinary planting can immediately use reclaimed plots without new schema.
  expect(sowBatch(s,'crop_carrot',1,expiry).ok).toBe(true);
  expect(s.plots.filter(p=>p.crop)).toHaveLength(1);
 });
 it('partially clears on energy shortage without modifying healthy or ready plants',()=>{
  const s=makeGame();sowBatch(s,'crop_carrot',4,NOW);
  const expiry=NOW+90_000+30*60_000+1000;
  s.plots[3].crop!.plantedAt=expiry-90_000; // last plot is ripe
  s.player.energy=2;s.player.energyUpdatedAt=expiry;
  const before=JSON.stringify(s.inventory);
  const result=clearWitheredBatch(s,4,expiry);
  expect(result).toMatchObject({ok:true,completed:2,remaining:1});
  expect(s.player.energy).toBe(0);
  expect(JSON.stringify(s.inventory)).toBe(before);
  expect(s.plots[2].crop).not.toBeNull();
  expect(s.plots[3].crop).not.toBeNull();
  const snapshot=JSON.stringify(s);
  expect(clearWitheredBatch(s,2,expiry).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(snapshot);
 });
 it('malformed clear requests never mutate coins, seeds, crops or energy',()=>{
  const s=makeGame();
  sowBatch(s,'crop_carrot',1,NOW);
  const expired=NOW+90_000+30*60_000+1000;
  const before=JSON.stringify(s);
  for(const value of [0,-1,1.5,NaN,Infinity,51]){
   expect(clearWitheredBatch(s,value,expired).ok).toBe(false);
   expect(JSON.stringify(s)).toBe(before);
  }
  expect(clearWitheredBatch(s,1,Number.NaN).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
 });
});
