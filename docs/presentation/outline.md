# G25 · The Great Plot Twist

Class presentation for Introduction to Programming. Responsible teammate: Nils.
Branch: `docs/g25-deck`. Source baseline: `origin/main` at `60f7fd0` (6 November 2026).
This is a 10:45 explanation of the engineering, separate from G11's live-demo script.
No case solution, identities, hidden clues or student numbers belong in the deck.

## 1 · A text mystery becomes a shared world · 0:45

**On screen:** The problem: turn a text adventure into a browser experience that is
easy to enter, readable on student laptops and safe to play together. The game:
explore an island world, investigate and make choices. Original pixel art; Python rules.

**Speaker notes:** Our starting point was a text mystery called Plot Twist. The
programming challenge was to turn that into a world people could explore, while
keeping the story and the rules understandable. We chose a browser so classmates
would not need to install a game. Original pixel art gives the world a consistent
look, and the important choices still have to work as clear text. This talk is
about the decisions behind that experience. The live demo is a separate piece:
it will show what playing feels like. Here we explain what makes those moments
possible, which parts we have tested, and where the implementation still has gaps.
We will keep the mystery itself unspoiled.

## 2 · Explore. Investigate. Decide. · 0:55

**On screen:** A loop of travel, interaction, choices and progress. Current:
walking, chart travel, original intro, local save. Target: a connected crew case
with a play-money economy; connected screens remain integration work.

**Speaker notes:** Think of the player loop as four verbs. Explore a place, notice
something worth investigating, make a choice, and carry that progress into the
next visit. The chart makes travel part of that loop instead of a list of menus.
The intro already supports choices and a journal saved in the same browser.
Keyboard, touch, preferences and reduced motion help different players use the
same world. The larger design adds crews, shared progress and play-money systems.
Those are goals supported by backend work, not a claim that every screen is
connected today. Some case screens still use a development stand-in or an
unavailable adapter. Keeping that distinction visible helps us test a real feature
rather than mistake a convincing mock-up for a finished system.

## 3 · Three parts, one trust boundary · 1:20

**On screen:** Original architecture diagram: browser; Vercel static frontend and
FastAPI in Dublin; Supabase Auth and Postgres with grants/RLS in Ireland. Dashed
Realtime connection labelled built, flag off, game hookup pending.

**Speaker notes:** The browser runs plain JavaScript and uses Three.js to draw the
world. Vite builds those files for the frontend service. On Vercel the game and the
API share one address: requests starting with slash api go to the Python service,
and other addresses go to the frontend. The configuration places the FastAPI
functions in Dublin, close to the Supabase project in Ireland. Supabase provides
GitHub sign-in and a Postgres database. Its grants control which operations a role
may use; row-level security controls which rows that role may see. The browser
can make permitted reads, but game writes go through the server. Realtime support is built, but its feature flag is off and the game does not
start it yet. The dashed connection marks that remaining integration.
The key design decision is the boundary: changing JavaScript in a browser must
never let a player decide their own balance or progress.

## 4 · Follow one request · 1:15

**On screen:** One original sequence diagram for the implemented captain-name
reroll API: browser → Vercel → FastAPI → Supabase Auth/database → JSON reply.
Same action identifier twice → 409, no second reroll. API example; account UI is built; real transport integration remains.

**Speaker notes:** This example changes a generated captain name, so it explains a
write without revealing anything about the case. The API already exists, while
account screens are now built but real transport integration remains. A browser sends its sign-in
token and one action identifier. Vercel routes the request to FastAPI. The server
verifies the player through Supabase Auth and validates the body with Pydantic.
It chooses a generated name rather than trusting a name or player identifier
supplied by the browser. A database function locks the profile, checks the one
allowed reroll, and records the action. The result comes back as JSON. If a network
retry sends the same action again, the database returns already applied and the
API answers 409. The important result is that a retry cannot spend the one reroll
twice. Failure and repetition are part of the contract.

## 5 · The server decides. The database guards. · 1:10

**On screen:** Verified identity → validated intent → Python rules → atomic write.
Two database locks: grants and RLS. Unique action references prevent repeated effects.

**Speaker notes:** A browser is a presentation layer, not an authority. Our server
gets the player identity from verified sign-in, checks the input and applies the
rules. The database provides another layer of protection. A grant answers whether
a role may use a table at all. Row-level security then answers which rows it may
access. The server's privileged database key bypasses RLS, so server-side
authorization still matters; RLS is not a substitute for it. Database functions
and constraints also protect invariants such as a balance never going below zero.
For actions that must happen once, a stable reference identifies the action.
Retries keep that reference instead of creating a new one. Our tests check repeat
requests and refused actions as well as success. This is how a small set of
explicit rules can protect several different game features.

## 6 · Protect the story and the browser · 0:55

**On screen:** Server-only case data; built-text spoiler fingerprint guard;
private/no-store account replies; current sign-in-page CSP. Sitewide security headers are configured; deployed behavior still needs checking.
This offline deck has its own CSP.

