"""Original small props and the signal station for the home-islet plots."""
from common import canvas, poly, shadow

INK = '#263a32'

def empty_plot():
    im, d = canvas(56, 64); shadow(d, 28, 58, 20, 4)
    d.rectangle((25, 29, 30, 58), fill='#524938'); d.line((27, 32, 27, 55), fill='#ab8a58')
    poly(d, [(12, 9), (43, 9), (49, 15), (49, 33), (10, 33), (6, 27), (6, 16)], '#796040', INK)
    poly(d, [(12, 12), (42, 12), (46, 16), (46, 29), (12, 29), (9, 26), (9, 17)], '#c3a573')
    d.line((13, 13, 41, 13), fill='#dfbb82'); d.line((13, 28, 44, 28), fill='#9e794e')
    d.line((21, 21, 35, 21), fill='#4b5942', width=3)
    d.line((28, 14, 28, 27), fill='#4b5942', width=3)
    for x in (12,43):d.point((x,20),fill='#f5d199')
    return im

def locked_plot():
    im, d = canvas(64, 72); shadow(d, 32, 66, 22, 4)
    d.rectangle((29, 33, 34, 65), fill='#524938'); d.line((31, 34, 31, 62), fill='#ab8a58')
    poly(d, [(11, 10), (50, 10), (54, 14), (54, 40), (10, 40), (10, 12)], '#5a6656', INK)
    d.rectangle((14, 14, 50, 36), fill='#67765e'); d.line((15, 14, 49, 14), fill='#899179')
    d.line((15, 35, 49, 35), fill='#505f50')
    d.arc((25, 17, 39, 33), 180, 360, fill='#ebd7a5', width=3)
    d.rounded_rectangle((24, 24, 40, 34), radius=2, fill='#ead9a9')
    d.rectangle((31, 26, 33, 31), fill='#425443')
    for x in (17,47):d.point((x,23),fill='#aaa88b')
    return im

def signal_station(lit=False):
    im, d = canvas(80, 128); shadow(d, 40, 121, 24, 5)
    # Salt-worn stone base and cedar mast echo the harbor's signal work.
    poly(d, [(22, 113), (27, 67), (53, 67), (58, 113)], INK)
    poly(d, [(25, 110), (30, 70), (50, 70), (55, 110)], '#796b52')
    poly(d, [(29, 67), (31, 43), (49, 43), (51, 67)], '#765844', INK)
    d.rectangle((32, 47, 48, 62), fill='#c0aa76'); d.rectangle((35, 50, 45, 59), fill='#324c45')
    d.rectangle((36, 53, 44, 57), fill='#f0ca70' if lit else '#59614e')
    d.rectangle((38, 15, 41, 44), fill=INK); d.rectangle((39, 18, 40, 42), fill='#8e7954')
    poly(d, [(21, 10), (58, 10), (64, 17), (58, 24), (21, 24), (15, 17)], '#596f4c', INK)
    d.rectangle((26, 13, 53, 21), fill='#d5c398'); d.rectangle((32, 15, 47, 19), fill='#f1c96e' if lit else '#73816c')
    if lit:
        # Tiny steady amber lens; glow is drawn in the world, not baked as a halo.
        d.point((39, 17), fill='#fff0a4'); d.point((40, 17), fill='#fff0a4')
    return im

def assets():
    return {'islet-empty-plot': empty_plot(), 'islet-locked-sign': locked_plot(),
            'islet-signal-station': signal_station(), 'islet-signal-station-lit': signal_station(True)}
