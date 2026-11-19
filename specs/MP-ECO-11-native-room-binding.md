# Native session room binding

The running island supplies either a fresh canonical `isle_<code>_<24 lowercase hex>` nonce,
an explicit verified legacy `isle_<code>`, or an explicit unknown room. The network wave classifier
and room proxy recognize both supported island formats and Pirate Point, with room 1 only.
Recognition grants no financial or controller authority; native gameplay remains journal/proof gated.
Never derive a native nonce from navigation or fall back to a legacy island topic while unknown.

Exact local adapter intent `reportPosition({place: null})` clears the active room, queued position,
cosmetic peers and local emote. Coordinates and extra fields are refused in that form. A clear
invalidates delayed imports and queued samples so they cannot restore the prior room. A newer
qualified source may subsequently report normally. The world sends one clear on each explicit-null
transition; an omitted routing decision retains the existing world-place default.

Validation includes the actual private online presence adapter, A4 realtime sender/view, wave proxy
and injected SDK channels: nonce wave broadcasts arrive in room 1; rotating nonce refuses old-room
sends and callbacks; clearing removes the new channel. Separate tests cover delayed transport after
clear with/without a newer source, strict clear validation, fake projection and once-only world
transitions. These tests use no network or live service and do not replace authenticated RLS checks.

The six focused presence/routing files passed 192 tests in 5.23 seconds. Production build and
spoiler guard passed (257 text files, 12 protected lines), and whitespace review was clean.
