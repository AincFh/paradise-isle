import {describe,expect,it} from 'vitest';
import {makeGame,NOW} from './helpers';
import {addItem} from '../src/core/player';
import {tickWorld} from '../src/core/state';
import {serialize,deserialize} from '../src/save/save';
import {marketQuote} from '../src/core/economy';
import {
 acceptFreight,deliverFreight,freightOffers,freightStatus,expireFreight,
 ensureShippingState,shippingDayKey,SHIPPING_DEADLINE_MS
} from '../src/core/shipping';

const nextDay=NOW+86_400_000;

describe('Island harbor daily freight contracts',()=>{
 it('provides three deterministic distinct orders for a fixed seed and day',()=>{
  const a=makeGame(777),b=makeGame(777);
  const qa=freightOffers(a,NOW);
  expect(qa).toEqual(freightOffers(a,NOW+15*60_000));
  expect(qa).toEqual(freightOffers(b,NOW));
  expect(qa).toHaveLength(3);
  expect(new Set(qa.map(x=>x.itemId)).size).toBe(3);
  for(const q of qa){
   expect(q.quantity).toBeGreaterThanOrEqual(2);
   expect(q.quantity).toBeLessThanOrEqual(5);
   expect(q.rewardCoins).toBeGreaterThan(q.quantity*q.unitMarketPrice);
   expect(q.rewardXp).toBeGreaterThan(0);
  }
  expect(freightOffers(a,Infinity)).toEqual([]);
  expect(freightOffers(a,-1)).toEqual([]);
  expect(shippingDayKey(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 });
 it('only offers goods a new player could produce or catch with current equipment',()=>{
  const s=makeGame();
  for(const q of freightOffers(s,NOW)){
   expect(['produce_carrot','produce_potato']).toContain(q.itemId.slice(0,8)==='produce_'?q.itemId:q.itemId.includes('fish_')?'produce_carrot':'produce_potato');
   expect(q.itemId.startsWith('produce_')||q.itemId.startsWith('fish_')).toBe(true);
   expect(q.itemId).not.toMatch(/goldkoi|kraken|produce_starfruit|good_peacock/);
  }
  s.player.level=30;s.player.rodTier=3;
  const options=freightOffers(s,NOW);
  expect(options).toHaveLength(3);
  expect(options.every(x=>x.rewardCoins>0)).toBe(true);
 });
 it('acceptance locks quoted price and allows only one shipment per UTC day',()=>{
  const s=makeGame(99),offer=freightOffers(s,NOW)[0];
  const initial=JSON.stringify(s);
  expect(acceptFreight(s,'fake-id',NOW).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(initial);
  expect(acceptFreight(s,offer.id,NOW).ok).toBe(true);
  const active=freightStatus(s,NOW).active!;
  expect(active.itemId).toBe(offer.itemId);
  expect(active.rewardCoins).toBe(offer.rewardCoins);
  expect(active.expiresAt-active.acceptedAt).toBe(SHIPPING_DEADLINE_MS);
  expect(acceptFreight(s,offer.id,NOW+1000).ok).toBe(false);
  expect(freightStatus(s,NOW).acceptedToday).toBe(true);
 });
 it('partial deliveries remove exact real inventory, never award uncompleted shipments',()=>{
  const s=makeGame(11),quote=freightOffers(s,NOW)[0],balance=s.player.coins,xp=s.player.xp;
  expect(acceptFreight(s,quote.id,NOW).ok).toBe(true);
  addItem(s,quote.itemId,quote.quantity+1);
  const first=deliverFreight(s,1,NOW+1000);
  expect(first.ok).toBe(true);
  expect(s.player.coins).toBe(balance);
  expect(s.player.xp).toBe(xp);
  expect(freightStatus(s,NOW).active?.delivered).toBe(1);
  expect(s.inventory[quote.itemId]).toBe(quote.quantity);
  const before=JSON.stringify(s);
  for(const count of [0,-1,1.5,Infinity,quote.quantity+1]){
   expect(deliverFreight(s,count,NOW+1000).ok).toBe(false);
   expect(JSON.stringify(s)).toBe(before);
  }
  const done=deliverFreight(s,quote.quantity-1,NOW+2000);
  expect(done.ok).toBe(true);
  expect(s.player.coins).toBe(balance+quote.rewardCoins);
  expect(s.inventory[quote.itemId]).toBe(1);
  expect(s.shipping?.completed).toBe(1);
  expect(freightStatus(s,NOW).completedToday).toBe(true);
  expect(done.events?.some(x=>x.type==='earnCoins'&&x.amount===quote.rewardCoins)).toBe(true);
  expect(deliverFreight(s,1,NOW+3000).ok).toBe(false);
  expect(acceptFreight(s,freightOffers(s,NOW)[1].id,NOW).ok).toBe(false);
 });
 it('rejects oversold cargo atomically; no fake payouts from zero stock',()=>{
  const s=makeGame(81),q=freightOffers(s,NOW)[0];
  acceptFreight(s,q.id,NOW);
  const before=JSON.stringify(s);
  expect(deliverFreight(s,1,NOW+500).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
  addItem(s,q.itemId,1);
  expect(deliverFreight(s,2,NOW+500).ok).toBe(false);
  expect(s.inventory[q.itemId]).toBe(1);
 });
 it('expiry is enforced by ordinary offline world tick and prevents late payout',()=>{
  const s=makeGame(31),q=freightOffers(s,NOW)[0];
  expect(acceptFreight(s,q.id,NOW).ok).toBe(true);
  addItem(s,q.itemId,q.quantity);
  tickWorld(s,NOW+SHIPPING_DEADLINE_MS);
  expect(s.shipping?.active).toBe(null);
  expect(s.shipping?.expired).toBe(1);
  expect(deliverFreight(s,q.quantity,NOW+SHIPPING_DEADLINE_MS+1).ok).toBe(false);
  expect(s.inventory[q.itemId]).toBe(q.quantity);
  expect(expireFreight(s,NOW+SHIPPING_DEADLINE_MS+1000)).toBe(false);
 });
 it('expiry occurs at the deadline even on direct delivery without a background tick',()=>{
  const s=makeGame(6),q=freightOffers(s,NOW)[1];
  acceptFreight(s,q.id,NOW);
  addItem(s,q.itemId,q.quantity);
  const b=s.player.coins;
  expect(deliverFreight(s,q.quantity,NOW+SHIPPING_DEADLINE_MS).ok).toBe(false);
  expect(s.shipping?.expired).toBe(1);
  expect(s.player.coins).toBe(b);
  expect(s.inventory[q.itemId]).toBe(q.quantity);
 });
 it('saved partial progress survives normal backup/restore and completion',()=>{
  const s=makeGame(109),q=freightOffers(s,NOW)[0];
  acceptFreight(s,q.id,NOW);addItem(s,q.itemId,q.quantity);
  deliverFreight(s,1,NOW+1000);
  const copied=deserialize(serialize(s,NOW+1200),NOW+1500);
  expect(copied.shipping?.active?.delivered).toBe(1);
  expect(copied.shipping?.active?.rewardCoins).toBe(q.rewardCoins);
  const money=copied.player.coins;
  expect(deliverFreight(copied,q.quantity-1,NOW+1800).ok).toBe(true);
  expect(copied.player.coins-money).toBe(q.rewardCoins);
 });
 it('older save without freight field remains playable; malformed cargo is discarded',()=>{
  const old=makeGame();delete old.shipping;
  const restored=deserialize(serialize(old,NOW),NOW);
  expect(freightStatus(restored,NOW).completed).toBe(0);
  expect(freightStatus(restored,NOW).active).toBe(null);
  restored.shipping={active:{id:'bad',itemId:'invalid-item',quantity:2,delivered:0,
   rewardCoins:9999,rewardXp:20,acceptedAt:NOW,expiresAt:NOW+10000},
   lastAcceptedDay:'not-a-date',completedDay:'',completed:NaN,expired:-1};
  ensureShippingState(restored);
  expect(restored.shipping?.active).toBe(null);
  expect(restored.shipping?.completed).toBe(0);
  expect(restored.shipping?.expired).toBe(0);
 });
 it('next UTC day permits a fresh shipment after one was fulfilled the previous day',()=>{
  const s=makeGame(50),q=freightOffers(s,NOW)[0];
  acceptFreight(s,q.id,NOW);addItem(s,q.itemId,q.quantity);
  deliverFreight(s,q.quantity,NOW+1000);
  const next=freightOffers(s,nextDay)[0];
  expect(acceptFreight(s,next.id,nextDay).ok).toBe(true);
  expect(freightStatus(s,nextDay).active?.id).toBe(next.id);
  expect(marketQuote(q.itemId,NOW).unitPrice).toBeGreaterThan(0);
 });
});
