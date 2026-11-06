// Original G13 recordings. Data only: importing this never starts or fetches audio.
export const festivalSounds = [
  { id: 'loop', title: 'Festival loop', seconds: 8, loop: true,
    caption: 'A gentle, repeating lantern dance for chimes and low tones.' },
  { id: 'claim', title: 'Lantern claim', seconds: 0.9, loop: false,
    caption: 'Three rising chimes: the lantern claim is confirmed.' },
  { id: 'ring-bell', title: 'Ring bell', seconds: 1.6, loop: false,
    caption: 'One soft metal bell: the ring is ready.' },
  { id: 'timer-end', title: 'Timer end', seconds: 1.4, loop: false,
    caption: 'Four falling chimes: the festival has ended.' },
].map(sound => ({ ...sound, file: `audio/festival-${sound.id}.wav` }));
