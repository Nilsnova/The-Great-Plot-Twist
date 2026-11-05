"""Bake coherent grass/path pixels over the game's canonical logical land mask."""
from PIL import Image, ImageDraw
from random import Random
from subprocess import check_output
from pathlib import Path
from math import sin, cos

def point(x,z):return (round(512+x*16),round(384+z*16*.72))

def ground(root):
    w,h=1024,768
    classes=check_output(['node','scripts/export-pixel-ground.js'],cwd=root)
    assert len(classes)==w*h
    im=Image.new('RGBA',(w,h));pix=im.load();rng=Random(87)
    palette=['#749258','#78965c','#719056','#7c995f']
    from PIL.ImageColor import getrgb
    palette=[getrgb(c)+(255,) for c in palette]
    # Broad low-contrast patches, then deliberate small clusters; no pixel noise filter.
    for y in range(h):
        for x in range(w):
            c=classes[y*w+x]&3
            if c:
                if c==1:color=(193,168,119,255) if (x//6+y//5)%7 else (184,158,110,255)
                else:color=palette[int((sin(x/49)+cos(y/41)+sin((x+y)/73)+3)*.61)%4]
                pix[x,y]=color
    d=ImageDraw.Draw(im)
    # Selective coast contact pixels: dry sand, wet edge, broken shoreline.
    for y in range(2,h-2):
        for x in range(2,w-2):
            if classes[y*w+x]&3 and not classes[(y+2)*w+x]&3:
                d.line((x,y,x,y+1),fill='#92996b')
                if (x//4)%3==0:d.point((x,y+2),fill='#83aaa0')
    for i in range(190):
        x=rng.randrange(12,w-18);y=rng.randrange(12,h-18)
        if classes[y*w+x]&3!=2:continue
        rx=rng.randrange(7,20);ry=rng.randrange(4,11)
        for yy in range(y-ry,y+ry):
            for xx in range(x-rx,x+rx):
                if classes[yy*w+xx]&3==2 and ((xx-x)/rx)**2+((yy-y)/ry)**2 < .8 + .15*sin(xx*.6+yy*.9):
                    pix[xx,yy]=(107,139,80,255) if i%3 else (128,154,92,255)
    for i in range(4400):
        x=rng.randrange(2,w-4);y=rng.randrange(2,h-5)
        if classes[y*w+x]&3!=2:continue
        color=rng.choice(['#66844c','#6b8b50','#839e60','#7d9b5d'])
        d.line([(x,y+2),(x,y),(x+1,y+2),(x+3,y+1)],fill=color)
    # Low cliff face at the lighthouse hill, with chunked stone/earth bands.
    for x in range(w):
        rows=[y for y in range(180,450) if classes[y*w+x]&8]
        if not rows:continue
        edge=max(rows)
        d.line((x,edge,x,edge+18),fill='#514b37')
        d.line((x,edge+2,x,edge+14),fill='#705a3e')
        if x%13<7:d.line((x,edge+5,x,edge+10),fill='#8f7450')
        d.point((x,edge),fill='#49603a');d.point((x,edge+1),fill='#a5ad66')
    paths=[([(-2,18),(-2,13),(-3,9),(-4,6),(0,4),(3,0),(4,-4),(6,-5),(9,-5.2)],18),
           ([(-4,6),(-5.5,6.2),(-7,5.2)],16),([(-2,16.5),(-4.4,17),(-7,16.8)],17)]
    mask=Image.new('L',(w,h));md=ImageDraw.Draw(mask)
    for route,radius in paths:
        for a,b in zip(route,route[1:]):
            p=point(*a);q=point(*b);length=max(abs(q[0]-p[0]),abs(q[1]-p[1]),1)
            for t in range(length+1):
                x=round(p[0]+(q[0]-p[0])*t/length);y=round(p[1]+(q[1]-p[1])*t/length)
                r=radius+round(sin(x/13+y/17)*2)
                md.ellipse((x-r,y-r*.72,x+r,y+r*.72),fill=255)
    mp=mask.load()
    for y in range(2,h-2):
        for x in range(2,w-2):
            if mp[x,y] and classes[y*w+x]&3:
                pix[x,y]=(193,165,121,255) if (x//12+y//9)%11 else (197,169,125,255)
    # Grass teeth and clustered pebbles break the edge of the path at a common scale.
    for i in range(9000):
        x=rng.randrange(4,w-5);y=rng.randrange(4,h-5)
        if not classes[y*w+x]&3:continue
        if not mp[x,y] and (mp[x+3,y] or mp[x-3,y] or mp[x,y+3]):
            d.line([(x,y+2),(x+1,y-2),(x+2,y),(x+4,y-1)],fill='#78965b',width=2)
        elif mp[x,y] and i%7==0:
            d.line([(x,y),(x+2,y-1),(x+4,y)],fill='#b69a70')
            if i%21==0:d.line([(x+1,y-1),(x+2,y-1)],fill='#d7bc8c')
    for y in range(3,h-4,2):
        for x in range(3,w-4,2):
            if classes[y*w+x]&3==2 and not mp[x,y] and (mp[x+3,y] or mp[x-3,y] or mp[x,y+3]):
                if (x*11+y*7)%9<4:
                    d.line([(x,y+2),(x+1,y-2),(x+2,y),(x+4,y-1)],fill='#719156',width=2)
    return im
