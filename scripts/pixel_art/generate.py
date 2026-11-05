"""Rebuild the original pixel-art PNG kit. Requires Python Pillow, only for authoring."""
from pathlib import Path
from common import save
from nature import tree, rock, shrub, flowers, undergrowth
from buildings import cottage, boathouse, lighthouse
from people import person
from props import prop
from ground import ground

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
for name,image in assets.items():save(image,name,FOLDER)
save(ground(ROOT),'ground',FOLDER)
print(f'Saved {len(assets)} original pixel sprites and canonical terrain backdrop')
