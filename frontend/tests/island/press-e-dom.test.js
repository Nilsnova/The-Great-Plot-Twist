// Press E in real Chromium (lane T19): the phone's Use button shows only with something in reach (and hides when the
// wave owns E), the prompt floats over the building with "E · <words>", and "Walk closer" shows next to it.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('shows the Use button only when something is in reach, and presses E with it', async () => {
  const result = await evaluate(async () => {
    const {createTouchControls} = await window.g20Import('/src/controls/touch.js');
    Object.defineProperty(navigator, 'maxTouchPoints', {value: 1});
    const presses = [];
    const controls = createTouchControls(document.body, {setVirtual() {}, press: key => presses.push(key)}, {});
    const use = () => document.querySelector('.touch-actions button');
    controls.update(null, true);
    const none = {hidden: use().hidden, disabled: use().disabled};
    controls.update('cannon_1', true, 'Upgrade Cannon');
    const near = {hidden: use().hidden, disabled: use().disabled, text: use().textContent, label: use().getAttribute('aria-label')};
    use().click();
    controls.update(null, true);
    const away = use().hidden;
    controls.dispose();
    return {none, near, presses, away};
  });
  expect(result).toEqual({none: {hidden: true, disabled: true}, near: {hidden: false, disabled: false, text: 'Use', label: 'Use: Upgrade Cannon'}, presses: ['KeyE'], away: true});
});

it('hangs the prompt over the building and says "Walk closer" next to a far click', async () => {
  const result = await evaluate(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const hud = createHud(document.body, {focus() {}, start() {}, chart() {}, quality() {}});
    const prompt = () => document.querySelector('.hud .interact'), nudge = () => document.querySelector('.hud .interact-nudge');
    hud.update('cannon_1', {interactionLabel: 'Upgrade Cannon', promptAt: {x: .4, y: .3}});
    const floating = {hidden: prompt().hidden, floating: prompt().classList.contains('floating'), left: prompt().style.left, top: prompt().style.top,
      label: prompt().getAttribute('aria-label'), text: prompt().textContent};
    hud.update('cannon_1', {interactionLabel: 'Build here'});
    const fallback = {floating: prompt().classList.contains('floating'), left: prompt().style.left};
    hud.update(null, {});
    const gone = prompt().hidden;
    hud.update(null, {hint: {text: 'Walk closer', at: {x: .5, y: .5}}});
    const hint = {hidden: nudge().hidden, text: nudge().textContent, left: nudge().style.left};
    hud.update(null, {});
    const hintGone = nudge().hidden;
    hud.dispose();
    return {floating, fallback, gone, hint, hintGone};
  });
  expect(result).toEqual({
    floating: {hidden: false, floating: true, left: '40%', top: '30%', label: 'E · Upgrade Cannon', text: 'EUpgrade Cannon'},
    fallback: {floating: false, left: ''}, gone: true,
    hint: {hidden: false, text: 'Walk closer', left: '50%'}, hintGone: true,
  });
});
