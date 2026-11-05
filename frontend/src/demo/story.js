// A memory-only rehearsal of the unchanged public intro. It emits no story/reward events.
import story from './intro-story.json';
import {createIntroAdapter} from '../story/intro-adapter.js';
import {createIntroView} from '../story/intro-view.js';
import {createModal} from '../ui/kit/modal.js';
export function createDemoStory(container) {
  let adapter=createIntroAdapter(story);
  const view=createIntroView({onAction(id){adapter.perform(id);view.update(adapter.view,adapter.actions);view.focus();},onRestart(){adapter.reset();view.update(adapter.view,adapter.actions);},onClose:close});
  const modal=createModal({title:'Intro slice · local rehearsal',body:view.element,onCancel:close});modal.element.classList.add('intro-modal');
  function close(){view.pause();modal.close();}
  return {open(){adapter=createIntroAdapter(story);view.update(adapter.view,adapter.actions);modal.open(container);view.focus();},close,dispose(){close();view.dispose();modal.dispose();}};
}
