/**
 * Island workshop progression: farm → livestock → sea → crafted goods.
 * Each recipe is deterministic and uses only real inventory items.
 */
import type { CraftRecipeDef } from '../core/types';

export const CRAFT_RECIPES: readonly CraftRecipeDef[] = [
  {id:'roasted-carrots',output:'dish_roasted_carrots',name:{zh:'香烤胡萝卜',en:'Honey-Roasted Carrots'},unlockLevel:1,
   ingredients:{produce_carrot:3},energy:2,xp:5,food:6,recoverEnergy:1,sell:34,color:'#ee9b4c',style:'plate'},
  {id:'potato-soup',output:'dish_potato_soup',name:{zh:'海岛土豆浓汤',en:'Island Potato Soup'},unlockLevel:1,
   ingredients:{produce_potato:2,produce_carrot:1},energy:3,xp:9,food:10,recoverEnergy:2,sell:39,color:'#e8c47e',style:'bowl'},
  {id:'strawberry-jam',output:'dish_strawberry_jam',name:{zh:'草莓果酱',en:'Strawberry Preserves'},unlockLevel:2,
   ingredients:{produce_strawberry:3},energy:3,xp:12,food:8,recoverEnergy:1,sell:68,color:'#e56675',style:'jar'},
  {id:'egg-pie',output:'dish_egg_pie',name:{zh:'农场鸡蛋派',en:'Farmhouse Egg Pie'},unlockLevel:2,
   ingredients:{good_chicken:2,produce_potato:1},energy:3,xp:14,food:14,recoverEnergy:3,sell:52,color:'#e2b96d',style:'plate'},
  {id:'tropical-smoothie',output:'dish_tropical_smoothie',name:{zh:'热带果昔',en:'Tropical Smoothie'},unlockLevel:3,
   ingredients:{produce_banana:2,produce_strawberry:2},energy:4,xp:19,food:12,recoverEnergy:4,sell:104,color:'#e59d73',style:'bottle'},
  {id:'seaside-grill',output:'dish_seaside_grill',name:{zh:'海湾香煎鱼',en:'Seaside Grilled Fish'},unlockLevel:4,
   ingredients:{fish_sardine:3,produce_tomato:1},energy:4,xp:20,food:16,recoverEnergy:4,sell:62,color:'#c2a26a',style:'plate'},
  {id:'coconut-pudding',output:'dish_coconut_pudding',name:{zh:'椰乳布丁',en:'Coconut Milk Pudding'},unlockLevel:9,
   ingredients:{produce_coconut:2,good_goat:1},energy:5,xp:27,food:20,recoverEnergy:6,sell:188,color:'#f1e1b2',style:'bowl'},
  {id:'ocean-platter',output:'dish_ocean_platter',name:{zh:'海味拼盘',en:'Ocean Platter'},unlockLevel:12,
   ingredients:{fish_seabream:2,good_duck:1,produce_tomato:1},energy:5,xp:35,food:22,recoverEnergy:7,sell:148,color:'#dcab81',style:'plate'},
  {id:'truffle-rice',output:'dish_truffle_rice',name:{zh:'松露香米饭',en:'Truffle Rice'},unlockLevel:16,
   ingredients:{produce_rice:2,good_pig:1},energy:6,xp:50,food:28,recoverEnergy:9,sell:498,color:'#b6a473',style:'bowl'},
  {id:'starlight-tonic',output:'dish_starlight_tonic',name:{zh:'星光果茶',en:'Starlight Elixir'},unlockLevel:38,
   ingredients:{produce_starfruit:2,good_cow:1},energy:8,xp:110,food:42,recoverEnergy:15,sell:3100,color:'#edce6d',style:'bottle'},
] as const;

export function recipeById(id:string):CraftRecipeDef|undefined{return CRAFT_RECIPES.find(x=>x.id===id)}
export function recipeForItem(itemId:string):CraftRecipeDef|undefined{return CRAFT_RECIPES.find(x=>x.output===itemId)}
