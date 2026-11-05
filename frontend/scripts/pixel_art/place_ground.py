"""Baked place coasts and purposeful paths; geometry comes from the shared JS mask."""
from PIL import Image, ImageDraw
from subprocess import check_output
from random import Random
from math import sin, cos
from ground import point
PATHS={
 'saltreach_harbor': [[(0,19),(0,12),(0,5),(0,-9)],[(-23,0),(-19,0),(-9,-2),(1,-2),(12,-2),(21,-3)],[(-8,10.3),(0,10.3),(9,10.6)],[(3,8.5),(0,8.5)], [(-1,3.5),(0,3.5)]],
 'home_islet': [[(0,14),(0,-12)],[(-8,7.5),(7,7.5)],[(-8,-5.5),(7,-5.5)]],
 'smugglers_cove': [[(0,14),(0,-8)],[(-8,1),(0,1),(9,5)]],
 'wreck_point': [[(0,14),(0,4),(-7,0)],[(0,10),(8,9)]],
 'the_teeth': [[(0,14),(0,-8),(9,-9)],[(-8,9),(0,8),(8,1)],[(-5,-3),(0,-3)]],
 'gulls_rest': [[(0,13),(0,-5)]],
}
def ground(root,id):
    w,h=1024,768;classes=check_output(['node','scripts/export-place-ground.js',id],cwd=root)
    assert len(classes)==w*h
    im=Image.new('RGBA',(w,h));p=im.load();rng=Random(49+len(id))
    pal=[(116,146,88,255),(120,150,92,255),(113,144,86,255),(124,153,95,255)]
    if id=='the_teeth':pal=[(105,130,88,255),(111,137,93,255),(101,127,84,255),(115,140,97,255)]
    for y in range(h):
        for x in range(w):
            c=classes[y*w+x]
            if c in [1,2]:p[x,y]=(193,168,119,255) if c==1 else pal[int((sin(x/49)+cos(y/41)+sin((x+y)/73)+3)*.61)%4]
    d=ImageDraw.Draw(im)
    for y in range(2,h-2):
        for x in range(2,w-2):
            c=classes[y*w+x]
            if c in [1,2] and classes[(y+2)*w+x]==0:
                d.line((x,y,x,y+1),fill='#92996b')
                if x%7<3:d.point((x,y+3),fill='#83aaa0')
    for i in range(220):
        x=rng.randrange(25,w-25);y=rng.randrange(25,h-25)
        if classes[y*w+x]!=2:continue
        rx=rng.randrange(7,20);ry=rng.randrange(4,11)
        for yy in range(y-ry,y+ry):
            for xx in range(x-rx,x+rx):
                if classes[yy*w+xx]==2 and ((xx-x)/rx)**2+((yy-y)/ry)**2<.8+.15*sin(xx*.6+yy*.9):p[xx,yy]=(107,139,80,255) if i%3 else (128,154,92,255)
    for i in range(3600):
        x=rng.randrange(2,w-4);y=rng.randrange(2,h-5)
        if classes[y*w+x]==2:d.line([(x,y+2),(x,y),(x+1,y+2),(x+3,y+1)],fill=rng.choice(['#66844c','#6b8b50','#839e60','#7d9b5d']))
    mask=Image.new('L',(w,h));md=ImageDraw.Draw(mask)
    for route in PATHS[id]:
        for a,b in zip(route,route[1:]):
            p1=point(*a);p2=point(*b);length=max(abs(p2[0]-p1[0]),abs(p2[1]-p1[1]),1)
            for t in range(length+1):
                x=round(p1[0]+(p2[0]-p1[0])*t/length);y=round(p1[1]+(p2[1]-p1[1])*t/length);r=18+round(sin(x/13+y/17)*2)
                md.ellipse((x-r,y-r*.72,x+r,y+r*.72),fill=255)
    mp=mask.load()
    for y in range(3,h-3):
        for x in range(3,w-3):
            if classes[y*w+x] in [1,2] and mp[x,y]:
                p[x,y]=(193,165,121,255) if (x//12+y//9)%11 else (197,169,125,255)
                if id=='saltreach_harbor' and y<550 and (x//8+y//6)%6==0 and x%8<6 and y%6==0:p[x,y]=(171,151,111,255)
            elif classes[y*w+x]==2 and (mp[x-2,y] or mp[x+2,y] or mp[x,y+2]):
                if x%4<2:d.line((x,y,x,y+2),fill='#8aa365')
    return im
