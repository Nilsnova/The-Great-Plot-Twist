"""Original harbor and home sprites with selective outlines and clustered pixels."""
from PIL import Image, ImageDraw
from common import canvas, shadow, poly
from place_materials import index_region, tile_surface
INK='#393c30'
def window(d,x,y,w=12,h=15,bars=False):
    d.rectangle((x,y,x+w,y+h),fill=INK);d.rectangle((x+2,y+2,x+w-2,y+h-2),fill='#7a9b87')
    d.line((x+3,y+3,x+w-3,y+3),fill='#b9c5a1')
    for xx in range(x+4,x+w,4 if bars else w):d.line((xx,y+1,xx,y+h-1),fill=INK if bars else '#b4ab79')
    d.line((x-1,y+h+1,x+w+1,y+h+1),fill='#786b4b')
def house(kind):
    w,h={'jail':(112,112),'prediction-kiosk':(80,96),'sports-pavilion':(144,128),'cabin':(96,96),'workshop':(112,112)}[kind]
    im,d=canvas(w,h);cx=w//2;bottom=h-12;roof=h//2;left=15;right=w-16
    shadow(d,cx,bottom+1,cx-8,6)
    stone=kind=='jail';wall='#9d9e7f' if stone else '#b5a578'
    d.rectangle((left,roof-2,right,bottom),fill=INK);d.rectangle((left+2,roof,right-3,bottom-3),fill=wall)
    d.rectangle((right-9,roof+1,right-3,bottom-3),fill='#8c8965')
    for y in range(roof+5,bottom-2,8):
        for x in range(left+5+(y%3)*6,right-9,19):d.line((x,y,x+8,y),fill='#7c8368' if stone else '#c8b68a')
    color='#56644a' if kind=='sports-pavilion' else '#925f47'
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

def market_hall():
    im,d=canvas(144,128)
    shadow(d,72,117,64,6)
    # The side pier and its stone footing carry the roof and the canvas rail.
    poly(d, [(15,60),(104,59),(128,65),(128,114),(117,118),(15,116)], '#a99871', INK)
    poly(d, [(16,67),(31,66),(31,112),(16,113)], '#c2b083')
    poly(d, [(115,66),(126,69),(126,112),(115,115)], '#8c8061')
    for x,y,w in [(19,102,9),(18,109,8),(116,98,7),(117,107,6),(25,95,4)]:
        d.line((x,y,x+w,y),fill='#d3c095')

    # Stepped green clay courses shade from the lit ridge to the deep front eave.
    poly(d, [(7,62),(23,24),(113,24),(136,64),(130,70),(11,68)], '#405746', INK)
    poly(d, [(24,26),(104,26),(115,60),(10,61)], '#657e59')
    poly(d, [(104,25),(112,25),(133,63),(115,61)], '#3b5550')
    for row,(left,right,y) in enumerate([(23,104,31),(21,106,38),(18,109,45),(15,111,52),(12,114,59)]):
        d.line((left,y,right,y),fill='#3b5946',width=2)
        for x in range(left+5+(row%2)*5,right-4,13):
            d.line((x,y-4,x+7,y-4),fill='#91a079')
            d.line((x+8,y-4,x+9,y-1),fill='#527054')
    d.line((24,25,105,25),fill='#a9ae7e',width=2)
    d.line((9,63,113,63,133,65),fill='#8a8f66',width=2)
    d.line((13,67,115,67,130,69),fill='#3d4939',width=3)

    # Open counter in the west bay, a recessed passage to its right.
    poly(d, [(29,76),(113,76),(112,109),(29,110)], '#3c4937')
    d.rectangle((77,82,108,114),fill='#354238')
    poly(d, [(81,91),(104,92),(101,114),(80,114)], '#475343')
    d.rectangle((29,95,73,109),fill='#765a3c')
    for x in (34,46,58,69):
        d.line((x,97,x,107),fill='#a88752')
    for x,y,light in [(34,92,'#b8ad71'),(46,90,'#a68955'),(61,92,'#b88158')]:
        d.rectangle((x,y,x+9,95),fill=light)
        d.line((x+1,y,x+7,y),fill='#d0ba83')
    poly(d, [(25,94),(72,94),(75,98),(27,98)], '#bc9a63', '#59462e')
    for x in (26,73,111):
        d.rectangle((x,78,x+4,113),fill='#564d38')
        d.line((x+1,81,x+1,111),fill='#a28555')

    # Alternating fabric strips change value at the turned front edge.
    colors=(('#d5c594','#bda878'),('#6c9279','#507660'))
    for index in range(8):
        x=26+index*11; left=20+index*13
        top,edge=colors[index%2]
        poly(d, [(x,70),(x+11,70),(left+13,84),(left,84)], top)
        poly(d, [(left,84),(left+13,84),(left+12,90),(left+2,90)], edge)
        d.line((left+2,84,left+11,84),fill='#b2b58c' if index%2 else '#e1d3a7')
        d.line((left+2,91,left+12,91),fill='#53604a')
    d.line((26,70,114,70),fill='#575e40',width=2)
    poly(d, [(16,111),(113,111),(124,115),(117,120),(18,119),(13,116)], '#85765a', INK)
    d.line((18,113,70,113),fill='#c1ae7f',width=2)
    d.line((79,114,109,114),fill='#d4bd87',width=2)
    d.line((19,117,116,118),fill='#a99871')
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

