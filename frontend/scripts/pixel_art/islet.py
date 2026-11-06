"""Original small props and the signal station for the home-islet plots."""
from common import canvas, poly, shadow

INK = '#263a32'

def empty_plot():
    im, d = canvas(56, 64); shadow(d, 28, 58, 20, 4)
    d.rectangle((26, 25, 29, 58), fill=INK); d.rectangle((27, 28, 28, 56), fill='#8f805a')
    poly(d, [(10, 7), (38, 7), (46, 18), (38, 29), (10, 29), (3, 18)], '#596f4c', INK)
    d.rectangle((12, 11, 36, 25), fill='#d2c49b'); d.rectangle((17, 14, 31, 16), fill='#75866a')
    d.rectangle((17, 19, 31, 21), fill='#9b8c67')
    return im

def locked_plot():
    im, d = canvas(64, 72); shadow(d, 32, 66, 22, 4)
    d.rectangle((30, 28, 33, 65), fill=INK); d.rectangle((31, 31, 32, 63), fill='#8f805a')
    poly(d, [(8, 6), (50, 6), (56, 12), (56, 42), (8, 42)], '#755b43', INK)
    d.rectangle((12, 10, 52, 38), fill='#dbc99a'); d.line((16, 34, 48, 34), fill='#987b4d', width=2)
    # A closed gate is a clear lock symbol without small, inaccessible lettering.
    d.arc((24, 17, 40, 34), 180, 360, fill='#4d624b', width=3)
    d.rounded_rectangle((25, 25, 39, 35), radius=2, fill='#4d624b')
    d.rectangle((31, 28, 33, 32), fill='#e5d59f')
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
