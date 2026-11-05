// The text helpers write to the page only when the words changed, so a live region is not read out twice.
import {describe, expect, it} from 'vitest';
import {setText, showText} from '../src/screens/islet/set-text.js';

// A stand-in for a page element that counts how often its text was written.
function fakeElement(text = '') {
  const element = {writes: 0, hidden: false, value: text};
  Object.defineProperty(element, 'textContent', {
    get: () => element.value,
    set: next => { element.value = next; element.writes += 1; },
  });
  return element;
}

describe('setText', () => {
  it('writes new text', () => {
    const element = fakeElement('old');
    setText(element, 'new');
    expect(element.textContent).toBe('new');
    expect(element.writes).toBe(1);
  });

  it('does not write the same text again', () => {
    const element = fakeElement('same');
    setText(element, 'same');
    expect(element.writes).toBe(0);
  });

  it('turns null and undefined into empty text', () => {
    const element = fakeElement('something');
    setText(element, null);
    expect(element.textContent).toBe('');
    setText(element, undefined);
    expect(element.writes).toBe(1);
  });

  it('leaves the hidden flag alone', () => {
    const element = fakeElement();
    setText(element, '');
    expect(element.hidden).toBe(false);
  });
});

describe('showText', () => {
  it('shows an element that has text', () => {
    const element = fakeElement();
    element.hidden = true;
    showText(element, 'Cost: 300 coins');
    expect(element.hidden).toBe(false);
    expect(element.textContent).toBe('Cost: 300 coins');
  });

  it('hides an element that has no text', () => {
    const element = fakeElement('before');
    showText(element, null);
    expect(element.hidden).toBe(true);
    expect(element.textContent).toBe('');
  });

  it('does not write the same text again', () => {
    const element = fakeElement('same');
    showText(element, 'same');
    expect(element.writes).toBe(0);
  });
});
