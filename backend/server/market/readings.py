"""What a price source knows about one company at one moment: a Reading.

The feed (feed.py) makes one Reading per company each time somebody looks at the prices. It says
the price, when the price was quoted, when this server instance fetched it and where it came from.
states.py then decides from the reading and the opening hours what the board says about the
company. The reading has no rules of its own: it is only the shape of the answer.

Where a price came from (the `source` of a reading):
  live    fetched by this very look
  cache   held by this server instance, young enough for this look (or a final closing price)
  stale   older than this look accepts, and no fresher price could be fetched
  replay  the recorded day that plays in demo mode
  none    no price at all (nothing fetched yet since this instance started)

Used by: feed.py (makes them), states.py (reads them), exchange.py and the tests.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

SOURCE_LIVE = "live"
SOURCE_CACHE = "cache"
SOURCE_STALE = "stale"
SOURCE_REPLAY = "replay"
SOURCE_NONE = "none"

# Which kind of prices a position was opened on. A position opened on live prices can only be
# closed on live prices, and one opened on the recording only on the recording (rule R20).
PRICE_MODE_LIVE = "live"
PRICE_MODE_REPLAY = "replay"


@dataclass(frozen=True)
class Reading:
    """The newest price this server instance holds for one company."""

    price: Decimal | None  # None: no price yet
    quoted_at: datetime | None  # when the price was quoted (the provider's time for a stock)
    fetched_at: datetime | None  # when this server instance fetched it
    source: str  # SOURCE_LIVE, SOURCE_CACHE, SOURCE_STALE, SOURCE_REPLAY or SOURCE_NONE

    @property
    def has_price(self) -> bool:
        return self.price is not None

    @property
    def price_mode(self) -> str:
        """PRICE_MODE_REPLAY for the recording, otherwise PRICE_MODE_LIVE."""
        return PRICE_MODE_REPLAY if self.source == SOURCE_REPLAY else PRICE_MODE_LIVE


# The reading of a company that has no price at all.
NO_READING = Reading(price=None, quoted_at=None, fetched_at=None, source=SOURCE_NONE)
