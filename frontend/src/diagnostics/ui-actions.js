// Fixed UI action vocabulary. No labels, text input, target ids or intent arguments are stored.
export const UI_ACTIONS=Object.freeze([
  'new_game','continue','pause','resume','settings_open','credits_open','title_open','report_problem',
  'chart_open','interact','case_panel_open','pin_card','pair_cards','start_search','partner_order',
  'call_nightfall','take_post','aim_beam','settings_change','dialogue_choice','back',
]);
export const allowedUiActions=new Set(UI_ACTIONS);
const labels=new Map([
  ['New game','new_game'],['Continue','continue'],['Resume','resume'],['Settings','settings_open'],
  ['Open visual settings','settings_open'],['Credits','credits_open'],['Return to title','title_open'],
  ['Report a problem','report_problem'],['Open sea chart','chart_open'],['Chart','chart_open'],
  ['Menu','pause'],['Interact','interact'],['Pair cards','pair_cards'],['Call nightfall','call_nightfall'],
  ['Crew','case_panel_open'],['Board','case_panel_open'],['Log','case_panel_open'],['What next?','case_panel_open'],['Back','back'],
]);
const prefixes=[['pin-','pin_card'],['search-','start_search'],['send-partner-','partner_order'],['post-','take_post'],['lock-','aim_beam'],['case-nav-','case_panel_open']];
export function actionForControl({label,focus}={}){
  if(labels.has(label))return labels.get(label);
  return prefixes.find(([prefix])=>typeof focus==='string'&&focus.startsWith(prefix))?.[1]??null;
}
