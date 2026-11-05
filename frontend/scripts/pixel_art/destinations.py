"""Staged harbour structures and boats in the approved native pixel language."""
from common import canvas, shadow, poly
from buildings import cottage
from PIL import ImageDraw

def office():
    im,d=canvas(128,160);ink='#393b2e'
    d.rectangle((52,24,79,83),fill=ink);d.rectangle((54,26,77,82),fill='#b5ad87')
    poly(d,[(45,25),(65,8),(86,25)],'#3d5040',ink);d.line([(50,23),(65,11),(80,23)],fill='#768464')
    d.ellipse((57,32,74,49),fill='#4a5140');d.ellipse((59,34,72,47),fill='#d8c58c')
    d.line([(65,36),(65,41),(69,43)],fill='#526849')
    house=cottage();im.alpha_composite(house,(0,32));d=ImageDraw.Draw(im)
    d.rectangle((27,100,45,105),fill='#3c665d');d.line([(29,102),(42,102)],fill='#b8bd85')
    d.rectangle((105,95,112,119),fill='#476a58');poly(d,[(111,95),(119,100),(111,105)],'#b58951')
    return im

def beacon():
    im,d=canvas(64,128);ink='#333c31';shadow(d,32,114,23,6)
    poly(d,[(16,113),(23,45),(43,45),(49,113)],ink)
    poly(d,[(19,111),(25,47),(40,47),(46,111)],'#c0b894');poly(d,[(34,47),(40,47),(46,111),(36,111)],'#8a957e')
    poly(d,[(21,77),(43,77),(44,91),(20,91)],'#ac7250')
    d.rectangle((19,27,45,47),fill=ink);d.rectangle((22,30,42,43),fill='#638777')
    for x in [23,32]:d.rectangle((x,31,x+6,40),fill='#c2c19b')
    poly(d,[(16,27),(32,15),(48,27)],'#4b6c57',ink);d.line([(32,14),(32,6)],fill=ink)
    d.rectangle((27,96,36,113),fill=ink);d.rectangle((29,98,34,111),fill='#506f59')
    d.rectangle((14,113,50,117),fill='#697c62');d.line([(16,114),(48,114)],fill='#bcb68c')
    return im

def signal():
    im,d=canvas(112,112);ink='#333b30';shadow(d,56,100,43,6)
    d.rectangle((22,57,94,99),fill=ink);d.rectangle((24,59,91,97),fill='#b6ae84')
    d.rectangle((84,59,91,97),fill='#929472')
    poly(d,[(14,58),(29,37),(88,37),(102,58),(96,62),(19,62)],'#3c4a37',ink)
    for y in range(42,58,5):d.line([(30-(y-40)//2,y),(87+(y-40)//2,y)],fill='#5d7250',width=2)
    d.line([(56,38),(56,5)],fill=ink,width=2)
    for y,width in [(11,14),(19,19),(28,24)]:d.line([(56-width//2,y),(56+width//2,y)],fill='#8b9871');d.point((56,y),fill='#d0bc79')
    d.rectangle((49,75,66,99),fill=ink);d.rectangle((52,78,63,97),fill='#4c6952');d.point((61,88),fill='#d1b974')
    for x in [30,74]:d.rectangle((x,70,x+10,82),fill=ink);d.rectangle((x+2,72,x+8,80),fill='#7c9e8b')
    d.rectangle((29,90,41,94),fill='#6e7950');d.line([(31,91),(38,91)],fill='#c4b477')
    return im

def pier():
    im,d=canvas(96,128);ink='#3c3d2f'
    for x in [19,73]:d.rectangle((x,33,x+3,114),fill=ink)
    for y in range(39,115,7):
        d.rectangle((16,y,80,y+5),fill='#8b7048');d.line([(18,y),(78,y)],fill='#b59961');d.line([(29,y+3),(57,y+3)],fill='#6a573c')
    d.rectangle((37,8,58,40),fill='#806746')
    for y in range(10,39,5):d.line([(38,y),(57,y)],fill='#b29a64')
    for x,y in [(14,46),(78,46),(14,103),(78,103)]:d.rectangle((x,y,x+5,y+13),fill=ink);d.rectangle((x+1,y+1,x+4,y+11),fill='#9e8758')
    d.line([(12,117),(39,120),(68,119),(83,116)],fill='#72a39a');d.line([(24,123),(58,124),(73,122)],fill='#4d857d')
    return im

def ship(dark=False):
    w=128 if dark else 96;im,d=canvas(w,112);ink='#2c3730';cx=w//2
    shadow(d,cx,102,cx-8,4)
    poly(d,[(7,86),(w-10,82),(w-17,97),(w-34,103),(25,102),(12,96)],'#624c35',ink)
    d.line([(12,89),(w-17,86)],fill='#b99d60',width=2);d.line([(20,99),(w-36,100)],fill='#8c7146')
    d.line([(cx-8,14),(cx-8,86)],fill='#423c2c',width=3);d.line([(cx-7,15),(cx-7,82)],fill='#a6935a')
    sail='#405453' if dark else '#dbcd9d';lit='#586b63' if dark else '#ecdeb0'
    poly(d,[(cx-12,19),(16,76),(cx-12,79)],sail,ink);poly(d,[(cx-10,19),(w-16,74),(cx-10,78)],sail,ink)
    poly(d,[(cx-13,23),(24,72),(cx-13,74)],lit);poly(d,[(cx-8,24),(w-23,70),(cx-8,74)],lit)
    d.line([(cx-13,51),(cx-33,72)],fill='#708176' if dark else '#b9a974')
    d.line([(cx-8,49),(cx+10,73)],fill='#344744' if dark else '#b9a974')
    if dark:
        d.line([(cx+23,25),(cx+23,84)],fill='#413e2d',width=2)
        poly(d,[(cx+25,29),(w-7,73),(cx+25,77)],'#334846',ink)
        d.line([(cx+27,36),(w-13,70)],fill='#60736b')
    poly(d,[(cx-6,14),(cx+8,18),(cx-6,22)],'#ad8150')
    return im
