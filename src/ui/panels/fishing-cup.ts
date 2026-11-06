/**
 * Daily Fishing Cup board inside the original island Shop.
 * The board only observes and claims the actual catch-derived state.
 * A click here cannot invent catches, fish or points.
 */
import type {ActionResult,GameState} from '../../core/types';
import {enterFishingCup,claimFishingCup,fishingCupStatus} from '../../core/fishing-cup';
import {fmtDuration,t,tl} from '../../i18n';
import {h,clearChildren} from '../dom';

const percent=(a:number,b:number)=>Math.max(0,Math.min(100,Math.round(a/Math.max(1,b)*100)));

export function renderFishingCup(
 body:HTMLElement,state:GameState,now:()=>number,dispatch:(r:ActionResult)=>void,
):void{
 const status=fishingCupStatus(state,now());
 clearChildren(body);
 body.append(h('section',{class:'cup-overview','data-cup-board':'true'},
   h('div',{class:'cup-kicker'},t('cup.kicker')),
   h('h3',{},t('cup.title')),
   h('p',{},t('cup.intro')),
   h('div',{class:'cup-facts'},
     h('span',{},t('cup.reset',{time:fmtDuration(status.nextDayMs)})),
     h('span',{},t('cup.best',{n:status.bestDailyPoints})),
     h('span',{},t('cup.lifetime',{n:status.lifetimeMedals})),
   ),
 ));
 if(status.clockRollback){
   body.append(h('div',{class:'empty-note cup-notice'},t('cup.clockError')));
   return;
 }
 if(!status.entered){
   body.append(h('div',{class:'cup-register'},
     h('h4',{},t('cup.ready')),
     h('p',{},t('cup.joinInfo')),
     h('button',{class:'btn btn-primary','data-cup-join':'true',onclick:()=>{
       dispatch(enterFishingCup(state,now()));
       renderFishingCup(body,state,now,dispatch);
     }},t('cup.join')),
   ));
   return;
 }
 body.append(h('div',{class:'cup-scoreboard'},
   h('div',{},h('small',{},t('cup.points')),h('strong',{'data-cup-points':'true'},String(status.points))),
   h('div',{},h('small',{},t('cup.catches')),h('strong',{'data-cup-catches':'true'},String(status.catches))),
   h('div',{},h('small',{},t('cup.species')),h('strong',{'data-cup-species':'true'},String(status.speciesCount))),
 ));
 const cards=h('div',{class:'cup-medals'});
 for(const medal of status.medals){
   const claimed=medal.claimed;
   const card=h('article',{class:'cup-medal'+(claimed?' cup-medal-claimed':medal.claimable?' cup-medal-ready':''),
      'data-cup-medal':medal.id,
      'data-cup-claimable':medal.claimable?'true':'false'},
     h('div',{class:'cup-medal-head'},
       h('span',{class:'cup-medal-icon'},medal.id==='gold'?'III':medal.id==='silver'?'II':'I'),
       h('div',{},
         h('div',{class:'cup-kicker'},tl(medal.name)),
         h('h4',{},t('cup.medal.'+medal.id)),
       ),
       h('span',{class:'cup-medal-status'},claimed?t('cup.claimed'):medal.claimable?t('cup.readyClaim'):t('cup.progress')),
     ),
   );
   const tasks=[
     {name:t('cup.catches'),actual:status.catches,target:medal.catches},
     {name:t('cup.points'),actual:status.points,target:medal.score},
     {name:t('cup.species'),actual:status.speciesCount,target:medal.species},
   ];
   for(const task of tasks){
     card.append(h('div',{class:'cup-goal'},
       h('div',{class:'cup-goal-label'},
         h('span',{},task.name),
         h('strong',{},String(task.actual)+' / '+task.target)),
       h('div',{class:'cup-track',role:'progressbar','aria-label':task.name,
          'aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(percent(task.actual,task.target))},
         h('div',{class:'cup-track-fill',style:'width:'+percent(task.actual,task.target)+'%'})),
     ));
   }
   card.append(h('div',{class:'cup-medal-footer'},
     h('strong',{},t('cup.reward',{coins:medal.coins,xp:medal.xp,rep:medal.reputation})),
     h('button',{class:'btn btn-sm btn-primary','data-cup-claim':medal.id,
       ...(medal.claimable?{}:{disabled:'disabled'}),
       onclick:()=>{
         const recent=fishingCupStatus(state,now()).medals.find(x=>x.id===medal.id);
         if(!recent?.claimable)return;
         dispatch(claimFishingCup(state,medal.id,now()));
         renderFishingCup(body,state,now,dispatch);
       }},claimed?t('cup.claimed'):t('cup.claim')),
   ));
   cards.append(card);
 }
 body.append(cards,h('div',{class:'empty-note cup-note'},t('cup.rules')));
}
