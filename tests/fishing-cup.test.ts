import {describe,expect,it} from 'vitest';
import {makeGame,NOW,seedRng} from './helpers';
import {resolveCatch} from '../src/core/fishing';
import {addItem} from '../src/core/player';
import {allFish,fishDef} from '../src/core/registry';
import {serialize,deserialize} from '../src/save/save';
import {tickWorld} from '../src/core/state';
import type {FishingCupState} from '../src/core/types';
import {
  emptyFishingCup,ensureFishingCup,enterFishingCup,recordFishingCupCatch,
  fishingCupStatus,claimFishingCup,syncFishingCupDay,FISHING_CUP_MEDALS,
  FISHING_CUP_POINTS,FISHING_CUP_PERFECT_BONUS,
} from '../src/core/fishing-cup';

const DAY=86_400_000;
const joined=()=>{const s=makeGame();expect(enterFishingCup(s,NOW).ok).toBe(true);return s};

describe('Harbor Fishing Cup: genuinely landed catches, daily prizes and restore',()=>{
  it('new game shows all three medals but pays nothing before registration',()=>{
    const s=makeGame(),balance=s.player.coins;
    const board=fishingCupStatus(s,NOW);
    expect(board.entered).toBe(false);
    expect(board.points).toBe(0);
    expect(board.catches).toBe(0);
    expect(board.medals).toHaveLength(3);
    expect(board.medals.every(m=>!m.earned&&!m.claimable)).toBe(true);
    expect(claimFishingCup(s,'bronze',NOW).ok).toBe(false);
    expect(s.player.coins).toBe(balance);
    expect(s.fishingCup).toEqual({...emptyFishingCup(),day:board.day});
  });
  it('registration is free and can only happen once in a UTC day',()=>{
    const s=makeGame(),before=s.player.coins;
    expect(enterFishingCup(s,NOW).ok).toBe(true);
    expect(s.player.coins).toBe(before);
    const snapshot=JSON.stringify(s);
    expect(enterFishingCup(s,NOW+3000).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(fishingCupStatus(s,NOW).entered).toBe(true);
  });
  it('adding already-caught fish to inventory or merely opening the board earns no points',()=>{
    const s=joined();
    addItem(s,'fish_sardine',200);
    for(let i=0;i<20;i++)fishingCupStatus(s,NOW+1000);
    expect(fishingCupStatus(s,NOW).points).toBe(0);
    expect(fishingCupStatus(s,NOW).catches).toBe(0);
  });
  it('actual failed reel adds no points, a successful catch adds fish, XP and real competition score',()=>{
    const s=joined();seedRng(18);
    const balance=s.player.coins,initialXp=s.player.xp;
    expect(resolveCatch(s,.2,NOW).catch?.fish).toBe(null);
    expect(fishingCupStatus(s,NOW).points).toBe(0);
    const result=resolveCatch(s,.9,NOW+1000);
    expect(result.catch?.fish).toBeTruthy();
    const fish=result.catch!.fish!;
    expect(s.inventory[fish.id]).toBe(1);
    expect(s.collections.fish[fish.id]).toBe(1);
    expect(result.events?.some(e=>e.type==='fishCatch'&&e.data===fish.id)).toBe(true);
    const cup=fishingCupStatus(s,NOW+1000);
    expect(cup.catches).toBe(1);
    expect(cup.speciesCount).toBe(1);
    expect(cup.points).toBe(FISHING_CUP_POINTS[fish.rarity]+6+FISHING_CUP_PERFECT_BONUS);
    expect(s.player.xp).toBeGreaterThan(initialXp);
    expect(s.player.coins).toBe(balance);
  });
  it('real catches before joining do not count retroactively',()=>{
    const s=makeGame();seedRng(44);
    expect(resolveCatch(s,.96,NOW).catch?.fish).toBeTruthy();
    expect(enterFishingCup(s,NOW+500).ok).toBe(true);
    expect(fishingCupStatus(s,NOW+500).catches).toBe(0);
    expect(fishingCupStatus(s,NOW+500).points).toBe(0);
  });
  it('three successful real reels earn bronze, but an explicit claim is required',()=>{
    const s=joined();seedRng(44);
    for(let i=0;i<3;i++)expect(resolveCatch(s,.92,NOW+1000*i).catch?.fish).toBeTruthy();
    const board=fishingCupStatus(s,NOW+5000),bronze=board.medals[0];
    expect(board.catches).toBe(3);
    expect(board.points).toBeGreaterThanOrEqual(30);
    expect(bronze.earned).toBe(true);
    expect(bronze.claimable).toBe(true);
    const money=s.player.coins,rep=s.player.reputation;
    expect(claimFishingCup(s,'bronze',NOW+5000).ok).toBe(true);
    expect(s.player.coins).toBe(money+FISHING_CUP_MEDALS[0].coins);
    expect(s.player.reputation).toBe(rep+FISHING_CUP_MEDALS[0].reputation);
    expect(fishingCupStatus(s,NOW+6000).medals[0].claimed).toBe(true);
    const already=JSON.stringify(s);
    expect(claimFishingCup(s,'bronze',NOW+7000).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(already);
  });
  it('all three tier rewards are independently earned and one-time (no second claim or invalid ID)',()=>{
    const s=joined();
    s.player.rodTier=3;
    const sequence=['fish_sardine','fish_seabream','fish_grouper','fish_marlin','fish_sardine',
      'fish_seabream','fish_grouper','fish_marlin','fish_sardine','fish_grouper'];
    for(const [i,id] of sequence.entries())
      expect(recordFishingCupCatch(s,fishDef(id),.9,NOW+i*1000)).toBeGreaterThan(0);
    const board=fishingCupStatus(s,NOW+15000);
    expect(board.catches).toBe(10);
    expect(board.speciesCount).toBe(4);
    expect(board.medals.every(m=>m.claimable)).toBe(true);
    const coins=s.player.coins;
    for(const m of FISHING_CUP_MEDALS)expect(claimFishingCup(s,m.id,NOW+20000).ok).toBe(true);
    expect(s.player.coins).toBe(coins+FISHING_CUP_MEDALS.reduce((x,m)=>x+m.coins,0));
    expect(fishingCupStatus(s,NOW+20000).lifetimeMedals).toBe(3);
    const frozen=JSON.stringify(s);
    for(const m of FISHING_CUP_MEDALS)expect(claimFishingCup(s,m.id,NOW+21000).ok).toBe(false);
    expect(claimFishingCup(s,'diamond',NOW+21000).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(frozen);
  });
  it('quality and rarity have measurable score differences, no points from invalid catches',()=>{
    const s=joined(),f=allFish().find(x=>x.rarity==='common')!,legend=allFish().find(x=>x.rarity==='legendary')!;
    expect(recordFishingCupCatch(s,f,.4,NOW)).toBe(0);
    expect(recordFishingCupCatch(s,f,NaN,NOW)).toBe(0);
    expect(recordFishingCupCatch(s,f,1.1,NOW)).toBe(0);
    expect(recordFishingCupCatch(s,f,.6,NOW)).toBe(16);
    expect(recordFishingCupCatch(s,f,.9,NOW)).toBe(18);
    expect(recordFishingCupCatch(s,legend,.91,NOW)).toBe(374);
  });
  it('crossing the next UTC day clears daily catches/claims but preserves cumulative awards and best score',()=>{
    const s=joined(),fish=fishDef('fish_sardine');
    for(let i=0;i<3;i++)recordFishingCupCatch(s,fish,.95,NOW+i*1000);
    expect(claimFishingCup(s,'bronze',NOW+5000).ok).toBe(true);
    const best=fishingCupStatus(s,NOW+6000).bestDailyPoints;
    tickWorld(s,NOW+DAY);
    const next=fishingCupStatus(s,NOW+DAY);
    expect(next.entered).toBe(false);
    expect(next.points).toBe(0);expect(next.catches).toBe(0);
    expect(next.claimed).toEqual([]);
    expect(next.lifetimeMedals).toBe(1);
    expect(next.bestDailyPoints).toBe(best);
    expect(enterFishingCup(s,NOW+DAY).ok).toBe(true);
    expect(fishingCupStatus(s,NOW+DAY).entered).toBe(true);
  });
  it('backwards device clock cannot be used to roll the tournament back',()=>{
    const s=joined();
    recordFishingCupCatch(s,fishDef('fish_sardine'),.9,NOW);
    const previous=JSON.stringify(s);
    expect(syncFishingCupDay(s,NOW-DAY)).toBe(false);
    expect(fishingCupStatus(s,NOW-DAY).clockRollback).toBe(true);
    expect(enterFishingCup(s,NOW-DAY).ok).toBe(false);
    expect(claimFishingCup(s,'bronze',NOW-DAY).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(previous);
  });
  it('a saved in-progress cup restores exactly, and duplicate prize claims remain blocked',()=>{
    const s=joined(),fish=fishDef('fish_sardine');
    for(let i=0;i<3;i++)recordFishingCupCatch(s,fish,.95,NOW+i*1000);
    const balance=s.player.coins;
    expect(claimFishingCup(s,'bronze',NOW+5000).ok).toBe(true);
    const restored=deserialize(serialize(s,NOW+6000),NOW+7000);
    const status=fishingCupStatus(restored,NOW+7000);
    expect(status.points).toBe(fishingCupStatus(s,NOW+7000).points);
    expect(status.catches).toBe(3);expect(status.claimed).toEqual(['bronze']);
    expect(restored.player.coins).toBe(balance+90);
    expect(claimFishingCup(restored,'bronze',NOW+8000).ok).toBe(false);
    expect(restored.player.coins).toBe(balance+90);
  });
  it('legacy slots and tampered/non-finite cup data are normalized safely',()=>{
    const old=makeGame();delete old.fishingCup;
    const restored=deserialize(serialize(old,NOW),NOW);
    expect(restored.fishingCup).toEqual(emptyFishingCup());
    restored.fishingCup={
      day:'2031-02-31',entered:true,catches:NaN,points:-10,
      species:{fish_sardine:Infinity,unknown:200},
      claimed:['bronze','bronze','gold'] as FishingCupState['claimed'],
      bestDailyPoints:Infinity,lifetimeMedals:-1,
    };
    ensureFishingCup(restored);
    expect(restored.fishingCup).toEqual(emptyFishingCup());
    expect(fishingCupStatus(restored,NOW).clockRollback).toBe(false);
    expect(enterFishingCup(restored,NOW).ok).toBe(true);
  });
});
