"""Original harbor and home sprites with selective outlines and clustered pixels."""
from common import canvas, shadow, poly
INK='#393c30'
def window(d,x,y,w=12,h=15,bars=False):
    d.rectangle((x,y,x+w,y+h),fill=INK);d.rectangle((x+2,y+2,x+w-2,y+h-2),fill='#7a9b87')
    d.line((x+3,y+3,x+w-3,y+3),fill='#b9c5a1')
    for xx in range(x+4,x+w,4 if bars else w):d.line((xx,y+1,xx,y+h-1),fill=INK if bars else '#b4ab79')
    d.line((x-1,y+h+1,x+w+1,y+h+1),fill='#786b4b')
def house(kind):
    w,h={'jail':(112,112),'market-hall':(144,128),'prediction-kiosk':(80,96),'sports-pavilion':(144,128),'cabin':(96,96),'workshop':(112,112)}[kind]
    im,d=canvas(w,h);cx=w//2;bottom=h-12;roof=h//2;left=15;right=w-16
    shadow(d,cx,bottom+1,cx-8,6)
    stone=kind=='jail';wall='#9d9e7f' if stone else '#b5a578'
    d.rectangle((left,roof-2,right,bottom),fill=INK);d.rectangle((left+2,roof,right-3,bottom-3),fill=wall)
    d.rectangle((right-9,roof+1,right-3,bottom-3),fill='#8c8965')
    for y in range(roof+5,bottom-2,8):
        for x in range(left+5+(y%3)*6,right-9,19):d.line((x,y,x+8,y),fill='#7c8368' if stone else '#c8b68a')
    color='#56644a' if kind in ['market-hall','sports-pavilion'] else '#925f47'
    poly(d,[(7,roof),(23,24),(w-25,24),(w-8,roof),(w-12,roof+5),(11,roof+5)],color,INK)
    for y in range(28,roof,5):
        inset=(roof-y)//2+9;d.line((inset,y,w-inset-2,y),fill='#7d8c5c' if color=='#56644a' else '#b77f54')
        for x in range(inset+4+(y%3)*5,w-inset-3,14):d.line((x,y-3,x+2,y),fill='#40543e' if color=='#56644a' else '#704b38')
    d.line((10,roof+2,w-11,roof+2),fill=INK,width=2)
    d.rectangle((cx-10,bottom-29,cx+10,bottom),fill=INK);d.rectangle((cx-7,bottom-26,cx+7,bottom-2),fill='#4b6551')
    d.line((cx-5,bottom-24,cx-5,bottom-4),fill='#768567');d.point((cx+4,bottom-12),fill='#c1b079')
    d.rectangle((cx-13,bottom,cx+13,bottom+3),fill='#85816a');d.line((cx-11,bottom+1,cx+11,bottom+1),fill='#c2b38a')
    for x in [left+6,right-20]:window(d,x,bottom-32,bars=stone)
    if kind=='jail':
        d.rectangle((cx-16,roof+8,cx+16,roof+14),fill='#586b59');d.line((cx-12,roof+10,cx+12,roof+10),fill='#a7b296')
    if kind=='market-hall':
        for x in range(18,w-20,12):d.rectangle((x,roof+8,x+10,roof+20),fill='#b7ba8c' if x%24 else '#668b74')
        d.line((18,roof+21,w-20,roof+21),fill=INK)
        for x in [20,w-39]:d.rectangle((x,bottom-7,x+16,bottom),fill='#6e7048');d.rectangle((x+2,bottom-10,x+5,bottom-7),fill='#c0835b')
    if kind=='prediction-kiosk':
        d.rectangle((18,roof+8,w-19,bottom-13),fill=INK);d.rectangle((21,roof+11,w-22,bottom-16),fill='#9ba984')
        for x,y in [(27,65),(35,59),(42,67),(49,56)]:d.rectangle((x,y,x+3,y+3),fill='#526e5d')
        d.rectangle((14,bottom-12,w-15,bottom-7),fill='#8c704b');d.line((16,bottom-12,w-17,bottom-12),fill='#c4ac7b')
    if kind=='sports-pavilion':
        for x in [27,w-28]:
            d.line((x,14,x,roof+12),fill=INK,width=2);poly(d,[(x+1,15),(x+13,18),(x+1,25)],'#a67558')
        d.ellipse((cx-9,roof+7,cx+9,roof+22),fill='#c3bb90',outline=INK);d.line((cx-5,roof+13,cx+5,roof+17),fill='#60745b')
    if kind=='workshop':
        d.rectangle((w-34,13,w-24,34),fill='#6b6b56');d.rectangle((w-36,11,w-22,15),fill='#b7ae89')
        d.line((25,bottom-23,35,bottom-12),fill='#d1bc88',width=2);d.line((35,bottom-23,25,bottom-12),fill='#657f71',width=2)
    return im

