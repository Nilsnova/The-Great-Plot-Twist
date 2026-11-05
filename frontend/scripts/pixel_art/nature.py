"""Original forest sprites with shaded clusters, bark and selective dark outlines."""
from common import canvas, shadow, poly
from random import Random

def tree(pine=False, variant=0):
    im,d=canvas(80,112 if pine else 104)
    floor=104 if pine else 96
    shadow(d,40,floor,29,6)
    dark='#303b2c'
    poly(d,[(32,54),(47,54),(47,floor-7),(58,floor),(46,floor-2),(42,floor+2),(34,floor-2),(22,floor+1),(31,floor-10)],'#68503b',dark)
    d.rectangle((34,59,38,floor-5), fill='#93704c')
    d.rectangle((42,61,46,floor-4), fill='#4c3b30')
    for x,y in [(33,71),(39,83),(45,75),(32,89)]:
        d.line([(x,y),(x+2,y+4),(x,y+8)],fill='#43392c')
    d.line([(27,floor-2),(34,floor-7),(36,floor-18)],fill='#a18454',width=2)
    if pine:
        for cy,rx,ry in [(73,33,17),(60,31,19),(46,26,19),(31,20,18),(19,13,15)]:
            poly(d,[(40,cy-ry),(40-rx,cy+ry//2),(42-rx,cy+ry),(40,cy+ry-3),(38+rx,cy+ry),(40+rx,cy+ry//2)],'#264b38',dark)
            poly(d,[(40,cy-ry+2),(43-rx,cy+ry//2),(40,cy+ry-2),(rx+34,cy+ry//2)],'#356343')
            poly(d,[(39,cy-ry+3),(47-rx,cy+4),(36,cy+ry//2),(40,cy+2),(rx+29,cy+ry//2)],'#507c43')
            d.line([(43-rx,cy+ry//2),(52-rx,cy+ry//2+2),(58-rx,cy+ry//2-1)],fill='#6b8d49')
    else:
        # An irregular whole crown with broad leaf masses, rather than stacked rings.
        from PIL import Image, ImageDraw
        rng=Random(120+variant)
        mask=Image.new('L',im.size);md=ImageDraw.Draw(mask)
        for cx,cy,rx,ry in [(37,30,29,25),(19,39,17,22),(59,40,18,24),(39,55,29,21),(37,15,21,13)]:
            cx+=rng.randrange(-3,4);cy+=rng.randrange(-2,3)
            md.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=255)
        layer=Image.new('RGBA',im.size);ld=ImageDraw.Draw(layer)
        ld.rectangle((0,0,79,85),fill='#3d7241')
        poly(ld,[(1,44),(16,42),(22,49),(31,45),(41,54),(54,49),(76,44),(77,76),(8,79)],'#28573c')
        poly(ld,[(0,23),(14,20),(19,30),(28,33),(25,47),(10,52),(1,47)],'#326740')
        poly(ld,[(16,18),(25,6),(39,3),(51,10),(65,25),(61,35),(50,31),(43,36),(31,31),(20,37),(10,29)],'#5a803e' if variant!=1 else '#66823f')
        poly(ld,[(26,10),(37,6),(46,11),(52,20),(48,25),(35,23),(28,27),(20,24)],'#739049' if variant!=1 else '#83934b')
        poly(ld,[(22,49),(34,42),(44,47),(57,40),(68,45),(63,55),(51,59),(45,66),(30,60),(17,59)],'#3c7143')
        poly(ld,[(30,45),(37,43),(44,48),(53,44),(59,47),(48,52),(41,55),(30,51)],'#527f43')
        for points in [[(8,39),(16,42),(24,39),(29,42)],[(17,59),(26,63),(33,60),(38,63)],[(45,60),(53,57),(61,58),(68,52)],[(43,33),(49,36),(58,32),(65,35)]]:
            ld.line(points,fill='#254f38',width=2)
            ld.line([(x,y-2) for x,y in points[:-1]],fill='#69914b')
        for i in range(45):
            x=rng.randrange(7,72);y=rng.randrange(10,68)
            if mask.getpixel((x,y)) and i%3:
                ld.line([(x,y),(x+2,y),(x+3,y-1)],fill='#497742' if y>35 else '#75914a')
        # Crisp, selective contour; lower edge is darker than the lit upper edge.
        for y in range(1,84):
            for x in range(1,79):
                if mask.getpixel((x,y)) and any(not mask.getpixel((x+dx,y+dy)) for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]):
                    ld.point((x,y),fill='#263f2d' if y>34 else '#49673a')
        im.paste(layer,(0,0),mask)
    return im

def rock():
    im,d=canvas(48,36);shadow(d,24,31,19,4)
    poly(d,[(5,25),(9,13),(19,6),(29,5),(40,14),(44,26),(35,32),(15,32)],'#333c38','#232a29')
    poly(d,[(10,14),(19,7),(28,7),(33,15),(22,21),(8,22)],'#67726b')
    poly(d,[(10,15),(18,10),(24,10),(18,15),(16,20),(8,22)],'#8c9381')
    poly(d,[(23,22),(34,17),(39,24),(33,29),(23,30)],'#474d45')
    d.line([(17,8),(26,6),(31,11)],fill='#b0b09a')
    d.line([(12,29),(17,24),(20,26)],fill='#747c6c')
    return im

def shrub():
    im,d=canvas(40,32);shadow(d,20,27,17,4)
    for cx,cy,rx,ry in [(12,19,10,9),(27,20,10,9),(20,12,12,9)]:
        d.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill='#2d4c33')
        d.ellipse((cx-rx+1,cy-ry+1,cx+rx-2,cy+ry-3),fill='#4e783f')
        d.ellipse((cx-rx+3,cy-ry+1,cx+rx-4,cy+ry-6),fill='#799451')
    for x,y in [(9,20),(24,11),(30,22)]:
        d.rectangle((x,y,x+2,y+2),fill='#a76c43');d.point((x,y),fill='#d49b5b')
    return im

def flowers():
    im,d=canvas(24,24)
    for x,y in [(5,11),(12,6),(18,13)]:
        d.line([(x,y+3),(x,y+8)],fill='#496b3d')
        d.line([(x,y+6),(x-3,y+3)],fill='#7e9952')
        d.rectangle((x-2,y,x+2,y+2),fill='#dfd8a0');d.rectangle((x,y-2,x+1,y+4),fill='#e8e4ba');d.point((x,y+1),fill='#bba05f')
    return im

def undergrowth(name):
    im,d=canvas(32,40 if name=='reeds' else 32)
    h=im.height;shadow(d,16,h-4,12,3)
    if name=='mushrooms':
        for x,y,size in [(9,17,6),(21,11,7),(24,23,4)]:
            d.rectangle((x-1,y+2,x+1,h-7),fill='#a9a56a');d.ellipse((x-size,y-size//2,x+size,y+3),fill='#5d4b33');d.ellipse((x-size+1,y-size//2,x+size-1,y+1),fill='#c1ac68');d.line([(x-2,y-2),(x+1,y-3)],fill='#e4ce8d')
    else:
        for x,top in [(7,h-17),(12,h-25),(17,h-20),(22,h-28),(25,h-15)]:
            d.line([(16,h-5),(x,top)],fill='#3d633b',width=2)
            d.line([(16,h-5),(x+1,top+2)],fill='#88a45e')
            if name=='reeds':d.line([(x,top),(x+1,top-6)],fill='#aa9e5d',width=2)
            if name=='fern':
                for yy in range(top+4,h-7,4):
                    d.line([(x,yy),(x-4,yy-3)],fill='#4f7d43',width=2);d.line([(x,yy+1),(x+5,yy-3)],fill='#789c53')
    return im
