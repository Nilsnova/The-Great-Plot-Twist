# B3 connection-retry evidence

Real Chromium component fixture: existing connection banner, shared styles and a
controlled callback rejection. Before loads the unmodified banner from main
`908d376`; after loads this branch. No live account, API call or game write.

| Size | Before failure | After failure | Before pending | After pending |
|---|---|---|---|---|
| 1280x720 | [Before](before-1280x720.png) | [After](after-1280x720.png) | [Before](before-pending-1280x720.png) | [After](after-pending-1280x720.png) |
| 375x812 | [Before](before-375x812.png) | [After](after-375x812.png) | [Before](before-pending-375x812.png) | [After](after-pending-375x812.png) |

The fixture injects a rejected callback to test resilience; it does not establish
that the production adapter normally rejects. Unit/browser tests also cover retry
success, duplicate pending clicks, newer adapter views and disposal. Physical
phones, screen readers and real provider outages remain unverified.
