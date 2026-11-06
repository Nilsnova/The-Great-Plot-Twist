"""Five original speech-bubble emotes, drawn on the same native pixel grid as the crew."""
from common import canvas, poly
INK='#343d32'
PAPER='#ece0b8'
SKIN='#c79a68'
GREEN='#526b4a'
GOLD='#f3d58c'

def bubble():
    im,d=canvas(24,24)
    poly(d,[(4,1),(19,1),(22,4),(22,17),(19,20),(14,20),(10,23),(10,20),(4,20),(1,17),(1,4)],INK)
    poly(d,[(4,3),(19,3),(20,5),(20,16),(18,18),(13,18),(11,20),(11,18),(5,18),(3,16),(3,5)],PAPER)
    return im,d

def wave():
    im,d=bubble()
    d.rectangle((8,10,15,16),fill=INK);d.rectangle((9,10,14,15),fill=SKIN)
    for x,y in [(7,8),(10,6),(13,5),(16,8)]:
        d.rectangle((x,y,x+1,12),fill=INK);d.line((x+1,y+1,x+1,12),fill=SKIN)
    d.rectangle((10,16,15,18),fill=GREEN);d.line((5,6,4,9),fill=GOLD);d.line((18,5,19,8),fill=GOLD)
    return im

def cheer():
    im,d=bubble()
    poly(d,[(12,5),(14,9),(18,10),(15,13),(16,17),(12,15),(8,17),(9,13),(6,10),(10,9)],INK)
    poly(d,[(12,7),(13,10),(16,11),(13,12),(14,15),(12,13),(10,15),(11,12),(8,11),(11,10)],GOLD)
    for x,y in [(5,5),(18,5),(4,15),(19,15)]:d.rectangle((x,y,x+1,y+1),fill='#a66f4e')
    return im

def point():
    im,d=bubble()
    d.rectangle((5,10,11,16),fill=INK);d.rectangle((6,11,11,15),fill=SKIN)
    d.rectangle((9,8,18,11),fill=INK);d.rectangle((10,9,18,10),fill=SKIN)
    d.rectangle((12,11,14,14),fill=INK);d.rectangle((12,11,13,13),fill=SKIN)
    d.rectangle((4,12,7,17),fill=GREEN)
    return im

def lantern():
    im,d=bubble()
    d.arc((9,4,15,10),180,360,fill=INK,width=2)
    d.rectangle((8,9,16,17),fill=INK);d.rectangle((10,10,14,15),fill=GOLD)
    d.line((12,10,12,15),fill='#fff4cd');d.rectangle((7,8,17,9),fill=GREEN)
    d.line((5,11,5,14),fill=GOLD);d.line((19,11,19,14),fill=GOLD)
    return im

def shrug():
    im,d=bubble()
    d.rectangle((10,5,14,9),fill=INK);d.rectangle((11,6,13,8),fill=SKIN)
    poly(d,[(9,11),(15,11),(16,17),(8,17)],GREEN)
    d.line((9,12,7,14,5,11),fill=INK,width=2);d.line((15,12,17,14,19,11),fill=INK,width=2)
    d.rectangle((4,10,6,11),fill=SKIN);d.rectangle((18,10,20,11),fill=SKIN)
    return im

def assets():
    return {f'emote-{name}':draw() for name,draw in [('wave',wave),('cheer',cheer),('point',point),('lantern',lantern),('shrug',shrug)]}
