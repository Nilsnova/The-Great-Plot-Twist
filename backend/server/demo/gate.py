"""The demo gate: lets guests (anonymous users) use the API only while the demo is open.

auth.get_current_player calls admit() for every guest, after Supabase has verified the token.
GitHub and Google users never reach this file.

    feature flag demo off                     ->  403 demo_closed (no database read at all)
    flag on, window closed or ended           ->  403 demo_closed
    flag on, window open                      ->  the guest passes; on their first call on this
                                                  server instance they get a captain name and the
                                                  default kit (demo/guests.py)
    the window cannot be read                 ->  the database error (502/503), never a pass

The window is read through the database function demo_window_read and remembered for
CACHE_SECONDS, so a full class of phones causes about one read per 10 seconds per server
instance. After a host closes the window, a guest may therefore still pass for up to 10 seconds on
another instance. The host's own instance learns the new window at once (remember()).

Which guests are ready is remembered per server instance (at most MAX_READY ids). A new instance
asks the database once more: provision_guest is safe to repeat and then only reads.

Used by: auth.py (admit), routes/config.py (public_window) and routes/demo.py (the host routes).
"""

from datetime import datetime, timedelta

from server.auth import Player
from server.clock import Clock
from server.demo.guests import provision_guest
from server.demo.window import CLOSED, Window, read_window
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
        "Guest play is closed right now. Ask the host to open the demo, or sign in with GitHub.",
    )


class DemoGate:
    """The demo gate of one server instance. create_app() makes one and stores it."""

    def __init__(
        self, settings: Settings, admin: SupabaseAdmin, clock: Clock, provision=provision_guest
    ) -> None:
        self.settings = settings
        self.admin = admin
        self.clock = clock
        self.provision = provision  # tests pass a fake here
        self.cached: tuple[datetime, Window] | None = None
        self.ready: dict[str, None] = {}  # ordered, so the oldest id is dropped first

    @property
    def flag_on(self) -> bool:
        return is_enabled("demo", self.settings.flags)

    async def window(self) -> Window:
        """The window now: from memory if it was read less than CACHE_SECONDS ago."""
        if not self.flag_on:
            return CLOSED
        now = self.clock()
        if self.cached is not None and now - self.cached[0] < timedelta(seconds=CACHE_SECONDS):
            return self.still_open(self.cached[1], now)
        window = await read_window(self.admin)
        self.cached = (now, window)
        return window

    @staticmethod
    def still_open(window: Window, now: datetime) -> Window:
        """A remembered window that ended in the meantime counts as closed."""
        if window.open_until is None or window.open_until <= now:
            return CLOSED
        return window

    def remember(self, window: Window) -> None:
        """The host just switched the window: use the new one at once on this instance."""
        self.cached = (self.clock(), window)

    async def public_window(self) -> Window:
        """For GET /api/config: a window that cannot be read shows as closed, never as an error."""
        try:
            return await self.window()
        except ApiError:
            return CLOSED

    async def admit(self, player: Player) -> None:
        """Let the guest pass, or raise 403 demo_closed (or a database error)."""
        window = await self.window()
        if not window.open:
            raise demo_closed()
        if player.id in self.ready:
            return
        await self.provision(self.admin, player.id)
        self.ready[player.id] = None
        while len(self.ready) > MAX_READY:
            del self.ready[next(iter(self.ready))]
