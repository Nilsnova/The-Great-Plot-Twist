// The sign-in session of the browser: it holds the login token, in memory only.
//
// What it is for: after the GitHub sign-in the browser has a login token. api.js reads it from
// here and puts it on every request to our own server. The sign-in screen (a later package) fills it
// with setToken(token) and empties it with clearToken(). Nothing else should ever see the token.
//
//   const stop = session.onChange(({ signedIn }) => showSignInButton(!signedIn));
//   session.setToken(token);   // after the sign-in
//   session.clearToken();      // sign out, or the server said 401
//   stop();                    // stop listening
//
// Memory only, on purpose: the token is never written to localStorage, sessionStorage, IndexedDB or a
// cookie, and never to the console. Whatever is written to the browser stays there, and the next
// person at the same computer could read it. The price is that a page reload means signing in
// again. Whether to remember the sign-in across reloads is a decision for the sign-in package
// (specs/M1-backbone.md, decision N11), not for this file.
//
// Listeners are told only { signedIn: true or false }, and never the token, so a screen cannot leak
// it by accident. They are told when the player signs in or out. A new token while the player is
// already signed in changes nothing a screen could show, so nobody is told.
//
// Used by: api.js, the sign-in screen (later) and tests/online-session.test.js.

export function createSession() {
  let token = null;
  const subscriptions = new Set();

  function tellEveryone() {
    for (const subscription of [...subscriptions]) {
      try {
        subscription.listener({ signedIn: token !== null });
      } catch {
        // A broken screen must not break signing in or out, and must not stop the other listeners.
      }
    }
  }

  return {
    getToken: () => token,
    isSignedIn: () => token !== null,

    setToken(newToken) {
      if (typeof newToken !== 'string' || newToken.trim() === '') {
        throw new TypeError('session.setToken needs the login token as text that is not empty.');
      }
      const wasSignedIn = token !== null;
      token = newToken;
      if (!wasSignedIn) tellEveryone();
    },

    clearToken() {
      if (token === null) return; // already signed out: nothing changed, so nobody is told
      token = null;
      tellEveryone();
    },

    // Returns a function that stops the listening.
    onChange(listener) {
      if (typeof listener !== 'function') throw new TypeError('session.onChange needs a function.');
      const subscription = { listener };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
  };
}

// The one session of the game. api.js uses it, and so does the sign-in screen.
export const session = createSession();
