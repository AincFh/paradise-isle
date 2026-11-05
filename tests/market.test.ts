import { describe, expect, it } from 'vitest';
import { makeGame, NOW } from './helpers';
import { marketQuote, sellItem } from '../src/core/economy';
import { itemDef } from '../src/core/registry';
import { addItem } from '../src/core/player';

describe('Island daily market', () => {
 it('quotes are stable within a UTC day and vary across later days',()=>{
   const one=marketQuote('produce_carrot',NOW);
   expect(marketQuote('produce_carrot',NOW+3*3600_000)).toEqual(one);
   const prices=new Set(Array.from({length:24},(_,n)=>marketQuote('produce_carrot',NOW+n*86_400_000).unitPrice));
   expect(prices.size).toBeGreaterThan(1);
 });
 it('market changes only tradable outputs and never affects non-sellable items',()=>{
   const p=itemDef('produce_carrot');
   for(let i=0;i<40;i++){
     const q=marketQuote(p.id,NOW+i*86_400_000);
     expect(q.unitPrice).toBeGreaterThanOrEqual(Math.round(p.sell*.85));
     expect(q.unitPrice).toBeLessThanOrEqual(Math.round(p.sell*1.25)+1);
     expect(['hot','steady','quiet']).toContain(q.trend);
   }
   const seed=marketQuote('seed_carrot',NOW);
   expect(seed.multiplier).toBe(1);
 });
 it('sale revenue exactly equals displayed quote; no reload reroll exploit',()=>{
   const s=makeGame();addItem(s,'produce_carrot',5);
   const displayed=marketQuote('produce_carrot',NOW).unitPrice;
   const old=s.player.coins;
   const r=sellItem(s,'produce_carrot',5,NOW);
   expect(r.ok).toBe(true);
   expect(s.player.coins).toBe(old+displayed*5);
   expect(s.inventory.produce_carrot).toBeUndefined();
   expect(s.stats.itemsSold).toBe(5);
 });
 it('old call sites remain on base price when no timestamp is provided',()=>{
   const s=makeGame();addItem(s,'produce_carrot',2);
   const base=itemDef('produce_carrot').sell,coins=s.player.coins;
   expect(sellItem(s,'produce_carrot',2).ok).toBe(true);
   expect(s.player.coins).toBe(coins+base*2);
 });
 it('reject zero, fractional, negative, massive, non-finite and oversold transactions',()=>{
   const s=makeGame();addItem(s,'produce_carrot',4);
   const old=JSON.stringify(s);
   for(const n of [0,-3,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,5]){
     expect(sellItem(s,'produce_carrot',n,NOW).ok).toBe(false);
     expect(JSON.stringify(s)).toBe(old);
   }
 });
});
