// Actual-game UI helpers. No DOM clicks, forced clicks, saved-wall injection or screenshot substitution.
import assert from 'node:assert/strict';
import {join} from 'node:path';
export const builder = page => page.locator('.island-wall-builder:not([hidden])');
export const village = page => page.locator('.island-village-mode:not([hidden])');
export async function settleCards(page) {
  for (let n = 0, calm = 0; n < 100 && calm < 8; n++) {
    const skip = page.getByRole('button', {name: /^Skip all/}), got = page.getByRole('button', {name: 'Got it', exact: true});
    const narrator = page.getByRole('button', {name: 'Skip the narrator', exact: true});
    if (await skip.count()) { calm = 0; await skip.first().click(); }
    else if (await got.count()) { calm = 0; await got.first().click(); }
    else if (await page.locator('dialog[open]').count()) { calm = 0; await page.keyboard.press('Escape'); }
    else if (await narrator.isVisible()) {
      calm = 0;
      const point = await narrator.evaluate(node => {
        const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        return node.contains(document.elementFromPoint(x, y)) ? {x, y} : null;
      });
      if (point) await page.mouse.click(point.x, point.y);
    } else calm++;
    await page.waitForTimeout(100);
  }
  assert.equal(await page.locator('dialog[open]').count(), 0, 'all actual introductory dialogs closed');
}
export async function boot(page, url, reload = false) {
  if (reload) await page.reload(); else await page.goto(url);
  await page.locator('#play').click(); await page.locator('.games-card[open]').waitFor();
  if (reload) await page.locator('.games-pick[data-code="ISLE-K7Q2M"]').click();
  else await page.getByRole('button', {name: 'Create a game', exact: true}).click();
  const lobby = page.locator('.island-card-lobby[open]'); await lobby.waitFor();
  const start = lobby.getByRole('button', {name: 'Start', exact: true});
  if (await start.isVisible()) await start.click(); else await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__island?.waves && window.__island.world.current?.id === 'home_islet');
  await settleCards(page);
}
export async function manage(page) {
  await page.keyboard.press('Escape'); await page.getByRole('button', {name: 'Manage village', exact: true}).click();
  await village(page).waitFor(); await page.waitForTimeout(1300);
}
export async function openBuilder(page) {
  await village(page).getByRole('button', {name: 'Build walls', exact: true}).click();
  await page.waitForFunction(() => window.__island.island.wallBuilder.state?.phase === 'draft');
  await page.waitForTimeout(900);
}
export async function wallet(page) {
  return page.evaluate(() => {
    const i = window.__island.island.island;
    return {coins: i.coins, code: i.code, epoch: i.epoch, walls: i.spots.filter(s => s.built && s.kind === 'wall').map(({id, x, z, level}) => ({id, x, z, level}))};
  });
}
export async function groundPoint(page, [x, z], lift = 0) {
  return page.evaluate(([x, z, lift]) => {
    const g = window.__island, p = g.player.position.clone().set(x, -z * .72 + lift, 0).project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return {x: r.x + (p.x + 1) * r.width / 2, y: r.y + (1 - p.y) * r.height / 2};
  }, [x, z, lift]);
}
export async function hitButtons(locator) {
  const buttons = await locator.locator('button').evaluateAll(nodes => nodes.filter(n => !n.disabled && n.getClientRects().length).map(n => {
    const r = n.getBoundingClientRect(), style = getComputedStyle(n), range = document.createRange(); range.selectNodeContents(n);
    const text = range.getBoundingClientRect(), left = r.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      right = r.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
      top = r.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop), bottom = r.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
    return {label: n.getAttribute('aria-label') || n.textContent, visibleText: n.textContent, fontSize: style.fontSize, width: r.width, height: r.height,
      textFits: text.left >= left - .5 && text.right <= right + .5 && text.top >= top - .5 && text.bottom <= bottom + .5,
      scrollWidth: n.scrollWidth, clientWidth: n.clientWidth,
      hit: n.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))};
  }));
  assert.ok(buttons.length > 0 && buttons.every(b => b.width >= 44 && b.height >= 44), 'visible enabled controls have 44px targets');
  assert.ok(buttons.every(b => b.hit), 'visible enabled control centers are unobscured in the actual game');
  for (const b of buttons) assert.ok(b.textFits && b.scrollWidth <= b.clientWidth, `visible label fits actual padded control: ${b.visibleText}`);
  return buttons;
}
export async function workspaceBounds(page, selector) {
  return page.evaluate(async selector => {
    const g = window.__island, {cliffProfile} = await import('/src/art/coast-cliffs.js'), {surfaces} = await import('/src/world/places/surfaces.js');
    const canvas = g.renderer.domElement.getBoundingClientRect(), bar = document.querySelector(selector).getBoundingClientRect();
    const ys = cliffProfile(surfaces.home_islet).map(p => {
      const v = g.player.position.clone().set(p.x, -p.y, 0).project(g.camera); return canvas.y + (1 - v.y) * canvas.height / 2;
    });
    return {canonicalLandTop: Math.min(...ys), canonicalLandBottom: Math.max(...ys), barTop: bar.top, barHeight: bar.height, barBottom: bar.bottom};
  }, selector);
}
export async function capture(page, out, name) {
  const before = await page.evaluate(() => ({...window.__island.renderer.userData}));
  await page.evaluate(() => { const g = window.__island; g.quality('low'); g.quality('high'); });
  await page.waitForTimeout(80);
  const state = await page.evaluate(() => {
    const g = window.__island; return {camera: g.camera.position.toArray(), zoom: g.camera.zoom, captain: g.player.position.toArray(),
      contextLost: g.renderer.getContext().isContextLost(), drawCalls: g.renderer.info.render.calls, rendering: {...g.renderer.userData},
      pixelRatio: g.renderer.getPixelRatio(), drawingSize: [g.renderer.domElement.width, g.renderer.domElement.height], memory: {...g.renderer.info.memory},
      worldLinks: g.world.current.group.getObjectByName('island-wall-connections')?.wallLinks?.length ?? g.world.current.group.getObjectByName('island-wall-connections')?.children.length ?? 0,
      worldWallDrawMeshes: g.world.current.group.getObjectByName('island-wall-connections')?.children.length ?? 0};
  });
  assert.equal(state.contextLost, false); assert.ok(state.drawCalls > 0);
  await page.screenshot({path: join(out, name)}); return {name, qualityBefore: before, ...state};
}
