// The class demo's quest strip: the shared HUD strip (src/ui/quest-strip.js) fed with the three class
// goals. update(state) takes the done state from quests.js.
import {createQuestStrip as createStrip} from '../ui/quest-strip.js';
import {classQuestView} from './quests.js';

export function createQuestStrip({parent, focusGame}) {
  const strip = createStrip({parent, focusGame});
  return {element: strip.element, update: state => strip.render(classQuestView(state)),
    set hidden(value) { strip.hidden = value; }, closeHint: () => strip.closeHint(), dispose: () => strip.dispose()};
}
