"""Original, spoiler-free landmarks for the case-location visual stubs."""
from common import canvas, shadow, poly
from buildings import boathouse
INK='#343d32'
def cave(gate=False,raid=False):
    w,h=112,112 if raid else 96;im,d=canvas(w,h);shadow(d,56,h-10,49,6);base=h-13
    pts=[(7,base),(11,base-30),(20,base-50),(38,base-67),(70,base-69),(94,base-51),(104,base-21),(101,base)]
    poly(d,pts,'#53634b',INK)
    poly(d,[(12,base-5),(16,base-29),(27,base-47),(39,base-60),(50,base-61),(43,base-42),(32,base-28),(28,base-5)],'#829074')
    poly(d,[(72,base-62),(92,base-45),(100,base-22),(96,base-4),(82,base-6),(79,base-36)],'#3e5040')
    d.ellipse((30,base-51,82,base+11),fill=INK);d.rectangle((30,base-24,82,base+2),fill=INK)
    d.ellipse((36,base-44,76,base+7),fill='#233b32');d.rectangle((36,base-23,76,base+2),fill='#233b32')
    for x,y in [(17,base-19),(21,base-42),(38,base-58),(61,base-64),(85,base-48),(94,base-27)]:
        d.line((x,y,x+12,y-2),fill='#9ba084');d.line((x+2,y+3,x+10,y+2),fill='#42583f')
    d.line((30,base+1,82,base+1),fill='#a29e76');d.line((38,base+4,75,base+4),fill='#b7ac7e')
    if gate:
        for x in range(36,77,8):d.rectangle((x,base-35,x+4,base),fill='#8a7350');d.line((x+1,base-33,x+1,base-2),fill='#b09969')
        d.line((34,base-27,79,base-27),fill=INK,width=3);d.line((34,base-10,79,base-10),fill=INK,width=3)
    if raid:
        for x in [20,88]:d.rectangle((x,base-61,x+5,base-12),fill=INK);d.rectangle((x+1,base-60,x+4,base-13),fill='#738069')
        poly(d,[(24,base-57),(39,base-52),(24,base-39)],'#9d7253');poly(d,[(89,base-57),(75,base-52),(89,base-39)],'#9d7253')
    for x in [14,91]:d.line((x,base,x-3,base-10),fill='#819659');d.line((x,base,x+3,base-13),fill='#9aa66b')
    return im

def ruin():
    im,d=canvas(80,144);shadow(d,40,132,34,6)
    poly(d,[(15,130),(20,36),(27,39),(29,23),(37,28),(42,16),(48,31),(61,27),(67,131)],INK)
    poly(d,[(19,128),(24,39),(31,41),(33,28),(40,32),(43,24),(47,36),(58,32),(62,128)],'#96997e')
    poly(d,[(47,36),(58,32),(62,128),(49,127)],'#6e7c64')
    for y in range(43,126,12):
        d.line((23,y,58,y),fill='#b5b196')
        for x in range(28+(y%5)*2,58,15):d.line((x,y-8,x,y),fill='#596c57')
    d.rectangle((31,45,49,62),fill=INK);d.rectangle((34,48,46,59),fill='#6f9680')
    d.rectangle((31,105,49,130),fill=INK);d.rectangle((34,109,46,128),fill='#435c4a')
    for x,y in [(9,126),(66,130),(18,136)]:poly(d,[(x-6,y),(x-3,y-8),(x+5,y-6),(x+8,y)],'#748268',INK)
    d.line((20,126,24,111),fill='#829655');d.line((22,127,29,115),fill='#9aaa68')
    return im

def reef():
    im,d=canvas(96,64)
    for x,y,rx,ry in [(21,39,17,12),(47,28,20,18),(75,43,15,10)]:
        poly(d,[(x-rx,y),(x-rx+3,y-ry),(x+rx-5,y-ry-4),(x+rx,y),(x+7,y+4)],'#455648',INK)
        d.line((x-rx+4,y-ry+1,x+rx-6,y-ry-3),fill='#8d9b83');d.line((x+rx-5,y-ry,x+rx-2,y-2),fill='#607461')
        d.line((x-rx-3,y+7,x-3,y+9,x+rx+4,y+6),fill='#7fa697')
    return im

def salvage():
    im,d=canvas(144,112);shadow(d,72,99,65,7)
    poly(d,[(8,64),(116,52),(136,83),(121,99),(24,99),(13,89)],'#69533c',INK)
    for y in range(63,96,7):d.line((20,y,119,y-5),fill='#ab8b5a');d.line((24,y+2,121,y-3),fill='#4b4d37')
    poly(d,[(21,58),(35,29),(92,26),(110,54)],'#425b4a',INK)
    for x in range(32,100,13):d.line((x,34,x+4,57),fill='#7f8f65',width=2)
    d.rectangle((46,45,87,76),fill=INK);d.rectangle((49,48,84,74),fill='#806746')
    d.line((49,49,83,73),fill='#b69c6a',width=2);d.line((82,49,50,73),fill='#b69c6a',width=2)
    for x,y in [(13,80),(106,79)]:d.rectangle((x,y,x+20,y+18),fill=INK);d.rectangle((x+2,y+2,x+18,y+16),fill='#8b714e');d.line((x+3,y+3,x+17,y+15),fill='#b39a67')
    d.line((70,21,70,47),fill=INK,width=2);poly(d,[(71,22),(86,27),(71,33)],'#b38b5b')
    return im

def fog():
    im,d=canvas(192,96)
    for x,y,rx,ry in [(44,50,42,15),(104,39,61,17),(148,62,39,13)]:
        for yy in range(y-ry,y+ry,3):
            width=round(rx*max(0,1-((yy-y)/ry)**2)**.5)
            d.line((x-width,yy,x+width,yy),fill=(165,188,166,115 if yy%2 else 80),width=2)
    return im

def assets():
    return {'fog-bank':fog(),'back-room':boathouse(),'low-tide-cave':cave(),'arena-gate':cave(True),'raid-arch':cave(raid=True),
            'watchtower-ruin':ruin(),'reef':reef(),'salvage-yard':salvage()}
