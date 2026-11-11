"""Baked place coasts and purposeful paths; geometry comes from the shared JS mask.
Clean look (td-clean): broad grass in three ordered tones, a few soft patches, tufts and flowers
in small deliberate clusters (no scattered speckle), flat paths with a one-pixel rim, a solid
coast edge (no dotted line)."""
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
    pal=[(113,144,86,255),(117,147,89,255),(121,151,93,255)]
    if id=='the_teeth':pal=[(101,127,84,255),(106,132,89,255),(111,137,93,255)]
    for y in range(h):
        for x in range(w):
            c=classes[y*w+x]
            if c in [1,2]:p[x,y]=(193,168,119,255) if c==1 else pal[min(2,max(0,int((sin(x/61)+cos(y/53)+sin((x+y)/89)+3)/2)))]
    d=ImageDraw.Draw(im)
    for y in range(2,h-2):
        for x in range(2,w-2):
            c=classes[y*w+x]
            if c in [1,2] and classes[(y+2)*w+x]==0:
                d.line((x,y,x,y+1),fill='#92996b')
    for i in range(110):
        x=rng.randrange(25,w-25);y=rng.randrange(25,h-25)
        if classes[y*w+x]!=2:continue
        rx=rng.randrange(7,20);ry=rng.randrange(4,11)
        for yy in range(y-ry,y+ry):
            for xx in range(x-rx,x+rx):
                if classes[yy*w+xx]==2 and ((xx-x)/rx)**2+((yy-y)/ry)**2<.8+.15*sin(xx*.6+yy*.9):p[xx,yy]=(107,139,80,255) if i%3 else (128,154,92,255)
    # Tufts in small clusters of three to five, one dark and one light shade per cluster.
    for i in range(170):
        cx=rng.randrange(20,w-20);cy=rng.randrange(20,h-20);dark=i%2==0
        for k in range(rng.randrange(3,6)):
            x=cx+rng.randrange(-9,10);y=cy+rng.randrange(-5,6)
            if 2<=x<w-4 and 2<=y<h-5 and classes[y*w+x]==2:
                d.line([(x,y+2),(x,y),(x+1,y+2),(x+3,y+1)],fill='#66844c' if dark else '#839e60')
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
                p[x,y]=(193,165,121,255)
                if id=='saltreach_harbor' and y<550 and (x//8+y//6)%6==0 and x%8<6 and y%6==0:p[x,y]=(171,151,111,255)
                # One-pixel rim where the path meets grass: darker below, lighter above.
                if classes[(y+1)*w+x]==2 and not mp[x,y+1]:p[x,y]=(172,148,106,255)
                elif classes[y*w+x]==2 and (not mp[x-1,y] or not mp[x+1,y] or not mp[x,y-1]):p[x,y]=(181,157,113,255)
    # A few flower clusters beside the paths, cream and rose (gold stays for lights).
    for i in range(60):
        x=rng.randrange(8,w-8);y=rng.randrange(8,h-8)
        if classes[y*w+x]!=2 or mp[x,y] or not (mp[x,y+6] or mp[x,y-6] or mp[x+7,y] or mp[x-7,y]):continue
        for dx,dy in [(0,0),(3,1),(1,3)][:2+i%2]:
            if classes[(y+dy)*w+x+dx]==2 and not mp[x+dx,y+dy]:
                p[x+dx,y+dy+1]=(92,120,70,255);p[x+dx,y+dy]=(236,226,196,255) if i%3 else (214,160,160,255)
    return im
