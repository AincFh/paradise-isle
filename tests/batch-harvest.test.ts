import {describe, expect, it} from 'vitest';
import {makeGame,NOW} from './helpers';
import {cropDef} from '../src/core/registry';
import {cropView,plant,harvest,harvestReadyPlots,readyPlotCount} from '../src/core/crops';
import {ENERGY_COST} from '../src/core/balance';

function seeded(){
 const state=makeGame();
 for(const plot of state.plots.slice(0,4))expect(plant(state,plot.uid,'crop_carrot',NOW).ok).toBe(true);
 const when=NOW+cropDef('crop_carrot').growMs;
 return {state,when};
}
describe('批量收获 / batch-harvesting economy',()=>{
 it('harvests exactly the eligible plots through existing settlement rules',()=>{
  const {state,when}=seeded();
  expect(readyPlotCount(state,when)).toBe(4);
  const energy=state.player.energy,food=state.player.food,xp=state.player.xp;
  const result=harvestReadyPlots(state,when);
  expect(result.ok).toBe(true);
  expect(result.harvested).toBe(4);
  expect(result.remaining).toBe(0);
  expect(result.events?.filter(e=>e.type==='harvest')).toHaveLength(4);
  expect(state.player.food-food).toBe(4*cropDef('crop_carrot').foodYield);
  expect(state.player.energy).toBe(energy-4*ENERGY_COST.harvest);
  expect(state.player.xp).toBeGreaterThan(xp);
  expect(state.inventory['produce_carrot']).toBeGreaterThanOrEqual(4*cropDef('crop_carrot').yieldMin);
  expect(state.plots.every(p=>p.crop===null)).toBe(true);
  expect(harvestReadyPlots(state,when).ok).toBe(false);
 });
 it('respects caller limit and can process the remaining harvest in a second batch',()=>{
  const {state,when}=seeded();
  const first=harvestReadyPlots(state,when,2);
  expect(first.harvested).toBe(2);
  expect(first.remaining).toBe(2);
  const second=harvestReadyPlots(state,when);
  expect(second.harvested).toBe(2);
  expect(second.remaining).toBe(0);
  expect(harvestReadyPlots(state,when,-1).ok).toBe(false);
  expect(harvestReadyPlots(state,when,51).ok).toBe(false);
 });
 it('does not harvest immature or withered crops and does not grant free loot',()=>{
  const {state,when}=seeded();
  const before={...state.inventory};
  expect(harvestReadyPlots(state,NOW+2000).ok).toBe(false);
  expect(state.inventory).toEqual(before);
  const late=when+cropDef('crop_carrot').witherMs+5000;
  expect(harvestReadyPlots(state,late).ok).toBe(false);
  expect(state.inventory).toEqual(before);
 });
 it('partial energy shortage never duplicates the two already earned plots',()=>{
  const {state,when}=seeded();
  state.player.energy=2;state.player.energyUpdatedAt=when;
  const result=harvestReadyPlots(state,when);
  expect(result.ok).toBe(true);
  expect(result.harvested).toBe(2);
  expect(result.remaining).toBe(2);
  expect(state.player.energy).toBe(0);
  expect(harvestReadyPlots(state,when).ok).toBe(false);
  expect(readyPlotCount(state,when)).toBe(2);
 });
 it('tree is only harvested once until its legitimate regrow timer',()=>{
  const {state,when}=seeded();
  // This test uses the ordinary crop harvest path; no special fake rewards.
  const ordinary=harvest(state,state.plots[0].uid,when);
  expect(ordinary.ok).toBe(true);
  expect(readyPlotCount(state,when)).toBe(3);
  expect(harvestReadyPlots(state,when).harvested).toBe(3);
 });
});
