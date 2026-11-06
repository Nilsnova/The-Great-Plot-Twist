# S explain-back cards

Used with the [S lane page](../lanes/S.md) for Thu 19 and Sat 21 November 2026. Open source locally; find the named function/test in the current revision before opening the back. The original authored line ranges are historical orientation aids, not stable API references. Do not project server-only case data.

## 1. Serialize without sharing mutable lists — Easy

Open [backend/plot_twist/engine.py](../../backend/plot_twist/engine.py), lines 50–59 (`def to_dict`).

**Front:** Explain these lines. Why copy inventory and flags when returning state?

<details>
<summary>Back — check your explanation</summary>

Callers should not mutate engine internals through a serialized view. Copies preserve the engine boundary; explain which fields are scalar and which need independent lists.

</details>

## 2. Hidden versus blocked choices — Easy

Open [backend/plot_twist/engine.py](../../backend/plot_twist/engine.py), lines 121–146 (`def conditions_met`).

**Front:** Explain these lines. Explain visible_actions: is an unmet condition always hidden?

<details>
<summary>Back — check your explanation</summary>

Conditions decide whether an action is allowed. hide_when_blocked controls whether a blocked action remains visible. Ending states expose no further choices.

</details>

## 3. Find the mutation boundary — Medium

Open [backend/plot_twist/engine.py](../../backend/plot_twist/engine.py), lines 157–182 (`def perform`).

**Front:** Explain these lines. Show the refusal paths before mutation. Why is their ordering useful?

<details>
<summary>Back — check your explanation</summary>

Ended games, unknown actions and unmet requirements return before changing state or saving. Refusal is observable without partially applying an invalid move.

</details>

## 4. Collect an item twice — Medium

Open [backend/plot_twist/engine.py](../../backend/plot_twist/engine.py), lines 157–182 (`def perform`).

**Front:** Explain these lines. Find inventory/flag membership guards. Is this the same as a safe-repeat database transaction?

<details>
<summary>Back — check your explanation</summary>

Membership checks avoid duplicate items/flags. This local state property does not provide database atomicity or wallet uniqueness; those require the constrained server/database action reference.

</details>

## 5. Inject storage — Easy

Open [frontend/src/story/storage.js](../../frontend/src/story/storage.js), lines 14–46 (`export function memoryStorage`).

**Front:** Explain these lines. Why support memoryStorage and a browser storage wrapper?

<details>
<summary>Back — check your explanation</summary>

Pure rules run under Node/tests with memory storage. Browser storage can be unavailable or throw; the wrapper lets play continue without claiming persistence.

</details>

## 6. Reject a corrupt save — Medium

Open [frontend/src/story/saves.js](../../frontend/src/story/saves.js), lines 23–38 (`export function parseSavedState`).

**Front:** Explain these lines. Explain invalid JSON, unknown scenes/items and wrong types. What happens to valid lists?

<details>
<summary>Back — check your explanation</summary>

Invalid or obsolete structures return null rather than entering an impossible state. Usable lists are copied and supported defaults applied; the UI can offer a fresh start.

</details>

## 7. Navigate legally — Hard

Open [frontend/src/story/intro-adapter.js](../../frontend/src/story/intro-adapter.js), lines 9–43 (`function navigation`).

**Front:** Explain these lines. Why search movement-only actions and replay a candidate before replacing the journal?

<details>
<summary>Back — check your explanation</summary>

The adapter avoids teleporting or silently collecting items/flags/ending the story. A candidate must replay successfully before the current game/log is replaced, preserving atomic navigation.

</details>

## 8. Parity is a real executed check — Testing

Open [backend/plot_twist/tests/test_web_parity.py](../../backend/plot_twist/tests/test_web_parity.py), lines 44–88 (`class TestWebParity`).

**Front:** Explain these lines. What is compared across Python and JavaScript? What could make a green run misleading?

<details>
<summary>Back — check your explanation</summary>

Matching move sequences compare acceptance, messages, state, visible actions and notes. Node must execute the browser engine; absent Node can skip parity. Inspect pytest -rs and never report a skipped comparison as passed.

</details>

## 9. Protect server-only content — Safety / testing

Open [backend/server/routes/content.py](../../backend/server/routes/content.py), lines 39–60 (`PUBLIC_CONTENT:`).

**Front:** Explain these lines. Why accept a symbolic public name rather than a caller-supplied file path? Open server/tests/test_content.py too.

<details>
<summary>Back — check your explanation</summary>

A fixed allowlist serves approved public content and refuses unknown names/traversal with 404. Files under backend/content/secret/ are server-only paths, never public-content candidates. Tests must exercise forbidden paths, not just successful reads.

</details>

## 10. Do not trust a local ending — Safety / testing

Open [backend/server/game/referee.py](../../backend/server/game/referee.py), lines 103–115 (`def judge`).

**Front:** Explain these lines. Why replay moves on the server? Compare frontend/tests/case-boundary.test.js.

<details>
<summary>Back — check your explanation</summary>

The browser is editable. Python replays a bounded log against trusted rules and derives the result instead of trusting an ending claim. Case boundary tests keep presentation behind its adapter contract; they do not make a local fake authoritative (D003).

</details>
