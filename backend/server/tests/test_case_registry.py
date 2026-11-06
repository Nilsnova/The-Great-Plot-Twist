"""The case data and the place registry of the browser use the same ids and the same light positions.

The browser owns where things are (frontend/src/world/places/registry.js): the places, their
hotspots (the registry calls them zones), their lights and the chart position of every place. The
case file owns what is found there. Both name the same ids, so a typo on either side would put a
card at a spot nobody can walk to. This test reads the registry with Node.js and compares:

  * every place and hotspot of the case exists in the registry, except the virtual place
    `anywhere` (the journal and the satchel), which is not a place on the map,
  * every light of the case stands in the registry place that the case names,
  * every light's chart_xy equals the place's chart position plus half the beam origin, with the
    vertical part flipped (the chart's y grows to the south), within 0.01.

The registry imports fine in Node.js without a browser, but it needs the client's packages
(frontend/node_modules), because the lighthouse module imports Three.js. The test is skipped, with
the reason, only when Node.js or frontend/node_modules is missing here.

Used by: pytest, with the other tests in backend/server/tests/.
"""

import json
import shutil
import subprocess

import pytest

from server.game.case_data import CaseData, load_case
from server.tests.helpers import REPO_ROOT

FRONTEND = REPO_ROOT / "frontend"
REGISTRY = FRONTEND / "src" / "world" / "places" / "registry.js"

# The one place of the case that is not on the map: the seat's journal and satchel.
VIRTUAL_PLACE = "anywhere"
VIRTUAL_HOTSPOTS = {"journal", "satchel"}

# How close a light's chart position must be to the position the registry gives.
CHART_TOLERANCE = 0.01

SKIP_REASON = (
    "Node.js and the client's packages are needed to read the place registry: "
    "install Node.js 22 or newer and run `npm install` in frontend/."
)

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not (FRONTEND / "node_modules").is_dir(), reason=SKIP_REASON
)

# Runs in Node.js: imports the registry and prints what the test compares, as JSON.
READ_REGISTRY = """
import {{ places }} from {module};
const out = {{}};
for (const [id, place] of Object.entries(places)) {{
  out[id] = {{
    chart: place.chart,
    zones: place.zones.map((zone) => zone.id),
    lights: place.lights.map((light) => ({{ id: light.id, beamOrigin: light.beamOrigin }})),
  }};
}}
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def data() -> CaseData:
    return load_case()


@pytest.fixture(scope="module")
def registry() -> dict:
    """The places of the registry: {place id: {chart, zones, lights}}."""
    script = READ_REGISTRY.format(module=json.dumps(REGISTRY.as_uri()))
    output = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        capture_output=True,
        text=True,
        cwd=FRONTEND,
    )
    assert output.returncode == 0, output.stderr
    return json.loads(output.stdout)


def registry_lights(registry: dict) -> dict:
    """Every light of the registry: {light id: (place id, light)}."""
    return {
        light["id"]: (place_id, light)
        for place_id, place in registry.items()
        for light in place["lights"]
    }


def expected_chart_position(registry: dict, place_id: str, light: dict) -> tuple[float, float]:
    """The place's chart position plus half the beam origin, with y flipped."""
    chart_x, chart_y = registry[place_id]["chart"]
    return (chart_x + light["beamOrigin"]["x"] / 2, chart_y - light["beamOrigin"]["y"] / 2)


def test_case_ids_and_light_positions_match_the_place_registry(data, registry):
    for place in data.places:
        if place.id == VIRTUAL_PLACE:
            continue
        assert place.id in registry, f"place {place.id} is not in the registry"
        for hotspot in place.hotspots:
            assert hotspot.id in registry[place.id]["zones"], f"hotspot {hotspot.id} has no zone"

    lights = registry_lights(registry)
    for light in data.night.lights:
        assert light.id in lights, f"light {light.id} is not in the registry"
        place_id, registry_light = lights[light.id]
        assert light.place == place_id
        assert light.chart_xy == pytest.approx(
            expected_chart_position(registry, place_id, registry_light), abs=CHART_TOLERANCE
        )


def test_only_the_journal_and_the_satchel_are_not_on_the_map(data, registry):
    missing = {place.id: place for place in data.places if place.id not in registry}

    assert set(missing) == {VIRTUAL_PLACE}
    assert {hotspot.id for hotspot in missing[VIRTUAL_PLACE].hotspots} == VIRTUAL_HOTSPOTS


def test_every_light_a_hotspot_names_stands_in_the_registry_place_of_that_hotspot(data, registry):
    lights = registry_lights(registry)

    for place in data.places:
        for hotspot in place.hotspots:
            if hotspot.light is not None:
                assert lights[hotspot.light][0] == place.id


def test_every_place_a_kit_starts_in_or_calls_home_is_on_the_map(data, registry):
    for kit in data.kits:
        assert kit.starts_at in registry
        assert kit.home in registry


def test_the_registry_holds_the_three_lights_of_the_minimum(registry):
    lights = registry_lights(registry)

    assert {"keepers_lamp", "harbor_light", "islet_signal_station"} <= set(lights)