**Speaker notes:** A mystery also has an information boundary. Secret case content
belongs on the server, not in a JavaScript bundle where anyone could read it.
The production build checks protected reveal fingerprints and elimination data
in built files, and checks that its fingerprints remain current. These are useful
checks; they do not prove that every possible spoiler is absent. The browser boundary needs care too. Account
replies use private, no-store caching, and the separate sign-in check page has a
Content Security Policy. The current Vercel configuration also sets sitewide CSP, framing protection,
nosniff, referrer and permissions policies. That configuration is source evidence;
we still need live checks to prove the deployed responses carry the intended headers.
This offline deck has its own restrictive policy and no network dependencies.
The general lesson is to name a protection precisely, test its scope, and avoid
turning one successful check into a claim about the whole application.

## 7 · 7,294 tests, with a clear limit · 1:10

**On screen:** 6,408 Python tests + 886 JavaScript tests in 72 files; Ruff and build
passed; 99 built text files and 12 protected lines checked. Examples: duplicate actions, stale saves,
Python/JavaScript story parity. Counts include parameterized cases and are not complete player journeys.

**Speaker notes:** We reran the test suites on the main commit shown on the slide.
The backend passed six thousand four hundred and eight tests. The frontend passed eight
hundred and eighty-six tests across seventy-two files. Ruff and the production
build also passed, and the spoiler guard examined ninety-nine built text files.
Large counts need context: these are test cases, many parameterized, rather than
thousands of complete player journeys. Useful examples are refusing a repeated
wallet reference, rejecting a stale save without changing data, and keeping the
Python and JavaScript story engines consistent. Most service tests use controlled
fake responses so they can exercise errors reliably. They do not prove live
Supabase permissions, every browser path, or production hosting. Those need
separate checks. We value the behaviors these tests protect more than the count.

## 8 · AI accelerated the work. Gates controlled integration. · 1:15

**On screen:** Human scope → bounded agent task → tests/build/scan → independent
agent review → Claude integration. D015 owner authorization; database work adds
Opus review and live checks. Nils reviews at the end or ad hoc. Teammates' own PRs
keep human peer review.

**Speaker notes:** We used coding agents to implement bounded tasks and independent
agents to review the result. That made explicit scope important: a task names its
goal, affected area and acceptance checks, so parallel agents do not silently
rewrite each other's contracts. D015 records an owner-authorized integration rule,
extended on the sixth of November. Claude integrates Claude and Codex packages
after tests, style, build, a secret scan and independent agent review. Database
changes add Opus review and a live database check. Nils reviews the work at the end
or whenever he chooses. Teammates' own contributions still follow human peer
review. This is a specific team decision, not a general recommendation to let
agents merge anything automatically. Human ownership
and evidence remain part of the process even when an agent writes the code.

## 9 · Three lessons we can explain · 1:15

**On screen:** Put rules behind a boundary. Design for retries and failures.
Make agent tasks small enough to review. Each lesson includes one concrete example.

**Speaker notes:** First, decide where a rule belongs before building its screen.
We can redraw a wallet widget without changing who is allowed to move coins,
because that rule belongs behind the API and in the database. Second, design for
the second request, not just the first one. A timeout does not tell us whether a
write happened. Stable action references and explicit errors make recovery a
defined behavior rather than a guess. The same thinking gives outside-data
adapters a timeout, a cache and a recorded fallback. Third, agent work needs small,
reviewable contracts. A passing test cannot tell us that a feature was the right
one to build, and a polished screen may still use a stand-in. Clear task boundaries,
independent review and honest status labels help us connect useful pieces without
losing our understanding of the program.

## 10 · Next: connect, verify, rehearse · 0:45

**On screen:** Connect real crew/account flows and hook up the built Realtime support; verify
live RLS, concurrency and configured headers; rehearse with the G11 script. Handoff: the demo
shows the experience, this deck explains the decisions. No demo walkthrough.

**Speaker notes:** The next step is integration, not simply adding more screens.
We need connected account and crew flows, the game hookup for the built Realtime
support, and live checks of permissions and concurrent actions. Sitewide security
headers are configured; their deployed behavior still needs verification. For class, we will rehearse with G11's demo
script and a clear recovery plan if an outside service fails. This deck does not
repeat that script: it explains the architecture, boundaries and evidence behind
what the demo shows. Our goal for the presentation is that a classmate can explain
where a request goes, why the browser is not trusted, and what a passing test does
and does not prove. That is the programming work behind the island world.

## Evidence and wording rules

- Counts were rerun on `60f7fd0`: backend `uv run --locked pytest` (6,408 passed),
  frontend `npm test` (886 passed, 72 files), `uv run --locked ruff check .`,
  `npm run build` (99 built text files scanned). No live-database claim.
- Read the requested `frontend/HOW-IT-WORKS.md` after the C3 main merge added it,
  along with `frontend/GRAPHICS.md`, architecture, decision titles, code and tests.
- Architecture: `docs/ARCHITECTURE.md`, `vercel.json`, `docs/INTERFACES.md`.
- Request: `backend/server/routes/captain_name.py`, `backend/server/auth.py`,
  `backend/server/account/name_store.py`, accounts migration.
- Safety: `frontend/scripts/check-spoilers.js`, `frontend/public/auth-check.html`,
  account response headers; distinguish configured headers from verified deployment behavior.
- AI workflow: `CONTRIBUTING.md`, `AGENTS.md`, D015 body. Decision titles were
  reviewed without importing story decisions or solution content into the deck.
- Timing is a rehearsal allocation, not evidence of a delivered timed run.
