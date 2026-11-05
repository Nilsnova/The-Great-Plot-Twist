"""Original compact explorer, front/back/side and two alternating walking poses."""
from common import canvas, shadow, poly

def person(view='front', step=0):
    im,d=canvas(24,32);shadow(d,12,29,7,2)
    ink='#292d29'; skin='#d8ae78'; coat='#b18a43'; light='#d0a555'
    left=-1 if step==1 else 1 if step==2 else 0
    right=-left
    # Boots and trouser silhouettes remain aligned to one ground anchor.
    d.rectangle((8,23,11,28+left),fill=ink);d.rectangle((14,23,17,28+right),fill=ink)
    d.rectangle((8,24,10,26+left),fill='#546653');d.rectangle((14,24,16,26+right),fill='#546653')
    d.rectangle((7,28+left,11,29+left),fill='#34352a');d.rectangle((14,28+right,18,29+right),fill='#34352a')
    if view=='side':
        poly(d,[(9,14),(16,14),(18,24),(8,25),(7,19)],coat,ink)
        d.rectangle((6,16,9,23),fill='#40584b');d.rectangle((7,17,8,20),fill='#6a7d59')
        poly(d,[(8,6),(16,5),(18,9),(20,12),(17,14),(11,14),(9,11)],skin,ink)
        d.rectangle((14,9,15,10),fill=ink);d.point((18,12),fill='#aa7a53')
        d.rectangle((8,4,15,8),fill='#4e6549');d.rectangle((7,7,19,8),fill=ink);d.rectangle((9,3,14,4),fill='#72804e')
        d.rectangle((10,14,16,16),fill='#477e79');d.rectangle((8,16,10,19),fill='#35655f')
        d.line([(14,18),(15,21+left),(18,22+left)],fill=ink,width=3)
        d.line([(14,17),(15,20+left)],fill=light,width=2);d.point((18,22+left),fill=skin)
    else:
        poly(d,[(7,15),(16,14),(19,23),(17,25),(7,25),(5,22)],coat,ink)
        d.rectangle((7,17,9,23),fill=light);d.line([(16,17),(17,24)],fill='#866d3a')
        d.line([(6,17),(4,22+left)],fill=ink,width=3);d.line([(17,17),(20,22+right)],fill=ink,width=3)
        d.point((4,23+left),fill=skin);d.point((20,23+right),fill=skin)
        poly(d,[(7,6),(16,5),(18,9),(17,13),(14,15),(9,14),(6,10)],skin,ink)
        if view=='back':
            d.rectangle((7,7,17,11),fill='#4d5940');d.rectangle((8,16,16,23),fill='#384d41');d.rectangle((9,16,15,21),fill='#5e7957');d.rectangle((11,19,13,20),fill='#bba15c')
        else:
            d.point((9,10),fill=ink);d.point((15,10),fill=ink);d.line([(11,13),(13,13)],fill='#9e6a48')
            d.rectangle((8,15,16,16),fill='#417c77');d.rectangle((14,16,16,19),fill='#30625e')
        poly(d,[(6,6),(7,4),(9,2),(14,2),(17,4),(18,7),(14,8),(7,8)],'#4c6549',ink)
        d.rectangle((8,3,13,4),fill='#77864e');d.line([(5,7),(18,7)],fill='#293e33')
        d.point((16,5),fill='#a5aa68')
    return im
