"""Rebuild the original pixel-art PNG kit. Requires Python Pillow, only for authoring."""
from pathlib import Path
from common import save
from nature import tree, rock, shrub, flowers, undergrowth
from buildings import cottage, boathouse, lighthouse
from people import person
from props import prop
from ground import ground
from destinations import office, beacon, signal, pier, ship
from nautical import item
from settlements import assets as settlement_assets
from case_places import assets as case_assets
from place_ground import ground as place_ground, PATHS
from chart import chart
from crew import assets as crew_assets
from story_props import assets as story_assets
from title import title_scene
from relighting import assets as relighting_assets
from festival import assets as festival_assets
from emotes import assets as emote_assets
from islet import assets as islet_assets
from pirates import assets as pirate_assets

ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'public'/'pixel'
FOLDER.mkdir(exist_ok=True)
assets={'birch':tree(),'oak':tree(variant=1),'birch-tall':tree(variant=2),'pine':tree(True),'rock':rock(),'shrub':shrub(),'flowers':flowers(),
        'cottage':cottage(),'cottage-interior':cottage(True),'cottage-glow':cottage(glow=True),
        'boathouse':boathouse(),'lighthouse':lighthouse()}
for name in ['grass-tuft','fern','reeds','mushrooms']:assets[name]=undergrowth(name)
for view,name in [('front','explorer'),('back','explorer-back'),('side','explorer-side')]:
    assets[name]=person(view)
    for step in [1,2]:assets[f'{name}-walk-{step}']=person(view,step)
for name in ['jetty','boat','crate','barrel','rope-coil','lantern','bench','buoy','driftwood','gull','sign']:
    assets[name]=prop(name)
assets.update({'harbour-office':office(),'harbour-beacon':beacon(),'signal-station':signal(),'ferry-pier':pier(),'sailboat':ship(),'dark-schooner':ship(True)})
for name in ['sealed-letter','torn-page','logbook','compass','brass-star','beacon-fire']:assets[name]=item(name)
assets.update(settlement_assets());assets.update(case_assets());assets.update(crew_assets());assets.update(story_assets());assets.update(relighting_assets());assets.update(emote_assets());assets.update(islet_assets())
assets.update(festival_assets())
assets.update(pirate_assets())
for name,image in assets.items():save(image,name,FOLDER)
terrain=ground(ROOT)
save(terrain,'ground',FOLDER)
places=ROOT/'public'/'places';places.mkdir(exist_ok=True)
for id in PATHS:save(place_ground(ROOT,id),id,places)
save(chart(),'chart',places);save(chart(True),'chart-relit',places)
save(title_scene(assets,terrain),'title',places)
print(f'Saved {len(assets)} original pixel sprites and canonical terrain backdrop')
