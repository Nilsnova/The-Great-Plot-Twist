"""Original open-state landmarks. Hand-authored integer pixels in the approved coastal palette."""
from common import canvas, shadow, poly
INK='#343d32'

def lens_hall():
    im,d=canvas(144,160);shadow(d,72,146,63,8)
    poly(d,[(18,142),(18,76),(70,48),(125,77),(125,142)],'#b7b49a',INK)
    poly(d,[(87,65),(125,77),(125,142),(87,142)],'#87947c')
    for y in range(90,139,10):
        d.line((20,y,122,y),fill='#d7cfac')
        for x in range(24+(y%3)*8,120,22):d.line((x,y-8,x,y),fill='#77856c')
    poly(d,[(9,80),(33,42),(78,30),(136,76),(125,83),(74,43),(24,84)],'#405c4a',INK)
    for x,y in [(27,68),(38,53),(54,47),(80,44),(98,57),(116,68)]:d.line((x,y,x+13,y+1),fill='#718260',width=2)
    d.rectangle((59,99,86,143),fill=INK);d.rectangle((63,103,82,141),fill='#6a5840');d.line((66,105,66,138),fill='#aa9261');d.rectangle((77,120,79,122),fill='#f3d58c')
    for x in [30,99]:
        d.rectangle((x,99,x+15,119),fill=INK);d.rectangle((x+3,102,x+12,116),fill='#9cba9c');d.line((x+7,102,x+7,116),fill='#425c4a');d.line((x+2,109,x+13,109),fill='#425c4a')
    # A small lens lantern at the ridge, with a warm, stepped halo.
    d.rectangle((64,15,83,43),fill=INK);d.rectangle((67,19,80,38),fill='#f3d58c');d.rectangle((71,21,77,36),fill='#fff0ba');d.line((74,18,74,40),fill='#94805a')
    poly(d,[(61,18),(68,9),(79,9),(86,18)],'#586e50',INK)
    d.line((19,144,125,144),fill='#d7cfac',width=3)
    for x in [17,124]:d.line((x,145,x-4,134),fill='#8da363');d.line((x,145,x+5,130),fill='#a3ad70')
    return im

def lantern_string():
    im,d=canvas(160,48);d.line([(2,7),(22,14),(47,19),(79,22),(111,19),(138,13),(157,7)],fill=INK,width=2)
    for i,(x,y) in enumerate([(22,14),(47,19),(79,22),(111,19),(138,13)]):
        d.line((x,y,x,y+5),fill='#ab9364');d.rectangle((x-5,y+5,x+5,y+17),fill=INK)
        d.rectangle((x-3,y+7,x+3,y+15),fill=['#e8ca7d','#c68a64','#a2ba91'][i%3]);d.line((x-1,y+7,x-1,y+15),fill='#f8e4aa')
    return im

def wall_lights():
    im,d=canvas(128,96);shadow(d,64,84,58,6)
    for x in [10,112]:d.rectangle((x,21,x+5,87),fill=INK);d.rectangle((x+1,23,x+3,85),fill='#8e7650')
    d.rectangle((6,17,121,71),fill=INK);d.rectangle((10,21,117,67),fill='#927b51')
    d.rectangle((13,24,114,64),fill='#425b45');d.line((13,25,114,25),fill='#c9b17b')
    for x in [27,51,75,99]:
        d.rectangle((x-5,31,x+5,46),fill=INK);d.rectangle((x-3,33,x+3,43),fill='#efd38c');d.rectangle((x-8,51,x+8,57),fill='#b9ae88')
    return im

def assets():return {'lens-hall-open':lens_hall(),'festival-lantern-string':lantern_string(),'wall-of-lights-open':wall_lights()}
