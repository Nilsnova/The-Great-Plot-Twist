"""Small original coastal pixel props, all authored at a shared native pixel grid."""
from common import canvas, shadow, poly

def prop(name):
    sizes={'jetty':(48,112),'boat':(64,40),'crate':(24,24),'barrel':(24,32),'rope-coil':(32,20),'lantern':(16,24),'bench':(48,32),'buoy':(24,32),'driftwood':(40,24),'gull':(24,24),'sign':(32,40)}
    w,h=sizes[name];im,d=canvas(w,h);ink='#35382c'
    if name=='jetty':
        for x in [10,35]:d.rectangle((x,2,x+3,105),fill='#433c30')
        for y in range(4,104,7):
            d.rectangle((8,y,40,y+5),fill='#8d7048');d.line([(10,y),(38,y)],fill='#b69a60');d.line([(12,y+3),(25,y+3)],fill='#6f593d')
        for x,y in [(6,12),(38,36),(6,65),(38,95)]:d.rectangle((x,y,x+4,y+11),fill=ink);d.rectangle((x+1,y+1,x+3,y+9),fill='#a28a55')
    elif name=='boat':
        shadow(d,32,32,27,5);poly(d,[(5,18),(12,9),(40,5),(59,13),(59,21),(45,31),(16,32),(6,25)],'#473b2d',ink)
        poly(d,[(8,18),(15,12),(40,8),(55,14),(54,20),(43,27),(17,28),(9,23)],'#ad8b54')
        poly(d,[(13,18),(20,14),(40,11),(50,15),(47,21),(39,24),(19,24)],'#514c36')
        for x in [23,39]:d.line([(x,13),(x-3,25)],fill='#bba064',width=3)
        d.line([(16,9),(44,30)],fill='#503f2e',width=3);d.line([(17,9),(44,29)],fill='#c3aa70')
    else:
        shadow(d,w//2,h-3,max(4,w//2-3),3)
        if name=='crate':
            d.rectangle((3,4,20,20),fill=ink);d.rectangle((4,5,19,19),fill='#967347')
            for x in [7,12,17]:d.line([(x,6),(x,18)],fill='#674d34')
            d.line([(5,6),(18,18)],fill='#c1a36a',width=2);d.line([(18,6),(5,18)],fill='#c1a36a',width=2)
        elif name=='barrel':
            d.ellipse((3,4,21,28),fill=ink);d.rectangle((4,8,20,24),fill='#987749');d.ellipse((4,4,20,10),fill='#b59862')
            d.ellipse((7,5,17,8),fill='#6d5738')
            for x in [7,12,17]:d.line([(x,11),(x,25)],fill='#715936')
            for y in [12,23]:d.rectangle((4,y,20,y+2),fill='#424d40');d.line([(5,y),(18,y)],fill='#77816a')
        elif name=='rope-coil':
            for n in range(4):d.ellipse((3+n*3,4+n,28-n*3,16-n),outline='#7d7247',width=2)
            d.line([(4,8),(11,4),(24,5)],fill='#c3ad72');d.line([(24,13),(30,16)],fill='#b5a166',width=2)
        elif name=='lantern':
            d.arc((5,1,11,8),180,360,fill=ink,width=2);d.rectangle((3,7,13,21),fill=ink);d.rectangle((5,9,11,18),fill='#d9b864');d.rectangle((7,9,9,18),fill='#f3dc91');d.line([(3,20),(13,20)],fill='#758268')
        elif name=='bench':
            for x in [5,40]:d.rectangle((x,9,x+2,29),fill=ink)
            for y in [8,13]:d.rectangle((5,y,42,y+3),fill='#a18b56');d.line([(6,y),(40,y)],fill='#c0aa70')
            d.rectangle((3,20,44,24),fill='#7d6e46');d.line([(4,20),(43,20)],fill='#bba16a')
        elif name=='buoy':
            poly(d,[(7,10),(16,10),(20,26),(3,26)],'#88794b',ink);poly(d,[(6,16),(17,16),(19,22),(4,22)],'#b06f45');d.rectangle((9,4,14,10),fill='#baac73');d.arc((9,1,14,6),180,360,fill=ink)
        elif name=='driftwood':
            poly(d,[(3,17),(16,12),(20,4),(24,4),(23,12),(34,9),(37,12),(28,18),(12,21)],'#736746',ink);d.line([(7,17),(19,15),(29,12)],fill='#b2a071');d.line([(17,13),(22,7)],fill='#9d8b5e')
        elif name=='gull':
            d.line([(9,17),(8,21),(5,21)],fill='#967d49');d.line([(15,17),(15,21),(18,21)],fill='#967d49')
            d.ellipse((4,8,18,18),fill=ink);d.ellipse((5,8,18,16),fill='#c9ccb2');d.ellipse((12,3,20,11),fill=ink);d.ellipse((13,4,19,11),fill='#e3ddbc');d.point((17,6),fill=ink);poly(d,[(20,7),(23,9),(20,10)],'#bb9953');d.line([(7,11),(13,14),(16,13)],fill='#8e9f8b')
        elif name=='sign':
            d.rectangle((14,12,17,36),fill=ink);d.rectangle((15,13,16,35),fill='#8d7449');poly(d,[(3,7),(24,6),(30,12),(24,18),(3,17)],'#a18b5c',ink);d.line([(7,11),(22,11)],fill='#e0c78b');d.line([(11,14),(20,14)],fill='#675d3d')
    return im
