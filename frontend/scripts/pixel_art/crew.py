"""Original crew/cast poses. Titles only; no case answer or identity pairing is stored."""
from people import person
from PIL import ImageDraw, Image
from common import canvas, poly
STYLES={
 'crew-deckhand':('#536f72','#819c91','#3d555a','#ceaa80','sailor'),
 'crew-navigator':('#567354','#8fa574','#3b5b44','#a87954','chart'),
 'crew-cook':('#b9b390','#e0d4ac','#8d9679','#dcac7d','cook'),
 'crew-salvager':('#8e674c','#bc9367','#654d3a','#9e7050','tools'),
 'character-harbor-master':('#425966','#738a8b','#2d424e','#c8a27b','officer'),
 'character-masked-captain':('#425966','#738a8b','#2d424e','#c8a27b','mask'),
 'character-fisherman':('#bea453','#d7c27b','#8d7a44','#d0aa7c','fisher'),
 'character-coastguard-commander':('#637875','#a0b1a0','#435852','#aa7c57','officer'),
 'character-salvage-foreman':('#90664c','#bc9771','#624a3c','#d3ab7d','foreman'),
 'character-elena-vos':('#426e64','#79a28b','#2d5149','#c59b76','elena'),
}
def actor(style,view='front',step=0):
    coat,light,shade,skin,role=style;im=person(view,step)
    swaps={'#b18a43':coat,'#d0a555':light,'#866d3a':shade,'#d8ae78':skin}
    from PIL.ImageColor import getrgb
    swaps={getrgb(k)+(255,):getrgb(v)+(255,) for k,v in swaps.items()}
    im.putdata([swaps.get(pixel,pixel) for pixel in im.getdata()]);d=ImageDraw.Draw(im);ink='#29372f'
    if role=='sailor':
        d.rectangle((7,4,17,7),fill='#d3d1af');d.line((6,8,18,8),fill=ink)
        if view!='back':d.line((8,17,16,17),fill='#b9c5ac');d.line((9,20,16,20),fill='#a3b49b')
    if role in ['chart','tools','foreman']:
        d.rectangle((7,5,17,7),fill='#7b7051' if role=='chart' else '#9b7751')
        d.line((8,15,16,24),fill='#394f3c',width=2);d.line((9,15,16,23),fill='#b7a577')
        if view!='back':
            if role=='chart':d.rectangle((17,18,21,24),fill=ink);d.rectangle((18,19,20,23),fill='#ddd0a2')
            else:d.rectangle((5,20,8,23),fill='#748a79');d.line((6,22,8,27),fill='#b49765',width=2)
        if role=='tools':d.rectangle((8,7,16,9),fill=ink);d.rectangle((9,7,11,8),fill='#a6b7a5');d.rectangle((14,7,16,8),fill='#a6b7a5')
        if role=='foreman':d.rectangle((7,4,17,6),fill='#8b6148');poly(d,[(6,6),(4,9),(7,8)],'#be9667')
    if role=='cook':
        d.rectangle((7,3,17,7),fill=ink);d.rectangle((8,3,16,6),fill='#e5dcba')
        for x,y in [(8,3),(12,2),(16,3)]:d.ellipse((x-2,y-2,x+2,y+2),fill='#e5dcba')
        if view!='back':d.rectangle((9,17,16,24),fill='#e4d7ad');d.line((12,18,12,23),fill='#b4b48d')
        d.line((20,16,20,25),fill='#866943');d.ellipse((18,14,21,17),fill='#b89a66')
    if role=='officer':
        d.rectangle((7,3,17,6),fill=ink);d.rectangle((8,3,16,5),fill='#8b9b89');d.line((5,7,19,7),fill=ink)
        d.point((12,5),fill='#c7b67a')
        if view!='back':
            d.line((12,17,12,24),fill=ink)
            for y in [18,21,24]:d.point((14,y),fill='#c7b67a')
    if role=='mask':
        poly(d,[(6,8),(7,3),(11,1),(16,2),(19,7),(18,15),(7,15)],'#273d37',ink)
        if view!='back':d.rectangle((8,8,16,10),fill='#c6b490');d.rectangle((8,11,16,14),fill='#455a4b');d.point((10,9),fill=ink);d.point((15,9),fill=ink)
        d.line((6,15,5,24),fill='#273d37',width=2);d.line((18,15,19,24),fill='#273d37',width=2)
    if role=='fisher':
        d.rectangle((8,3,16,6),fill='#b5a367');d.rectangle((5,7,19,8),fill='#786f42')
        if view!='back':poly(d,[(9,12),(16,12),(14,16),(10,15)],'#d9d1ac')
        d.line((18,17,19,25),fill='#9d8f5a');d.line((7,23,17,23),fill='#9d8f5a')
    if role=='elena':
        d.rectangle((7,3,16,7),fill='#493d31');d.rectangle((6,6,8,13),fill='#493d31');d.line((7,11,7,18),fill='#73583c',width=2)
        if view=='back':d.line((12,5,12,16),fill='#493d31',width=3)
        else:d.rectangle((16,19,21,24),fill='#303f33');d.rectangle((17,20,20,23),fill='#c4bc91')
    return im

def assets():
    result={}
    for id,style in STYLES.items():
        for view,suffix in [('front',''),('back','-back'),('side','-side')]:
            result[id+suffix]=actor(style,view)
            for step in [1,2]:result[f'{id}{suffix}-walk-{step}']=actor(style,view,step)
        # A separate portrait uses only whole-number pixel enlargement.
        im,d=canvas(64,80);face=actor(style).resize((48,64),Image.Resampling.NEAREST);im.alpha_composite(face,(8,8))
        result[id+'-portrait']=im
    return result
