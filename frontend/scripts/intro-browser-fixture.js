// Existing graphics checks isolate the new story read using the unchanged approved intro data.
import {readFileSync} from 'node:fs';
const story=JSON.parse(readFileSync(new URL('../../backend/content/story.json',import.meta.url),'utf8'));
export async function stubIntro(page) {
  await page.route('**/api/content/intro-story',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(story)}));
}
export async function dismissIntro(page) {
  await page.waitForFunction(()=>!window.__island?.caseUi?.active||document.querySelector('.case-modal[open]'));
  for(const selector of ['.intro-modal','.case-modal','.islet-modal','.duel-modal','.desk-modal','.sports-modal']){const modal=page.locator(selector);if(await modal.isVisible()){await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});}}
}