def greenhouse():
    im,d=canvas(112,96);shadow(d,56,84,47,6)
    poly(d,[(13,43),(31,18),(80,18),(100,43),(97,83),(15,83)],'#364c3b',INK)
    poly(d,[(17,43),(33,22),(78,22),(95,43),(92,79),(19,79)],'#8fae93')
    poly(d,[(33,22),(39,25),(22,46),(20,74),(18,44)],'#bad0aa')
    for x in [33,54,76]:d.line((x,24,x,80),fill='#567960',width=2)
    d.line((18,44,94,44),fill='#45654e',width=2);d.line((19,61,93,61),fill='#628770',width=2)
    for x in [25,39,72,85]:
        d.rectangle((x-3,72,x+5,80),fill='#896a4b');d.line((x,74,x,61),fill='#4b703e',width=2)
        d.ellipse((x-5,63,x+2,67),fill='#5f8245');d.ellipse((x,59,x+6,64),fill='#75924f')
    d.rectangle((47,59,65,83),outline='#34523d',width=2);d.rectangle((60,70,62,72),fill='#bfb887')
    return im

def windmill():
    im,d=canvas(112,160);shadow(d,56,146,32,6)
    poly(d,[(29,144),(42,54),(71,54),(85,144)],INK);poly(d,[(32,141),(45,56),(68,56),(81,141)],'#c0b591')
    poly(d,[(58,56),(68,56),(81,141),(63,141)],'#93987b')
    poly(d,[(35,56),(56,32),(78,56)],'#955f48',INK)
    d.rectangle((48,121,65,144),fill=INK);d.rectangle((51,124,62,142),fill='#58705a');window(d,51,86,10,13)
    for a,b,c,e in [(51,8,61,63),(61,53,104,63),(51,63,61,111),(8,53,51,63)]:
        d.rectangle((a,b,c,e),fill=INK);d.rectangle((a+2,b+2,c-2,e-2),fill='#c5bc92')
        if c-a>e-b:
            for x in range(a+4,c-1,7):d.line((x,b+2,x,e-2),fill='#7d8c6b')
        else:
            for y in range(b+4,e-1,7):d.line((a+2,y,c-2,y),fill='#7d8c6b')
    d.ellipse((50,52,62,64),fill='#8b7351',outline=INK);d.ellipse((54,56,58,60),fill='#bbaa79')
    return im

def furniture(kind):
    w,h={'notice-board':(48,64),'captains-table':(64,48),'build-plot':(144,96),'harbour-office-glow':(128,160)}[kind]
    im,d=canvas(w,h)
    if kind=='harbour-office-glow':
        for x in [29,85]:d.rectangle((x,112,x+13,128),fill=(245,202,101,235))
    elif kind=='notice-board':
        shadow(d,24,57,20,4)
        for x in [10,35]:d.rectangle((x,25,x+3,58),fill=INK);d.line((x+1,34,x+1,56),fill='#9e8556')
        d.rectangle((5,14,43,44),fill=INK);d.rectangle((8,17,40,41),fill='#816744')
        poly(d,[(3,14),(10,7),(38,7),(45,14)],'#596f4c',INK)
        d.rectangle((15,20,33,36),fill='#dcc99a');d.line((19,24,29,24),fill='#766c4a');d.line((18,28,30,28),fill='#9b9168');d.point((24,21),fill='#c5ac69')
    elif kind=='captains-table':
        shadow(d,32,40,28,5)
        for x in [11,49]:d.rectangle((x,23,x+4,41),fill=INK)
        poly(d,[(6,14),(52,11),(59,31),(10,34)],'#98744b',INK);d.line((10,16,50,13),fill='#bea073')
        poly(d,[(19,17),(43,16),(45,27),(20,29)],'#d0c298',INK)
        d.line((23,23,29,20,36,25,40,20),fill='#68876a');d.rectangle((10,23,15,27),fill='#4e6c5e')
    else:
        poly(d,[(5,22),(120,8),(139,68),(24,89)],'#607548');poly(d,[(9,25),(118,12),(134,65),(26,84)],'#b59c70')
        for x,y in [(7,24),(120,11),(136,67),(25,86)]:d.rectangle((x-2,y-6,x+2,y+2),fill=INK);d.rectangle((x-1,y-5,x+1,y),fill='#c7b78a')
        d.line((7,20,120,7,137,63),fill='#d1c49b');d.line((7,24,25,82,136,67),fill='#b7b68a')
    return im

def assets():
    result={kind:house(kind) for kind in ['jail','market-hall','prediction-kiosk','sports-pavilion','cabin','workshop']}
    result.update({'greenhouse':greenhouse(),'windmill':windmill()})
    result.update({kind:furniture(kind) for kind in ['notice-board','captains-table','build-plot','harbour-office-glow']})
    return result
