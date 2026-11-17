# Standalone comparison: actual browser proof

Responsible human: Johannes Franz Lang (`frcola`). These are original coordinator
receipts for the documentation comparison page, preserved by Draft #388. They
test the **HTML comparison**, not a new version of the game.

The tested HTML SHA-256 is
`ee507bf458ece37811f748d8896cf46f19bbea7f53d0264be62fd4f7f4569de7`.
It embeds the eight unchanged original screenshots identified in the
[rendered review manifest](../reference-village-visual-review/sha256.json).
That package retains its own `9f47` capture / `6e2` check-source boundary; this
browser test does not capture the later integrated application.

## Owned-loopback result

The [original report](owned-loopback-passed/report.json) and
[process log](owned-loopback-passed/run.log) record a pass on **Chromium
156.0.8078.79**, at both **1280×720** and **375×812**. At each viewport:

- All eight embedded PNGs decoded with their exact original native dimensions.
  Original byte hashes and declared dimensions also matched.
- Three tablists completed **27 actual click / Arrow / Home / End actions**.
  Each checked focus, roving tabindex, aria-selected, controlled-panel labels,
  actual hidden/rendered state and horizontal overflow.
- JavaScript page errors and external HTTP requests were both **zero**.
- The browser received the exact original HTML bytes over an owned ephemeral
  `127.0.0.1` HTTP server. That server supplied only `/` and optional favicon 204;
  other paths were 404. The server closed after the test.

The original full-page screenshots show the comparison document at
[desktop](owned-loopback-passed/comparison-1280x720.png) and
[phone-width](owned-loopback-passed/comparison-375x812.png). Their pixel heights
include the complete scrolling document and are recorded in the manifest. They
are not newly captured gameplay frames and were not edited or re-encoded.

## Direct file opening remains blocked

The separate [file-URI report](file-uri-failed/report.json) and
[log](file-uri-failed/run.log) preserve
`ERR_BLOCKED_BY_ADMINISTRATOR` from the managed browser. This attempt failed
**before HTML loading, image decoding or tab assertions**. No browser policy
was disabled. Direct `file://` opening in the managed browser and physical
Safari/phone behavior remain unverified. The document is self-contained, but
that property does not prove every browser permits local-file navigation.

## Reproduction and provenance

The exact [checker source](verify-comparison.mjs) uses the existing
`playwright-core` package and headless Chromium; it adds no dependency. It accepts
the HTML file and an output directory. In the managed workspace:

~~~bash
CHROME_PATH=/usr/bin/chromium node /workspace/reference-village-work/verify-comparison.mjs \
  /absolute/path/to/comparison.html /absolute/path/to/output
~~~

Keep the HTML's `sha256.json` alongside it. The preserved checker resolves the
existing frontend dependencies at its explicit managed-workspace path; use the
equivalent installed frontend package path if reproducing elsewhere. The
[manifest](sha256.json) records exact copied report/log/screenshot/checker bytes.
Packaging this evidence ran no browser or game suite; the coordinator's actual
result remains limited to the source/hash, browser and loopback mode above.

Newer game integration, final human visual acceptance, physical devices/Safari,
sustained performance, balance, the 8MiB target and land expansion retain their
separate gates. No PR merge to main, deployment, live migration or production
flag activation is represented here.
