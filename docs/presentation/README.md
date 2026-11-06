# G25 · Class presentation

A ten-slide, spoiler-free engineering talk for Introduction to Programming.
Speaking allocation: **10 minutes 45 seconds**, excluding the separate G11 live
demo and questions. No student numbers, remote images, libraries or fonts.

## Open and present

Open `index.html` directly in a desktop browser. The deck is designed to work from
the filesystem without a server, installation or internet connection.

- Next: right/down arrow, Page Down, Space, Enter, click the slide, or the → button.
- Previous: left/up arrow, Page Up, or the ← button. Home/End jump to first/last.
- Open **Speaker notes** for a second window: keep the audience window on the
  projector and the notes window on the presenter's display. Either window can
  navigate the pair. Moving to another slide does not reset the rehearsal clock.
- If popups are blocked, allow this local page to open the notes window. Opening
  `index.html?view=notes` separately gives standalone notes without pairing.
- Start/Pause/Reset the rehearsal timer in the notes view. Timing allocations and
  the next slide appear there. The timer belongs to that notes window only.
- Slide fragments such as `index.html#slide-7` can be bookmarked. No local storage,
  cookies or saved login is required. With JavaScript off, all slides remain
  readable and printable; notes remain available in `outline.md`.

Use the operating system's projector/extended-display controls as appropriate.
No live-demo walkthrough is included: G11 owns that script.

The [rehearsal table](rehearsal.md) allocates all ten slides and explains the
handoff. [Download/open the audience PDF](The-Great-Plot-Twist.pdf) for a static
fallback. Print / PDF exports every slide, regardless of the currently active
slide; speaker notes and controls are excluded. Export settings and the automated
reproduction command are in the rehearsal guide.

## Sources and scope

[Outline and speaker notes](outline.md) records C1's narrative.
[Sources](sources.md) pins architecture and test claims to main `60f7fd0`.
Realtime is built with its flag off and game hookup pending; account UI is built
but real transport integration remains. Sitewide security headers are configured,
with deployed behavior still to verify. The requested `frontend/HOW-IT-WORKS.md`
was added by the C3 main merge and read before the final content refresh.

All artwork is original local SVG. The page's restrictive CSP uses external
`deck.js` and `deck.css`, permits local images, and blocks network connections and
inline script/style. There is no service worker, module loading or network API.

## Browser checks

The optional checker uses the repository's already-installed `playwright-core`
development dependency and an installed Chromium. It does not add dependencies.
From the repository root:

```sh
node docs/presentation/check-deck.cjs
```

Set `CHROME_PATH` if Chromium is not at `/usr/bin/chromium`. Screenshots, a PDF and
a JSON result go to a fresh `/tmp/g25-checks-…` directory. `G25_ARTIFACTS` overrides
that location; `G25_PDF` overrides the PDF path. Keep temporary output outside the
repository. Browser checks run with an offline context; every requested deck asset
is fulfilled from local disk, and any other request is rejected. No HTTP server
is started or contacted. This transport lets managed browsers validate the deck
without changing their URL policies.

For a direct filesystem check in a browser that permits local file navigation:

```sh
G25_FILE_MODE=1 node docs/presentation/check-deck.cjs
```

**Environment limitation:** this cloud image's managed Chromium blocks `file:`
navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Its global policies were not
changed. The disk-intercepted offline check validates rendering, CSP, controls,
paired/standalone notes and printing, but does not substitute for opening the
actual file on the presentation laptop. Keep that direct-file gate marked unrun
until it is checked there. Refresh source claims and test counts if main changes.
