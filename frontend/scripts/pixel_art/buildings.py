"""Original pixel buildings matched to the existing story doorway and lamp anchors."""
from common import canvas, shadow, poly

def cottage(interior=False, glow=False):
    im,d=canvas(128,128); ink='#433b30'
    if glow:
        for x in [29,85]: d.rectangle((x,80,x+13,96),fill=(245,202,101,225))
        return im
    shadow(d,64,115,53,8)
    if interior:
        d.rectangle((17,32,112,114),fill=ink);d.rectangle((20,35,109,111),fill='#82694a')
        for y in range(38,112,8):
            d.line([(21,y),(108,y)],fill='#ae8d5e')
            for x in range(23+(y%3)*9,110,24):d.line([(x,y),(x,y+7)],fill='#634f3c')
        d.rectangle((20,33,109,39),fill='#c5b58a');d.rectangle((20,38,25,110),fill='#c5b58a');d.rectangle((104,38,109,110),fill='#ab9c72')
        d.rectangle((84,73,110,91),fill=ink);d.rectangle((84,71,110,85),fill='#8e6742');d.line([(87,74),(108,74)],fill='#ba9259')
        d.rectangle((88,75,98,81),fill='#e6d29a');d.line([(90,77),(96,77)],fill='#8c8058');d.rectangle((101,75,104,79),fill='#3b5143')
        d.rectangle((102,46,109,64),fill='#3b5f61');d.rectangle((104,47,107,62),fill='#91b6a0')
        d.rectangle((29,52,51,88),fill='#5e4b39');d.rectangle((31,50,49,68),fill='#b3b48b');d.rectangle((31,69,49,84),fill='#8a8565')
        return im
    # A wide front-facing roof keeps the map close to overhead, with little side projection.
    d.rectangle((20,60,109,112),fill=ink);d.rectangle((22,62,106,109),fill='#b5a578')
    d.rectangle((24,64,104,105),fill='#d2c294');d.rectangle((101,64,107,109),fill='#99865e')
    for y in range(70,108,8):
        for x in range(25+(y%3)*8,101,24):d.line([(x,y),(x+10,y)],fill='#c0b084')
    poly(d,[(9,59),(28,25),(98,25),(119,59),(114,65),(14,65)],'#563f32',ink)
    poly(d,[(12,57),(30,27),(96,27),(115,57)],'#966048')
    for y in range(31,58,6):
        a=29-(y-27)//2;b=97+(y-27)//2
        d.line([(a,y),(b,y)],fill='#bd8052');d.line([(a,y+2),(b,y+2)],fill='#734834')
        for x in range(a+3+(y%4)*3,b-3,11):d.line([(x,y-3),(x+2,y)],fill='#784d37')
    d.rectangle((12,59,116,63),fill='#45392f');d.line([(15,60),(113,60)],fill='#ba7950')
    d.rectangle((87,13,98,39),fill=ink);d.rectangle((89,15,96,38),fill='#887c67');d.rectangle((86,12,99,16),fill='#b0a188')
    d.line([(90,23),(96,23)],fill='#b4a68c');d.line([(88,31),(94,31)],fill='#5f5c4e')
    d.rectangle((53,78,75,114),fill=ink);d.rectangle((56,80,72,111),fill='#485e4c')
    for x in [58,64,70]:d.line([(x,82),(x,108)],fill='#687955')
    d.rectangle((66,94,69,96),fill='#c9b16b');d.rectangle((51,112,77,116),fill='#82775a');d.line([(53,113),(75,113)],fill='#c1b287')
    for x in [28,84]:
        d.rectangle((x,78,x+16,98),fill=ink);d.rectangle((x+2,80,x+14,96),fill='#587d79')
        d.rectangle((x+3,81,x+12,87),fill='#a5b3a0');d.line([(x+8,80),(x+8,96)],fill='#a79667');d.line([(x+2,89),(x+14,89)],fill='#a79667')
        d.rectangle((x-2,98,x+18,101),fill='#73583b');d.rectangle((x,100,x+16,105),fill='#3d603c')
        for xx in [x+2,x+7,x+12]:d.point((xx,99),fill='#d3ae6f')
    return im

def boathouse():
    im,d=canvas(96,96);shadow(d,48,88,40,6);ink='#343a2d'
    d.rectangle((13,42,83,87),fill=ink);d.rectangle((16,45,80,84),fill='#5f7057')
    for x in range(18,81,7):d.line([(x,46),(x,83)],fill='#3d5142');d.line([(x+1,47),(x+1,82)],fill='#7f8963')
    poly(d,[(8,43),(25,18),(70,18),(88,43),(84,47),(12,47)],'#3f3c30',ink)
    for y in range(22,43,5):d.line([(26-(y-20)//2,y),(69+(y-20)//2,y)],fill='#a0724b',width=3)
    d.rectangle((24,57,70,86),fill=ink);d.rectangle((26,59,68,84),fill='#59674d');d.line([(47,59),(47,84)],fill=ink)
    d.line([(29,61),(44,80)],fill='#a29061',width=2);d.line([(65,61),(50,80)],fill='#a29061',width=2)
    d.rectangle((38,31,54,37),fill='#474a35');d.line([(40,33),(51,33)],fill='#b3a76b')
    return im

def lighthouse():
    im,d=canvas(96,208);shadow(d,48,192,36,8);ink='#343a31'
    poly(d,[(25,190),(31,65),(64,65),(72,190)],ink)
    poly(d,[(28,188),(34,68),(61,68),(68,188)],'#b9b8a1')
    poly(d,[(51,68),(61,68),(68,188),(55,188)],'#8d9787')
    poly(d,[(31,124),(65,124),(66,145),(29,145)],'#985d45');d.line([(32,126),(64,126)],fill='#bc7e57')
    for y in [79,91,105,151,162,175]:
        d.line([(32 if y<145 else 29,y),(43,y)],fill='#d0cbb1');d.line([(54,y+4),(64,y+4)],fill='#778474')
    d.rectangle((40,166,56,192),fill=ink);d.rectangle((43,168,53,190),fill='#53665b');d.rectangle((51,180,52,181),fill='#b5a268')
    d.rectangle((43,95,51,108),fill=ink);d.rectangle((45,97,49,106),fill='#5f7e78')
    d.rectangle((27,42,68,68),fill=ink);d.rectangle((30,45,65,64),fill='#92a397')
    for x in [31,43,55]:d.rectangle((x,46,x+7,60),fill='#567671');d.line([(x,46),(x+5,46)],fill='#c2d0b3')
    d.rectangle((25,65,70,70),fill='#46564c');d.line([(26,66),(69,66)],fill='#a4ad94')
    poly(d,[(23,42),(46,25),(50,25),(72,42)],ink);poly(d,[(27,40),(47,28),(67,40)],'#61786a')
    d.line([(48,24),(48,10)],fill=ink);poly(d,[(49,10),(63,14),(49,18)],'#b4824f')
    d.rectangle((21,191,75,195),fill='#737e6c');d.line([(23,191),(72,191)],fill='#c0bba1')
    return im
