// Convenience-only local move storage. The server must replay actions before trusting an ending.
export const INTRO_JOURNAL_KEY='plot_twist_intro_moves_v1';
export function introJournal() {
  return {read(){try{return window.localStorage.getItem(INTRO_JOURNAL_KEY);}catch{return null;}},
    write(value){try{window.localStorage.setItem(INTRO_JOURNAL_KEY,value);}catch{/* Keep playing without local storage. */}}};
}
