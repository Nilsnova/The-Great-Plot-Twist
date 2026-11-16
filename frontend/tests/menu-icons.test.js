// The pause menu shows one icon per button, and the button's text and screen-reader name stay the label.
import {expect,it} from 'vitest';
import {menuIcon} from '../src/shell/menu-icons.js';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('gives every pause-menu entry an icon, also labels with extra words',()=>{
  for(const label of ['Resume','Players and invite','Leave this game','Leaderboard','Crew','Captain and skills','Sea chart',
    'Controls','How to play','Harbor','Join the class harbor','Settings','Return to title'])expect(menuIcon(label),label).not.toBe('');
  expect(menuIcon('Captains here (3)')).toBe(menuIcon('Captains here'));
  expect(menuIcon('Projector: Join the harbor (J)')).toBe('📽️');
});

it('gives no icon to unknown labels or a near miss, and never throws',()=>{
  expect(menuIcon('Something new')).toBe('');
  expect(menuIcon('Crewmate')).toBe('');
  expect(menuIcon('')).toBe('');
  expect(menuIcon(undefined)).toBe('');
});

it('draws the icon in the real pause menu but keeps the button names unchanged',async()=>{
  await evaluate.withPage(async page=>{
    const result=await page.evaluate(async()=>{
      for(const sheet of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/shell.css'])await window.g20Import(sheet);
      const {fillPauseMenu}=await window.g20Import('/src/shell/pause.js');
      const screen=document.createElement('div');screen.className='shell-screen';screen.dataset.mode='pause';
      const nav=document.createElement('nav');nav.className='shell-menu';screen.append(nav);document.body.append(screen);
      fillPauseMenu(nav,{play(){},page(){},show(){}});
      return [...nav.querySelectorAll('button')].map(button=>({text:button.textContent,icon:button.dataset.icon,
        before:getComputedStyle(button,'::before').content}));
    });
    expect(result.map(entry=>entry.text)).toEqual(['Resume','Settings','Return to title']);
    for(const entry of result){expect(entry.icon).toBeTruthy();expect(entry.before).toContain(entry.icon);}
  });
});
