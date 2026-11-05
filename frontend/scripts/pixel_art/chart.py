"""Original native-pixel chart. Geography is schematic; labels stay accessible HTML."""
from PIL import Image, ImageDraw
from random import Random
from math import sin, cos, pi
from pathlib import Path

POINTS=[(91,175,23,15),(217,156,34,21),(302,201,19,13),(112,76,24,17),(288,92,23,15),(365,65,22,16),(407,34,13,9)]
ROUTES=[(0,1),(1,2),(0,3),(1,4),(4,5),(5,6)]
def chart(relit=False):
    im=Image.new('RGBA',(448,256),'#356963');d=ImageDraw.Draw(im);rng=Random(26)
    for y in range(10,250,12):
        for x in range(8,443,19):
            if rng.random()<.65:d.line((x,y,x+4,y),fill='#4c7f74');d.point((x+6,y-1),fill='#43776d')
    for a,b in ROUTES:
        ax,ay,*_=POINTS[a];bx,by,*_=POINTS[b];dist=((bx-ax)**2+(by-ay)**2)**.5
        for t in range(0,round(dist),6):
            x=round(ax+(bx-ax)*t/dist);y=round(ay+(by-ay)*t/dist)
            d.rectangle((x,y,x+1,y+1),fill='#9baa81' if b!=6 or relit else '#56786b')
    for index,(cx,cy,rx,ry) in enumerate(POINTS):
        pts=[]
        for j in range(32):
            t=j*pi/16;r=1+.1*sin(j*2.7+index)+.07*cos(j*1.3)
            pts.append((round(cx+cos(t)*rx*r),round(cy+sin(t)*ry*r)))
        if index==6 and not relit:
            d.polygon(pts,fill='#375b53',outline='#507467');continue
        d.polygon([(x,y+3) for x,y in pts],fill='#254d43')
        d.polygon(pts,fill='#c1a877',outline='#8fa171')
        pts=[(cx+round((x-cx)*.8),cy+round((y-cy)*.74)) for x,y in pts]
        d.polygon(pts,fill='#78965c',outline='#59794b')
        for j in range(11):
            x=cx+rng.randrange(-rx//2,rx//2);y=cy+rng.randrange(-ry//2,ry//2)
            d.rectangle((x-2,y-2,x+2,y+1),fill='#4a7046');d.line((x-1,y-2,x+1,y-2),fill='#91a768')
        d.line((cx-6,cy+4,cx+5,cy-3),fill='#c4ac7d',width=2)
    if not relit:
        for cx,cy,rx,ry in [(371,46,35,15),(389,60,43,13),(409,28,27,12)]:
            for y in range(cy-ry,cy+ry,3):
                width=round(rx*(max(0,1-((y-cy)/ry)**2))**.5)
                d.line((cx-width,y,cx+width,y),fill='#799484' if y%2 else '#6b8b7b')
    # Compass, frame and soundings use the same coarse pixels as the scene art.
    d.rectangle((3,3,444,252),outline='#879b75');d.rectangle((6,6,441,249),outline='#477c6c')
    cx,cy=33,33;d.polygon([(cx,16),(cx+4,cy),(cx,48),(cx-4,cy)],fill='#bdc39a')
    d.polygon([(cx-15,cy),(cx,cy-3),(cx+15,cy),(cx,cy+3)],fill='#7ba18b');d.rectangle((cx-1,cy-1,cx+1,cy+1),fill='#d6bd7d')
    return im
if __name__=='__main__':
    folder=Path(__file__).resolve().parents[2]/'public'/'places';folder.mkdir(exist_ok=True)
    for relit in [False,True]:chart(relit).save(folder/('chart-relit.png' if relit else 'chart.png'),optimize=True)
