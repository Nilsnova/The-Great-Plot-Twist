"""Original nautical props and reusable UI frames, with no readable case conclusions."""
from common import canvas, shadow, poly
from destinations import ship
from PIL import ImageDraw
INK='#344032'
def seal(im=None,offset=(0,0)):
    if im is None:im,d=canvas(32,32)
    else:d=ImageDraw.Draw(im)
    x,y=offset;d.ellipse((x+3,y+3,x+28,y+28),fill='#788267',outline=INK)
    d.line((x+16,y+7,x+16,y+24),fill='#d2c28f',width=2);d.line((x+10,y+16,x+22,y+16),fill='#d2c28f',width=2)
    d.arc((x+7,y+10,x+25,y+25),0,180,fill='#d2c28f',width=2)
    poly(d,[(x+9,y+10),(x+16,y+6),(x+23,y+10),(x+16,y+14)],'#cfc491',INK);d.ellipse((x+14,y+8,x+18,y+12),fill=INK)
    return im

def prop(id):
    sizes={'false-light':(96,96),'sealed-cargo':(64,64),'torn-logbook-page':(48,64),'lighthouse-lens':(48,64),'keepers-star':(32,32),'wall-lights-plaque':(128,64),'captains-board':(320,192),'coin-icon':(16,16),'wallet-icon':(24,24)}
    w,h=sizes[id];im,d=canvas(w,h)
    if id=='false-light':
        for y in [24,35,62,73]:d.rectangle((5,y,89,y+2),fill=(141,167,147,80))
        d.line((47,18,47,79),fill=INK,width=2);d.rectangle((34,32,62,66),fill=INK)
        d.rectangle((37,36,59,62),fill='#d6be77');d.rectangle((41,39,55,60),fill='#f1dda3')
        for x in [40,48,56]:d.line((x,35,x,62),fill='#7b7954')
        poly(d,[(32,33),(47,23),(64,33)],'#4d6653',INK);d.rectangle((32,64,64,68),fill='#60715b')
        for x,y in [(8,48),(57,77)]:d.rectangle((x,y,x+31,y+2),fill=(157,180,154,130))
    elif id=='sealed-cargo':
        shadow(d,32,56,28,5);d.rectangle((6,12,56,54),fill=INK);d.rectangle((9,15,53,51),fill='#92734c')
        for y in range(17,51,7):d.line((10,y,52,y),fill='#b69a68')
        d.line((10,15,52,50),fill='#5c593d',width=3);seal(im,(17,19))
    elif id=='torn-logbook-page':
        poly(d,[(7,4),(39,4),(39,49),(34,58),(28,55),(21,59),(14,56),(7,59)],'#d7c99d',INK)
        d.line((11,10,34,10),fill='#a59b74')
        for y,width in [(17,22),(23,20),(29,24),(35,15),(41,21)]:d.line((12,y,12+width,y),fill='#7d8768')
        d.line((27,43,23,52),fill='#a99d74');d.point((34,6),fill='#b4a775')
    elif id=='lighthouse-lens':
        shadow(d,24,57,20,4);poly(d,[(8,18),(24,5),(40,18),(40,49),(24,58),(8,49)],'#405b4b',INK)
        poly(d,[(11,19),(24,9),(37,19),(37,47),(24,54),(11,47)],'#95b5a0')
        for x in [16,23,30]:d.line((x,17,x,49),fill='#bad2ad');d.line((x+2,18,x+2,48),fill='#6b9482')
        for y in [22,30,38,46]:d.line((11,y,37,y),fill='#456c5b')
        d.line((24,9,24,52),fill='#d7d5ad')
    elif id=='keepers-star':
        shadow(d,16,28,12,2);poly(d,[(16,3),(20,12),(30,14),(22,20),(24,29),(16,24),(8,29),(10,20),(2,14),(12,12)],'#d1b16b',INK)
        poly(d,[(16,6),(17,15),(26,15),(18,18),(20,25),(16,21),(11,25),(13,17),(6,15),(15,14)],'#ead49a');d.ellipse((13,13,19,19),fill='#68856a',outline=INK)
    elif id=='wall-lights-plaque':
        d.rectangle((3,6,124,58),fill=INK);d.rectangle((6,9,121,55),fill='#8d805a');d.rectangle((10,13,117,51),fill='#b7ad7e')
        for x in [15,110]:
            for y in [17,47]:d.ellipse((x-2,y-2,x+2,y+2),fill='#4f6651')
        for x in range(28,105,18):d.rectangle((x,21,x+8,39),fill='#617957');d.rectangle((x+2,23,x+6,28),fill='#d8c58a')
        d.line((26,43,104,43),fill='#737d55')
    elif id=='captains-board':
        d.rectangle((2,2,w-3,h-3),fill=INK);d.rectangle((6,6,w-7,h-7),fill='#917047');d.rectangle((14,14,w-15,h-15),fill='#6d704d')
        for y in range(18,h-16,16):d.line((16,y,w-17,y),fill='#777956')
        for x,y in [(30,27),(130,30),(224,27),(77,105),(184,108)]:
            poly(d,[(x,y),(x+54,y+2),(x+52,y+53),(x+2,y+51)],'#c9bd91',INK);d.rectangle((x+21,y+6,x+31,y+14),fill='#7e9570');d.line((x+10,y+23,x+42,y+23),fill='#939779');d.ellipse((x+26,y-2,x+29,y+1),fill='#bfa66a')
    elif id=='coin-icon':
        d.ellipse((1,1,14,14),fill=INK);d.ellipse((2,2,13,13),fill='#b99c60');d.arc((3,3,12,12),110,290,fill='#e5cd8f',width=2);d.line((8,4,8,11),fill='#f0dcaa')
    elif id=='wallet-icon':
        d.rectangle((2,5,21,20),fill=INK);d.rectangle((4,7,19,18),fill='#946d49');d.line((5,7,18,7),fill='#c1a174');d.rectangle((13,11,22,16),fill='#5e6243');d.point((18,13),fill='#d2bb7f')
    return im

def frame(state):
    im,d=canvas(144,192);color={'new':'#a8a074','pinned':'#bc995c','used':'#7a9072'}[state]
    d.rectangle((1,1,142,190),fill=INK);d.rectangle((4,4,139,187),fill=color);d.rectangle((8,8,135,183),fill='#d8cba5');d.rectangle((10,10,133,181),outline='#b8ac7f')
    for x,y in [(5,5),(136,5),(5,184),(136,184)]:d.rectangle((x,y,x+2,y+2),fill='#eedbb0')
    if state=='pinned':d.ellipse((68,5,75,12),fill=INK);d.ellipse((70,6,73,9),fill='#e4cb8a')
    if state=='used':d.line((119,166,123,171,131,160),fill='#668362',width=2)
    return im

def assets():
    ids=['false-light','sealed-cargo','torn-logbook-page','lighthouse-lens','keepers-star','wall-lights-plaque','captains-board','coin-icon','wallet-icon']
    result={id:prop(id) for id in ids};result['anchor-eye-seal']=seal();ghost=ship(True);d=ImageDraw.Draw(ghost)
    for x,y,w in [(5,99,56),(53,105,65),(13,108,44)]:d.rectangle((x,y,x+w,y+1),fill=(151,179,157,140))
    result['ghost-schooner']=ghost
    for state in ['new','pinned','used']:result['clue-frame-'+state]=frame(state)
    return result
