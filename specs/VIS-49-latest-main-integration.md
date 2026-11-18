# VIS49: current-main integration boundary

Responsible human: Johannes Franz Lang (`frcola`), with coding-agent assistance.
This is a separate integration review task; no PR merge, deployment, live SQL or
production configuration change is authorized.

The branch starts at current main
`ee5677ff4986b671c271c85a35abcee70aa8fe59` and incorporates the frozen visual
candidate `a4ecdce6e4cab0fe9cfb282099d0b2bf941df2be`. The comparison base is an
immutable reference at the visual candidate. Main's newer first-load, live-wave,
recovery and immutable asset-cache changes must survive beside D061–D064 visuals,
paid-wall contracts, guarded core HP and obsolete-wave lookup fences.

Acceptance requires both source ancestors, individually explained conflict
resolutions, unchanged public art, affected pure contract checks, and separate
coordinator verification on the resulting frozen source. No old test result is
automatically a pass for this source. The aggregate remains Draft and is not a
standalone feature PR to merge wholesale.

Issue [#413](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/413),
Draft [#414](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/414).

The local integration preserves both parents. Actual text conflicts were limited
to `island/api.js`, `island/index.js` and `docs/STATUS.md`: retain the newer clock
and own-read retry behavior alongside strict perimeter inputs, paid-wall client
capability, visual selection and target identity guards; keep both status logs.

Independent source review also identified three semantic interactions in otherwise
clean merges. Canonically closed waves need an ID-specific fence so a late read
cannot resurrect the ended wave, while unrelated new-wave reads still apply and
a merely local stop can rejoin a server-open wave. Core HP needs its own cheap
250 ms publication after a same-wave return; the expensive recovery vector stays
event-driven. Public protocol-2 joinable rows must reject local legacy-only
`perimeterDemo` fields rather than bypass their schema through the new fallback.

All new failure cases were demonstrated before their fixes. Final affected pure
checks: **24 files / 263 tests passed**, Vitest **16.26 s**, process **18.46 s**.
The exact commands, source tree pins, failed attempts and 50-path preservation
audit are in the [evidence record](../docs/evidence/VIS-49-latest-main/README.md).
Public tree `9306942db1050d728799cee2fbdc8e8960f14ad2` is unchanged. The new
backend tree differs from the older candidate, so old backend results are not a
fresh pass for this integration. No Chrome, full-suite, build, backend or live
database check was run by this task; the coordinator owns those pending gates.

This includes upstream immutable `/assets/*` cache headers in `vercel.json` and
the exact corresponding security-header checker change. No existing security
header is weakened, and no deployed header/configuration is changed here.