def build_plot(root):
    im,d=canvas(144,96)
    # Low sandstone edging and packed soil borrow the colors of the village paths.
    poly(d, [(5,22),(120,8),(139,68),(24,89)], '#746944')
    poly(d, [(6,22),(120,8),(137,65),(24,85)], '#be9b62')
    with Image.open(root/'public'/'village'/'terrain-materials-v1.png') as atlas:
        sand=tile_surface(atlas.convert('RGB'), 'sand', im.size)
    packed=Image.blend(Image.new('RGB', im.size, '#a88c60'), sand, .5)
    packed=packed.quantize(colors=16, dither=Image.Dither.NONE).convert('RGB')
    inner=Image.new('L', im.size)
    ImageDraw.Draw(inner).polygon([(12,24),(117,13),(131,63),(28,79)], fill=255)
    im.paste(packed, mask=inner)
    d.line((9,22,119,9),fill='#dbbc85',width=2)
    d.line((9,25,26,83,135,66),fill='#9f8252')
    d.line((28,82,134,65),fill='#d3ad73')
    for start_x,start_y,run,rise,count in [(10,22,108,-13,9),(29,84,108,-17,9),(8,25,17,56,6),(121,13,15,48,5)]:
        for index in range(1,count):
            x=start_x+round(index*run/count); y=start_y+round(index*rise/count)
            d.line((x,y,x+2,y+3),fill='#9b8054')
    # Small cedar stakes frame the same parcel corners as the original marker.
    for x,y in [(7,24),(120,11),(136,67),(25,86)]:
        d.rectangle((x-2,y-6,x+2,y+2),fill='#6e5738')
        d.rectangle((x-1,y-5,x+1,y),fill='#c5a376')
        d.line((x-1,y-5,x+1,y-5),fill='#ead2a0')
    return index_region(im)

def furniture(kind):
    w,h={'notice-board':(48,64),'captains-table':(64,48),'harbour-office-glow':(128,160)}[kind]
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
    return im

def assets(root):
    result={kind:house(kind) for kind in ['jail','prediction-kiosk','sports-pavilion','cabin','workshop']}
    result['market-hall']=market_hall()
    result.update({'greenhouse':greenhouse(),'windmill':windmill(),'build-plot':build_plot(root)})
    result.update({kind:furniture(kind) for kind in ['notice-board','captains-table','harbour-office-glow']})
    return result
