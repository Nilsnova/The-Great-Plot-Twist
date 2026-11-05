"""Generic staged clue/reward objects; these drawings do not establish story outcomes."""
from common import canvas, shadow, poly

def item(name):
    w,h=(32,40) if name=='logbook' else (24,24) if name=='brass-star' else (32,48) if name=='beacon-fire' else (32,32)
    im,d=canvas(w,h);ink='#383a2d';shadow(d,w//2,h-4,w//2-3,3)
    if name=='sealed-letter':
        poly(d,[(3,8),(28,7),(29,25),(4,26)],'#b6a47a',ink);poly(d,[(5,9),(16,18),(27,9)],'#e1cea0')
        d.line([(4,24),(13,17),(17,17),(28,24)],fill='#a58b5e');d.ellipse((13,15,20,22),fill='#8b5036');d.point((16,17),fill='#d09857')
    elif name=='torn-page':
        poly(d,[(5,4),(13,3),(17,5),(27,4),(26,12),(28,16),(25,22),(27,27),(18,26),(11,28),(4,26),(5,18),(3,13)],'#d6c393',ink)
        d.line([(8,9),(22,9)],fill='#887a54');d.line([(8,13),(20,13)],fill='#a19367');d.line([(10,17),(23,17)],fill='#8d8259');d.line([(7,22),(17,22)],fill='#b0a074')
    elif name=='logbook':
        poly(d,[(4,8),(23,4),(28,7),(28,32),(8,36),(3,32)],'#334d3d',ink)
        poly(d,[(7,7),(23,4),(25,7),(9,10)],'#d2c59a');poly(d,[(8,11),(26,8),(26,31),(8,34)],'#57734d')
        d.line([(4,12),(4,30)],fill='#798759');d.line([(11,14),(23,12),(23,28),(11,31),(11,14)],fill='#a99c61')
        poly(d,[(17,17),(20,21),(18,26),(15,25),(15,20)],'#cbb471');d.rectangle((22,29,24,36),fill='#a76a43')
    elif name=='compass':
        d.ellipse((3,3,29,29),fill=ink);d.ellipse((5,5,27,27),fill='#b79c5f');d.ellipse((7,7,25,25),fill='#d9cc98')
        for a,b in [((16,8),(16,11)),((16,22),(16,25)),((8,16),(11,16)),((22,16),(25,16))]:d.line([a,b],fill='#73805a')
        poly(d,[(16,9),(19,17),(16,23),(13,16)],'#48695a');poly(d,[(16,9),(16,17),(13,16)],'#a96845');d.rectangle((15,15,17,17),fill='#ead7a1')
    elif name=='brass-star':
        poly(d,[(12,3),(15,9),(22,10),(17,15),(18,22),(12,19),(5,22),(6,15),(2,10),(9,9)],'#866b3e',ink)
        poly(d,[(12,5),(14,10),(19,11),(15,14),(16,19),(12,17),(7,19),(8,14),(4,11),(10,10)],'#d3b669')
        d.line([(12,7),(12,13),(8,16)],fill='#f0d594');d.line([(12,13),(15,17)],fill='#a18b50')
    elif name=='beacon-fire':
        d.rectangle((9,29,23,41),fill=ink);d.rectangle((11,30,21,39),fill='#725839')
        d.line([(7,41),(25,41)],fill='#403b2c',width=3);d.line([(8,42),(23,42)],fill='#a0925e')
        poly(d,[(10,29),(6,22),(10,15),(13,20),(17,5),(21,17),(25,20),(23,28),(18,33)],'#a85b32',ink)
        poly(d,[(11,28),(10,22),(15,16),(17,12),(20,21),(22,24),(18,30)],'#d99042')
        poly(d,[(14,28),(15,23),(18,20),(19,27),(17,30)],'#f1cf76')
    return im
