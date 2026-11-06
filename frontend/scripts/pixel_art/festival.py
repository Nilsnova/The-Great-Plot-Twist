"""Original Keepers' Ring, stalls and twelve lamps; no story or secret data.

Used by generate.py and the G13 workshop. Every mark is a native integer pixel.
"""

from common import canvas, poly, shadow


def palette(night):
    if night:
        return {'ink': '#202e38', 'wood': '#47585b', 'edge': '#768783',
                'cloth': '#46635e', 'paper': '#aeb9a0', 'metal': '#667c85'}
    return {'ink': '#343d32', 'wood': '#806c4c', 'edge': '#b7a379',
            'cloth': '#5f8064', 'paper': '#e0d7af', 'metal': '#85978b'}


def lamp(number, lit, night):
    image, draw = canvas(48, 80)
    p = palette(night)
    shadow(draw, 24, 73, 17, 4)
    if lit:
        # Stepped transparent halo, never smoothed or painted onto the ground.
        for box, alpha in [((7, 8, 41, 47), 18), ((11, 12, 37, 43), 30)]:
            draw.ellipse(box, fill=(246, 208, 117, alpha))
    draw.rectangle((21, 37, 26, 70), fill=p['ink'])
    draw.rectangle((22, 39, 24, 69), fill=p['wood'])
    poly(draw, [(13, 71), (18, 67), (30, 67), (35, 71), (35, 74), (13, 74)],
         p['wood'], p['ink'])
    draw.line((15, 71, 33, 71), fill=p['edge'])
    # Three silhouettes and four metal collar motifs give twelve distinct spots.
    roof = number % 3
    poly(draw, [(13, 19), (18, 12 - roof * 2), (29, 12 - roof * 2), (35, 19)],
         p['cloth'], p['ink'])
    draw.rectangle((15, 20, 32, 39), fill=p['ink'])
    glass = '#f5cd79' if lit else ('#314951' if night else '#718d83')
    draw.rectangle((18, 23, 29, 35), fill=glass)
    draw.rectangle((20, 24, 22, 33), fill='#fff0b6' if lit else p['metal'])
    draw.line((25, 22, 25, 36), fill=p['wood'])
    draw.line((17, 38, 30, 38), fill=p['edge'])
    for stripe in range(number // 3 + 1):
        y = 48 + stripe * 4
        draw.line((19, y, 28, y), fill=p['ink'], width=2)
        draw.point((20 + roof * 3, y), fill=p['edge'])
    draw.line((24, 6 - roof, 24, 11 - roof), fill=p['ink'], width=2)
    draw.point((24, 6 - roof), fill=p['edge'])
    return image


def claim_marker(night):
    image, draw = canvas(32, 40)
    p = palette(night)
    shadow(draw, 16, 35, 12, 3)
    draw.rectangle((9, 5, 11, 35), fill=p['ink'])
    poly(draw, [(12, 6), (28, 6), (24, 13), (28, 21), (12, 21)], p['cloth'], p['ink'])
    poly(draw, [(15, 13), (18, 16), (23, 10), (24, 11), (18, 19), (14, 15)], p['paper'])
    draw.line((9, 4, 11, 4), fill=p['edge'])
    return image


def stall(night):
    image, draw = canvas(112, 96)
    p = palette(night)
    shadow(draw, 56, 86, 48, 6)
    draw.rectangle((18, 28, 23, 85), fill=p['ink'])
    draw.rectangle((87, 28, 92, 85), fill=p['ink'])
    for x in [20, 89]:
        draw.line((x, 30, x, 83), fill=p['wood'], width=2)
    poly(draw, [(10, 36), (24, 12), (87, 12), (102, 36)], p['cloth'], p['ink'])
    for x in [28, 54, 80]:
        poly(draw, [(x, 13), (x + 10, 13), (x + 14, 35), (x - 5, 35)], p['paper'])
    draw.rectangle((11, 36, 101, 42), fill=p['cloth'], outline=p['ink'])
    draw.rectangle((16, 63, 95, 83), fill=p['wood'], outline=p['ink'])
    draw.line((17, 65, 94, 65), fill=p['edge'], width=2)
    for x in range(22, 94, 12):
        draw.line((x, 69, x, 80), fill=p['ink'])
    for x in [32, 54, 76]:
        draw.rectangle((x - 5, 49, x + 5, 60), fill=p['ink'])
        draw.rectangle((x - 3, 51, x + 3, 58), fill='#f3d18a' if night else p['paper'])
        draw.arc((x - 3, 44, x + 3, 51), 180, 360, fill=p['edge'])
        draw.line((x, 52, x, 57), fill=p['wood'])
    return image


def bunting(night):
    image, draw = canvas(160, 40)
    p = palette(night)
    draw.line([(3, 5), (40, 13), (80, 17), (120, 13), (156, 5)], fill=p['ink'], width=2)
    for index, (x, y) in enumerate([(18, 9), (41, 14), (65, 17), (89, 17), (113, 14), (137, 10)]):
        poly(draw, [(x - 7, y), (x + 7, y), (x, y + 16)],
             p['paper'] if index % 2 else p['cloth'], p['ink'])
        draw.line((x - 3, y + 2, x, y + 10), fill=p['edge'])
    return image


def ring(night):
    image, draw = canvas(160, 112)
    p = palette(night)
    shadow(draw, 80, 96, 73, 9)
    poly(draw, [(12, 55), (79, 26), (148, 55), (148, 86), (80, 107), (12, 86)],
         p['ink'])
    poly(draw, [(13, 55), (79, 29), (146, 55), (80, 81)], p['wood'], p['ink'])
    for y in range(53, 81, 5):
        draw.line((20 + (y - 53) * 2, y, 139 - (y - 53) * 2, y), fill=p['edge'])
    poly(draw, [(59, 54), (79, 44), (101, 54), (80, 66)], p['cloth'], p['ink'])
    draw.ellipse((75, 49, 85, 59), outline=p['paper'], width=2)
    for x, y in [(13, 53), (79, 27), (146, 53), (80, 81)]:
        draw.rectangle((x - 3, y - 22, x + 3, y + 5), fill=p['ink'])
        draw.line((x - 1, y - 20, x - 1, y + 3), fill=p['edge'], width=2)
    for drop in [8, 17]:
        draw.line([(13, 31 + drop), (80, 59 + drop), (146, 31 + drop)], fill=p['paper'])
        draw.line([(13, 31 + drop), (79, 5 + drop), (146, 31 + drop)], fill=p['metal'])
    # The bell and two lanterns belong to the ring; no combat or story marks.
    poly(draw, [(71, 24), (75, 17), (83, 17), (87, 24)], '#b4a276', p['ink'])
    draw.rectangle((72, 24, 86, 26), fill=p['edge'])
    for x, y in [(13, 31), (146, 31)]:
        draw.rectangle((x - 3, y - 7, x + 3, y), fill='#f5cd79' if night else p['paper'],
                       outline=p['ink'])
    return image


def assets():
    drawings = {}
    for number in range(12):
        for night in [False, True]:
            for lit in [False, True]:
                suffix = '-night' if night else ''
                state = 'lit' if lit else 'unlit'
                drawings[f'festival-lamp-{number + 1:02d}-{state}{suffix}'] = lamp(number, lit, night)
    for name, draw in [('claim-marker', claim_marker), ('stall', stall),
                       ('bunting', bunting), ('duel-ring', ring)]:
        for night in [False, True]:
            drawings[f'festival-{name}' + ('-night' if night else '')] = draw(night)
    return drawings
