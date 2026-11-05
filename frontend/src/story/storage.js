// Where the story engine keeps progress. A "storage" is a small object with two functions:
// read() gives the saved text (or null), write(text) saves it and says true or false.
//
// The engine never touches the browser by itself. It is handed a storage, and the default is
// memoryStorage(), so tests and the parity runner need no setup. To save in the browser, pass
// browserStorage(window.localStorage). There is no DOM code in this file.
//
// Used by: engine.js (it re-exports these names), the story tests and the parity runner.

// The name under which one save is stored. It is the same as in the solo game.
export const SAVE_KEY = 'plot-twist-save-v1';

// Keeps progress in memory only. It is gone when the page is reloaded.
export function memoryStorage() {
  let text = null;
  return {
    read: () => text,
    write(value) {
      text = value;
      return true;
    },
  };
}

// Keeps progress in a browser storage area that the caller passes in, usually window.localStorage.
// A failing read or write (private mode, storage full, no storage at all) is not an error:
// the player simply keeps playing without saving.
export function browserStorage(storageArea) {
  return {
    read() {
      try {
        return storageArea.getItem(SAVE_KEY);
      } catch {
        return null;
      }
    },
    write(text) {
      try {
        storageArea.setItem(SAVE_KEY, text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
