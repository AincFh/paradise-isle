/**
 * Cargo dock board embedded in the real island shop.
 *
 * Offers are quoted without changing inventory. The only cargo spending
 * happens in deliverFreight, and the board always renders current item counts
 * instead of cached/predicted amounts.
 */
import type {ActionResult,GameState} from '../../core/types';
import {acceptFreight,deliverFreight,expireFreight,freightStatus} from '../../core/shipping';
import {itemDef} from '../../core/registry';
import {fmtDuration,t,tl} from '../../i18n';
import {h,clearChildren,spriteImg} from '../dom';

export function renderFreight(
  body:HTMLElement,state:GameState,now:()=>number,dispatch:(r:ActionResult)=>void,
):void{
  const timestamp=now();
  expireFreight(state,timestamp);
  const status=freightStatus(state,timestamp);
  clearChildren(body);
  body.append(
    h('div',{class:'freight-overview'},
      h('div',{class:'freight-kicker'},t('freight.kicker')),
      h('h3',{},t('freight.title')),
      h('p',{},t('freight.intro')),
      h('div',{class:'freight-stats'},
        h('span',{},t('freight.completedCount',{n:status.completed})),
        h('span',{},t('freight.expiredCount',{n:status.expired})),
        h('span',{},t('freight.dailyNotice')),
      ),
    ),
  );
  if(status.active){
    const job=status.active,def=itemDef(job.itemId);
    const remaining=status.remaining,have=state.inventory[job.itemId]||0;
    const cargo=h('article',{class:'shop-card freight-contract freight-active','data-shipment-id':job.id},
      spriteImg('icon:'+job.itemId,'icon-lg'),
      h('div',{class:'shop-card-info'},
        h('div',{class:'freight-kicker'},t('freight.active')),
        h('div',{class:'shop-card-name'},tl(def.name)),
        h('div',{class:'shop-card-sub'},t('freight.progress',{n:job.delivered,total:job.quantity})),
        h('div',{class:'shop-card-sub'},t('freight.have',{n:have,missing:remaining})),
        h('div',{class:'shop-card-sub'},t('freight.deadline',{t:fmtDuration(status.expiresInMs)})),
        h('div',{class:'freight-progress'},h('div',{class:'freight-progress-fill',
          style:`width:${Math.round(job.delivered/job.quantity*100)}%`}))
      ),
      h('div',{class:'shop-card-buy'},
        h('strong',{},t('freight.reward',{coins:job.rewardCoins,xp:job.rewardXp})),
        h('button',{
          class:'btn btn-sm btn-primary',
          'data-freight-deliver':job.id,
          ...(status.available===0?{disabled:'disabled'}:{}),
          onclick:()=>{
            const latest=freightStatus(state,now());
            const amount=latest.available;
            if(amount<=0||latest.active?.id!==job.id)return;
            dispatch(deliverFreight(state,amount,now()));
            renderFreight(body,state,now,dispatch);
          },
        },t('freight.deliver',{n:status.available})),
      )
    );
    body.append(cargo);
    body.append(h('div',{class:'empty-note'},t('freight.partialHint')));
    return;
  }
  if(status.acceptedToday){
    body.append(h('div',{class:'empty-note freight-done','data-freight-done':'true'},
      status.completedToday?t('freight.doneToday'):t('freight.limitToday')));
    return;
  }
  const list=h('div',{class:'shop-list freight-list'});
  for(const offer of status.offers){
    const def=itemDef(offer.itemId),have=state.inventory[offer.itemId]||0;
    list.append(h('article',{class:'shop-card freight-contract','data-freight-offer':offer.id},
      spriteImg('icon:'+offer.itemId,'icon-lg'),
      h('div',{class:'shop-card-info'},
        h('div',{class:'freight-kicker'},t('freight.delivery')),
        h('div',{class:'shop-card-name'},tl(def.name)),
        h('div',{class:'shop-card-sub'},t('freight.require',{n:offer.quantity,have})),
        h('div',{class:'shop-card-sub'},t('freight.market',{n:offer.unitMarketPrice,boost:offer.premiumPercent})),
        h('div',{class:'shop-card-sub'},t('freight.timeLimit')),
      ),
      h('div',{class:'shop-card-buy'},
        h('strong',{},t('freight.reward',{coins:offer.rewardCoins,xp:offer.rewardXp})),
        h('button',{class:'btn btn-sm btn-primary','data-freight-accept':offer.id,
          onclick:()=>{dispatch(acceptFreight(state,offer.id,now()));renderFreight(body,state,now,dispatch)}
        },t('freight.accept')),
      )
    ));
  }
  body.append(list);
  body.append(h('div',{class:'empty-note'},t('freight.explain')));
}
