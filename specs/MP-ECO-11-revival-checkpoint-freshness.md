# Bounded accepted-prefix revival freshness

Canonical session checkpoint correction, used by the existing free revival
context and its unchanged hold/receipt consumer. No new transport or authority.

Captain HP retains the existing authenticated combat-report trust boundary. The
server does not prove every hit or promote reported HP to a later simulation
tick. A journal reader advancing the global time seal must not by itself make
otherwise recent accepted facts unusable. Conversely, a quiescent global seal
must not keep arbitrarily old facts fresh.

Both currently locked helper/target slots must share their latest nonnegative
accepted through-tick S and input head H. S must be at most the stored seal and H
at most the actual journal head. H must cover every actual event effective at or
before S and both current revival bases. A nonzero basis must be a matching real
revival event effective at or before S. Existing whole-party report monotonicity
and the current-fall timestamp fence remain unchanged.

Using the trusted post-lock server clock, `startsAt + S*50ms` must be no more
than exactly 2000 ms old and must not lie in the future. A new checkpoint UID or
resubmission cannot renew that age. The exact timestamp boundary avoids allowing
an extra fractional tick. This is an explicit bounded accepted-state protocol,
not an old-prefix fallback or a claim of exact wall-clock HP.

Existing membership, original account, retained target deadline, controlling
generation, standing helper, current fallen target UUID, pose/life revision,
reach, frozen Medic timing and server elapsed hold checks remain. Current facts
are read under the existing lock plan; immutable completion replay still happens
before mutable freshness. No global-head equality is added: events appended
after sealed S cannot change that immutable prefix.

Ordinary two-second holds require a recent actual sync before completion. Verify
reader-independent progress with actual fresh reports and a later real seal;
reject an unchanged old prefix after 2.05 seconds even under a new checkpoint UID;
verify exact 2000 ms boundaries, required event/basis coverage and existing hold
interruptions/replay/rollback. Two-controller 100/300 ms simulation/SQL probes must
change from freshness refusal to progress without fabricated HP or paused peers.
