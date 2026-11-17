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

Implementation and verification are pending at this claim commit.
