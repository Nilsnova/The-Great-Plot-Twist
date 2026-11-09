"""The guest gate: a guest (anonymous user) may use the API only after presenting the class code.

auth.get_current_player calls admit() for every guest, after Supabase has verified the token.
GitHub and email users never reach this file.

    feature flag demo off                     ->  403 demo_closed (no database read at all)
    flag on, the guest is not in demo_guests  ->  403 demo_closed (they have not presented the
                                                  current class code yet: POST /api/demo/join)
    flag on, the guest is admitted            ->  the guest passes; on their first call on this
                                                  server instance they get a captain name and the
                                                  default kit (demo/guests.py)
    the admission cannot be read              ->  the database error (502/503), never a pass

Anyone can create an anonymous user with the public publishable key, so the projector QR is not
a lock: this gate is (with the browser policies of 20261109020000_class_code.sql). There is no
time window any more (decision D030): anonymous sign-ins stay on, and only an admitted guest
plays.

An admission is remembered for CACHE_SECONDS per server instance, so a busy guest causes about one
read per 10 seconds per instance. A refusal is not remembered, so a guest who just joined passes at
once on every instance. The join route tells the gate of its own instance at once (remember()).
A new class code removes nobody: an admitted guest stays admitted until their account is deleted.

Which guests are ready (name and kit) is remembered per server instance (at most MAX_READY ids). A
new instance asks the database once more: provision_guest is safe to repeat and then only reads.

Used by: auth.py (admit), routes/config.py (flag_on) and routes/demo.py (the routes).
"""

from datetime import datetime, timedelta

from server.auth import Player
from server.clock import Clock
from server.demo.code import is_admitted
from server.demo.guests import provision_guest
from server.errors import ApiError
from server.flags import is_enabled
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin

CACHE_SECONDS = 10
MAX_READY = 5000


def demo_closed() -> ApiError:
    return ApiError(
        403,
        "demo_closed",
        "Guest play needs the current class code. Ask the presenter for it, "
        "or sign in with GitHub.",
    )


class DemoGate:
    """The guest gate of one server instance. create_app() makes one and stores it."""

    def __init__(
        self,
        settings: Settings,
        admin: SupabaseAdmin,
        clock: Clock,
        provision=provision_guest,
        lookup=is_admitted,
    ) -> None:
        self.settings = settings
        self.admin = admin
        self.clock = clock
        self.provision = provision  # tests pass a fake here
        self.lookup = lookup
        # Ordered, so the oldest id is dropped first. Values: when the admission was read.
        self.admitted: dict[str, datetime] = {}
        self.ready: dict[str, None] = {}

    @property
    def flag_on(self) -> bool:
        return is_enabled("demo", self.settings.flags)

    def remember(self, player_id: str) -> None:
        """This guest was just admitted (or read as admitted): pass them for CACHE_SECONDS."""
        self.admitted.pop(player_id, None)
        self.admitted[player_id] = self.clock()
        while len(self.admitted) > MAX_READY:
            del self.admitted[next(iter(self.admitted))]

    async def is_admitted(self, player_id: str) -> bool:
        """True if the guest presented a valid class code once. Remembered for CACHE_SECONDS."""
        seen = self.admitted.get(player_id)
        if seen is not None and self.clock() - seen < timedelta(seconds=CACHE_SECONDS):
            return True
        self.admitted.pop(player_id, None)
        if not await self.lookup(self.admin, player_id):
            return False
        self.remember(player_id)
        return True

    async def admit(self, player: Player) -> None:
        """Let the guest pass, or raise 403 demo_closed (or a database error)."""
        if not self.flag_on or not await self.is_admitted(player.id):
            raise demo_closed()
        if player.id in self.ready:
            return
        await self.provision(self.admin, player.id)
        self.ready[player.id] = None
        while len(self.ready) > MAX_READY:
            del self.ready[next(iter(self.ready))]
