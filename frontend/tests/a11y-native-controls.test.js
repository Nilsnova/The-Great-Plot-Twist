// Native browser evidence for audit helpers: no app outcomes, accounts, HTTP fixtures or custom radio navigation.
import {expect, it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate = browserHarness();

it('matches forward Tab and native Arrow selection for a checked radio group and counts its actual label target', async () => {
  await evaluate.withPage(async page => {
    await page.evaluate(async () => {
      await window.g20Import('/src/screens/market/market.css');
      const helpers = await window.g20Import('/scripts/a11y-helpers.js');
      const form = document.createElement('form'); form.id = 'native-radio-form'; form.style.width = '260px';
      form.innerHTML = '<button type="button" id="before">Before choices</button><fieldset class="market-choices">'
        + '<legend>Direction</legend><label class="market-choice"><input id="rising" type="radio" name="side"><span>Rising</span></label>'
        + '<label class="market-choice"><input id="falling" type="radio" name="side" checked><span>Falling</span></label>'
        + '</fieldset><button type="button" id="after">After choices</button>';
      document.body.append(form); window.nativeAudit = {helpers, root: form};
    });
    const stops = () => page.evaluate(() => window.nativeAudit.helpers.tabbableForAudit(window.nativeAudit.root).map(el => el.id));
    expect(await stops()).toEqual(['before', 'falling', 'after']);
    await page.locator('#before').focus(); await page.keyboard.press('Tab');
    expect(await page.locator('#falling').evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press('ArrowUp');
    expect(await page.locator('#rising').isChecked()).toBe(true); expect(await page.locator('#falling').isChecked()).toBe(false);
    expect(await stops()).toEqual(['before', 'rising', 'after']);
    await page.keyboard.press('Tab'); expect(await page.locator('#after').evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press('Shift+Tab'); expect(await page.locator('#rising').evaluate(el => el === document.activeElement)).toBe(true);
    await page.locator('#falling').check();
    const target = await page.locator('#rising').evaluate(input => {
      const label = input.labels[0], native = input.getBoundingClientRect(), rect = label.getBoundingClientRect();
      const helpers = window.nativeAudit.helpers, effective = helpers.touchRectForAudit(input);
      return {x: rect.right - 8, y: rect.top + rect.height / 2, outsideRadio: rect.right - 8 > native.right,
        genuine: label.control === input, nativeSize: [native.width, native.height],
        effective: [effective.width, effective.height], label: [rect.width, rect.height],
        nativePass: helpers.touchTargetMeetsMinimum(native), labelPass: helpers.touchTargetMeetsMinimum(effective)};
    });
    expect(target.outsideRadio).toBe(true); expect(target.genuine).toBe(true); expect(target.nativeSize).toEqual([22, 22]);
    expect(target.nativePass).toBe(false); expect(target.labelPass).toBe(true); expect(target.effective).toEqual(target.label);
    await page.mouse.click(target.x, target.y);
    expect(await page.locator('#rising').isChecked()).toBe(true); expect(await page.locator('#falling').isChecked()).toBe(false);
  });
});

it('honors actual external form ownership, disabled fieldsets, unnamed radios and negative tab buttons', async () => {
  await evaluate.withPage(async page => {
    await page.evaluate(async () => {
      const helpers = await window.g20Import('/scripts/a11y-helpers.js');
      const root = document.createElement('section');
      root.innerHTML = '<button id="first">First</button><form id="form-a">'
        + '<input aria-label="A first" id="a-first" type="radio" name="shared">'
        + '<input aria-label="A second" id="a-second" type="radio" name="shared">'
        + '<fieldset disabled><input aria-label="Disabled fieldset" id="disabled-fieldset" type="radio" name="disabled"></fieldset></form>'
        + '<input aria-label="External A choice" id="external" type="radio" name="shared" form="form-a" checked>'
        + '<form id="form-b"><input aria-label="B first" id="b-first" type="radio" name="shared">'
        + '<input aria-label="B disabled" type="radio" name="shared" disabled></form>'
        + '<input aria-label="Unnamed one" id="unnamed-one" type="radio"><input aria-label="Unnamed two" id="unnamed-two" type="radio">'
        + '<button id="selected-tab" role="tab" tabindex="0">Selected tab</button>'
        + '<button id="unselected-tab" role="tab" tabindex="-1">Unselected tab</button><button id="last">Last</button>';
      document.body.append(root); window.nativeAudit = {helpers, root};
    });
    const expected = ['first', 'external', 'b-first', 'unnamed-one', 'unnamed-two', 'selected-tab', 'last'];
    expect(await page.evaluate(() => window.nativeAudit.helpers.tabbableForAudit(window.nativeAudit.root).map(el => el.id))).toEqual(expected);
    await page.locator('#first').focus();
    for (const id of expected.slice(1)) {
      await page.keyboard.press('Tab'); expect(await page.locator('#' + id).evaluate(el => el === document.activeElement)).toBe(true);
    }
    expect(await page.locator('#disabled-fieldset').evaluate(el => !el.disabled && el.matches(':disabled'))).toBe(true);
    expect(await page.evaluate(() => {
      const {helpers, root} = window.nativeAudit;
      return {inventory: [...root.querySelectorAll('button')].map(el => el.id),
        focus: helpers.focusCandidatesForAudit(root).map(el => el.id)};
    })).toMatchObject({inventory: expect.arrayContaining(['unselected-tab']), focus: expect.not.arrayContaining(['unselected-tab'])});
  });
});

it('rejects small/inactive labels and preserves positive-index inventory with actual CSS and native associations', async () => {
  await evaluate.withPage(async page => {
    const result = await page.evaluate(async () => {
      const h = await window.g20Import('/scripts/a11y-helpers.js'), root = document.createElement('section');
      const style = document.createElement('style'); style.textContent = 'input{width:22px;height:22px;margin:0}label{display:inline-flex;align-items:center;width:180px;height:44px}.small{width:40px;height:30px}.pointer-off{pointer-events:none}';
      document.head.append(style);
      root.innerHTML = '<label class="small"><input id="small" type="radio" name="small">Small label</label>'
        + '<label class="pointer-off" for="pointer">Pointer disabled</label><input id="pointer" type="radio" name="pointer">'
        + '<label hidden for="hidden-label">Hidden label</label><input id="hidden-label" type="radio" name="hidden-label">'
        + '<label inert for="inert-label">Inert label</label><input id="inert-label" type="radio" name="inert-label">'
        + '<label for="checkbox">Native checkbox</label><input id="checkbox" type="checkbox">'
        + '<div tabindex="3" id="positive">Positive focus index</div>'
        + '<input aria-label="Positive unselected radio" id="positive-radio" type="radio" name="positive-side" tabindex="2">'
        + '<input aria-label="Checked radio" id="checked-radio" type="radio" name="positive-side" checked>';
      document.body.append(root);
      const fail = ['small', 'pointer', 'hidden-label', 'inert-label'].map(id => h.touchTargetMeetsMinimum(h.touchRectForAudit(root.querySelector('#' + id))));
      const input = root.querySelector('#checkbox'), label = input.labels[0], rect = label.getBoundingClientRect();
      window.nativeCheckbox = input;
      return {fail, checkboxPass: h.touchTargetMeetsMinimum(h.touchRectForAudit(input)),
        x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        positive: h.focusCandidatesForAudit(root).filter(el => el.tabIndex > 0).map(el => el.id),
        radioStops: h.tabbableForAudit(root).filter(el => el.name === 'positive-side').map(el => el.id)};
    });
    expect(result.fail).toEqual([false, false, false, false]); expect(result.checkboxPass).toBe(true);
    expect(result.positive).toEqual(['positive', 'positive-radio']); expect(result.radioStops).toEqual(['checked-radio']);
    await page.mouse.click(result.x, result.y);
    expect(await page.locator('#checkbox').isChecked()).toBe(true);
  });
});

it.each(['duel-choice', 'duel-option'])('finds the actual %s label ring for a transparent native input and rejects its absence', async className => {
  await evaluate.withPage(async page => {
    await page.evaluate(async className => {
      await window.g20Import('/src/screens/duels/duels.css');
      const helpers = await window.g20Import('/scripts/a11y-helpers.js');
      const before = document.createElement('button'); before.textContent = 'Before native focus'; before.id = 'before-focus';
      const label = document.createElement('label'); label.className = className;
      const input = document.createElement('input'); input.id = 'transparent-native'; input.type = 'radio'; input.name = 'native-focus';
      label.append(input, document.createTextNode('Native choice')); document.body.append(before, label);
      window.focusAudit = {helpers, label, input};
    }, className);
    await page.locator('#before-focus').focus(); await page.keyboard.press('Tab');
    const inspect = () => page.evaluate(() => {
      const {helpers, input, label} = window.focusAudit;
      return {focused: document.activeElement === input, opacity: getComputedStyle(input).opacity,
        ownOutline: getComputedStyle(input).outlineStyle, labelOutline: getComputedStyle(label).outlineStyle,
        genuine: input.labels[0] === label && label.control === input,
        passes: helpers.visibleFocusForAudit(input)};
    });
    expect(await inspect()).toMatchObject({focused: true, opacity: '0', genuine: true, labelOutline: 'solid', passes: true});
    // Negative controls remove the real stylesheet's ring, without inventing an alternate focus rule.
    await page.evaluate(() => { window.focusAudit.label.style.outlineStyle = 'none'; });
    expect((await inspect()).passes).toBe(false);
    await page.evaluate(() => { window.focusAudit.label.style.outlineStyle = ''; window.focusAudit.label.style.outlineColor = 'transparent'; });
    expect((await inspect()).passes).toBe(false);
    await page.evaluate(() => { window.focusAudit.label.style.outlineColor = ''; window.focusAudit.label.style.opacity = '0'; });
    expect((await inspect()).passes).toBe(false);
    await page.evaluate(() => { window.focusAudit.label.style.opacity = ''; }); expect((await inspect()).passes).toBe(true);
    await page.locator('#before-focus').focus(); expect((await inspect()).passes).toBe(false);
  });
});
