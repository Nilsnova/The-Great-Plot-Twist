// The team boundary for the islet folder: screens never call fetch or decide rules, and the hook stays one line.
import {readFileSync, readdirSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const folder = new URL('../src/screens/islet/', import.meta.url);
const read = name => readFileSync(new URL(name, folder), 'utf8');
const names = readdirSync(folder);
const scripts = names.filter(name => name.endsWith('.js'));
const importsOf = source => [...source.matchAll(/^import .*$/gm)].map(match => match[0]);

describe('the islet folder', () => {
  it.each(scripts)('keeps %s under 150 lines and opens it with a one-line header comment', name => {
    const lines = read(name).split('\n');
    expect(lines.length).toBeLessThanOrEqual(150);
    expect(lines[0]).toMatch(/^\/\/ \S/);
  });

  it.each(scripts)('never calls fetch in %s: only the injected transport talks to the server', name => {
    expect(read(name)).not.toMatch(/\bfetch\s*\(/);
  });

  it.each(scripts)('never imports the online or net folders in %s', name => {
    expect(importsOf(read(name)).join('\n')).not.toMatch(/\/(online|net)\//);
  });

  it.each(['view.js', 'labels.js', 'action-uid.js', 'adapter.js', 'fake-transport.js', 'fake-catalogue.js', 'host.js'])(
    'keeps %s free of the DOM, so Node can run it', name => {
      expect(read(name)).not.toMatch(/\b(document|window)\./);
    },
  );

  it.each(['panel.js', 'spot-card.js'])('keeps %s away from the adapter, the fake and any transport', name => {
    expect(importsOf(read(name)).join('\n')).not.toMatch(/adapter|fake|transport|host/);
  });

  it('keeps labels.js off view.js, so the panel shares no module with the game and the title stays in budget', () => {
    expect(importsOf(read('labels.js')).join('\n')).not.toMatch(/\.\/view\.js/);
  });

  it('loads the fake only through a dev-only loader, so the production build leaves it out', () => {
    const host = read('host.js');
    expect(host).toMatch(/import\.meta\.env\.DEV \? \(\) => import\('\.\/fake-transport\.js'\) : null/);
    expect(importsOf(host).join('\n')).not.toMatch(/fake/);
  });

  it.each(names)('writes no em dash or en dash in %s', name => {
    expect(read(name)).not.toMatch(/[\u2013\u2014]/);
  });

  it('has a README that names both routes and the local flag', () => {
    const readme = read('README.md');
    expect(readme).toContain('GET /api/islet');
    expect(readme).toContain('POST /api/islet/build');
    expect(readme).toContain('?islet=local');
  });
});

describe('the hook in game.js', () => {
  const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');

  it('imports the host from the islet folder', () => {
    expect(game).toContain("import {attachIsletPanel} from './screens/islet/host.js';");
  });

  it('replaces the plot listener with the host, so dispose and the failure path still call stopPlots', () => {
    expect(game).toMatch(/const stopPlots = attachIsletPanel\(\{container, on, emit, resetInput: input\.reset, focus: \(\) => graphics\.renderer\.domElement\.focus\(\)\}\);/);
    expect(game).not.toContain("on('plot_clicked'");
    expect(game.match(/stopPlots\(\)/g)).toHaveLength(2);
  });

  it('counts the open panel as an overlay, because the shell opens Pause on Escape unless game.js says one is open', () => {
    expect(game).toMatch(/hasOverlay:\(\)=>[^,]*caseUi\.active[^,]*\|\|stopPlots\.active,/);
  });

  it('stops the gamepad from playing while the panel is open, so its dialog branch can drive the panel', () => {
    expect(game).toContain('isPlaying:()=>active&&!outsideBlocked()');
    expect(game.match(/const externalOverlay=.*$/m)?.[0]).toContain('stopPlots?.active');
  });

  it('keeps the explorer still while the panel is open, whatever pushes it', () => {
    expect(game).toContain('controller.update(delta, active && !outsideBlocked())');
    expect(game.match(/const externalOverlay=.*$/m)?.[0]).toContain('stopPlots?.active');
  });
});
