import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createIntroView } from '../src/story/intro-view.js';

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.className = '';
    this.classList = { add: name => { this.className = `${this.className} ${name}`.trim(); } };
  }
  append(...items) { for (const item of items) { this.removeFromParent(item); this.children.push(item); item.parentElement = this; } }
  prepend(...items) { for (const item of items.reverse()) { this.removeFromParent(item); this.children.unshift(item); item.parentElement = this; } }
  insertBefore(item, reference) { this.removeFromParent(item); const index = this.children.indexOf(reference); this.children.splice(index < 0 ? this.children.length : index, 0, item); item.parentElement = this; }
  replaceChildren(...items) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...items); }
  removeFromParent(item) { if (item.parentElement) item.parentElement.children = item.parentElement.children.filter(child => child !== item); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  removeEventListener(name) { delete this.listeners[name]; }
  contains() { return false; }
  focus() { globalThis.document.activeElement = this; }
  remove() { this.removed = true; }
}

function find(root, className) {
  if (root.className?.split(' ').includes(className)) return root;
  for (const child of root.children ?? []) {
    const found = find(child, className);
    if (found) return found;
  }
  return null;
}

function findExactClass(root, className) {
  if (root.className === className) return root;
  for (const child of root.children ?? []) {
    const found = findExactClass(child, className);
    if (found) return found;
  }
  return null;
}

const originalGlobals = {};
afterEach(() => {
  for (const [name, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
  for (const name of Object.keys(originalGlobals)) delete originalGlobals[name];
});

function installDom() {
  for (const name of ['document', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    originalGlobals[name] = globalThis[name];
  }
  globalThis.Node = ElementStub;
  globalThis.document = { activeElement: null, createElement: tag => new ElementStub(tag) };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
}

describe('G8 safe ending presentation', () => {
  it('places ending notes inside the ending card with its arrival content', () => {
    installDom();
    const view = createIntroView({ onAction: () => {}, onRestart: () => {}, onClose: () => {} });
    const notes = ['Your choice decides whether help arrives.', 'Plot twist: the trusted fisherman is the threat.'];
    view.update({
      scene: 'ending_trapped', title: 'Ending: Locked In the Light', text: 'The tower door closes.',
      ended: true, notes, choices: [], inventory: [], history: [], message: '',
    }, [], undefined);

    const ending = find(view.element, 'intro-ending');
    const endingNotes = find(ending, 'intro-ending-notes');
    const endingBody = ending.children.find(child => child.className === 'kit-panel-body');
    const endingSummary = find(ending, 'intro-ending-summary');
    const sceneNotes = findExactClass(view.element, 'intro-notes');
    expect(endingNotes.hidden).toBe(false);
    expect(endingNotes.children.map(note => note.textContent)).toEqual(notes);
    expect(endingSummary.parentElement).toBe(endingBody);
    expect(sceneNotes.hidden).toBe(true);

    const arrival = new ElementStub('section');
    arrival.className = 'arrival-card';
    view.setArrival(arrival);
    expect(arrival.parentElement.className).toContain('intro-arrival-slot');
    expect(endingSummary.children[0].textContent).toBe('The tower door closes.');
    expect(endingNotes.parentElement).toBe(endingSummary);
    expect(endingSummary.parentElement).toBe(arrival);
    expect(endingSummary.children[0].hidden).toBe(false);
    view.setArrival(null);
    expect(endingSummary.parentElement).toBe(endingBody);
    view.dispose();
  });

  it('keeps ordinary scene notes below the dialogue rather than in the hidden ending card', () => {
    installDom();
    const view = createIntroView({ onAction: () => {}, onRestart: () => {}, onClose: () => {} });
    view.update({ scene: 'shore', title: 'The Shore', text: 'The tide is low.', ended: false,
      notes: ['A note for this scene.'], choices: [], inventory: [], history: [], message: '' }, [], undefined);
    expect(findExactClass(view.element, 'intro-notes').hidden).toBe(false);
    expect(find(view.element, 'intro-ending-notes').hidden).toBe(true);
    view.dispose();
  });

  it('uses only a same-origin stylesheet in the sign-in check page', async () => {
    const html = await readFile(new URL('../public/auth-check.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/auth-check.css', import.meta.url), 'utf8');
    expect(html).not.toMatch(/<style\b|\sstyle=/i);
    expect(html).toContain('style-src \'self\'');
    expect(html).toContain('<link rel="stylesheet" href="auth-check.css"');
    expect(css).toContain('.button:focus-visible');
  });

  it('positions chart destinations with DOM styles rather than inline HTML attributes', async () => {
    const source = await readFile(new URL('../src/ui/chart.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/<button[^>]+\sstyle=/i);
    expect(source).toContain("button.style.left =");
    expect(source).toContain("button.style.top =");
  });
});
