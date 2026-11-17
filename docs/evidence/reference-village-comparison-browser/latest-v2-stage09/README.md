# Stage-nine twelve-image comparison: native verification attempts

The actual comparison HTML remains unchanged at SHA-256
`f65e50207d375c2b594c872e403dbff5a308e1d1809a54eabc0feda33d067e76`,
10,522,733 bytes. Generated concepts remain separate from its twelve embedded
original game PNGs. Responsible human: Johannes Franz Lang (`frcola`).

## Attempt one: response inspection failed

The [original report](attempt-01-cache-failed/report.json),
[log](attempt-01-cache-failed/run.log), [original checker](attempt-01-cache-failed/original-checker.mjs)
and [hash manifest](attempt-01-cache-failed/sha256.json) preserve the failed
`dbdb2dc8…` native attempt on Chromium 156.0.8078.79. It ran from
23:18:08.829 to 23:18:10.817 UTC. The owned HTTP server returned status 200 and
the static twelve embedded stream hashes matched. The next operation,
`response.body()`, failed because the 10.52 MB document exceeded Chromium's
default per-resource inspector response cache.

The browser image decoding, dimensions, tab behavior and interaction assertions
were **not reached**. One viewport is marked `running` in the failed raw report;
it is not a pass. Browser/server cleanup ran and the report records the owned
server closed. This failure remains evidence and is not overwritten.

## Attempt two: buffered response inspection also failed

The [second original report](attempt-02-cache-failed/report.json),
[log](attempt-02-cache-failed/run.log), [checker](attempt-02-cache-failed/original-checker.mjs)
and [manifest](attempt-02-cache-failed/sha256.json) preserve checker `b2ecab8e…`.
It configured its own bounded Network session before navigation, but the later
`Network.getResponseBody` still failed with inspector cache eviction. This attempt
ran from 23:22:03.598 to 23:22:05.599 UTC; native image/tab assertions were again
not reached. No cause is claimed beyond the recorded transport error.

## Attempt three: same-navigation streaming passed

Revised checker `d3d59405…` uses the same owned CDP session but starts
`Network.streamResourceContent` immediately when the owned Document response
arrives. It reserves decoded-storage headroom of **4× HTML bytes per resource /
16× total**. It combines the returned buffered base64 prefix with later
`Network.dataReceived.data` chunks for that **same request ID**, in their event
order, and awaits that document's `Network.loadingFinished`. It enforces the
original HTML size bound, exact final length and exact byte comparison before
any image/tab assertions. A loading/stream error fails the run. The session
detaches in `finally`; no later inspector-cache body read is used.

All twelve decoded-image/native-dimension checks, exact 2/3/3 tablists,
focus/selection/visibility/overflow checks, real click/Arrow/Home/End actions,
zero-external-request/page-error assertions and outer cleanup remain unchanged.
The HTML and screenshots are unchanged; no policy, graphics, application timing
limit or application behavior changed. Syntax passed. The revised native run **PASSED** on Chromium 156.0.8078.79 from
23:27:54.609 to 23:28:00.472 UTC. The [original report](passed-stream/report.json),
[log](passed-stream/run.log) and [hash manifest](passed-stream/sha256.json) preserve
the exact result. At **each** 1280×720 and 375×812 viewport: twelve original PNGs
decoded at native dimensions, three exact tablists and **33 real actions**
passed, with zero page errors/external requests. Both actual browser responses
were status 200 and exactly **10,522,733 bytes / f65e5020…**: 1,048,576 buffered
prefix bytes plus 9,474,157 bytes in ten streamed chunks. Resource/total bounds
were 42,090,932 / 168,363,728 bytes. Browser/server cleanup completed; the report
records `httpServerClosed: true` and no cleanup error.

The [desktop](passed-stream/comparison-1280x720.png) and
[phone](passed-stream/comparison-375x812.png) PNGs are full-page documentation
screenshots; their filenames identify viewport size, while their actual full-page
dimensions are recorded in the manifest. They are separate from the unchanged
native-size game PNGs. This proves the review document, not additional application,
Safari/device, sustained-performance, balance or human acceptance. Both prior
cache-read failures remain archived.
