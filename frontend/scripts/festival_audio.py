"""Original festival music and cues, synthesized locally without samples.

Run with Python's standard library. Writes mono PCM WAVs for workshop audition;
future live playback must use the game's gesture gate and music/effects buses.
"""

import math
import struct
import wave
from pathlib import Path

RATE = 22050
FOLDER = Path(__file__).resolve().parents[1] / 'public/audio'


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def chime(samples, start, duration, note, gain=0.18, metallic=False):
    """A soft attack and damped harmonics keep transients gentle and edges silent."""
    offset = round(start * RATE)
    count = round(duration * RATE)
    hz = frequency(note)
    for index in range(count):
        t = index / RATE
        attack = min(1, t / 0.012)
        release = min(1, (count - 1 - index) / (RATE * 0.04))
        envelope = attack * release * math.exp(-4 * t / duration)
        ratio = math.sqrt(2) if metallic else 2
        tone = math.sin(2 * math.pi * hz * t) + 0.24 * math.sin(2 * math.pi * hz * ratio * t)
        samples[offset + index] += tone * envelope * gain


def compose(name):
    durations = {'loop': 8, 'claim': 0.9, 'ring-bell': 1.6, 'timer-end': 1.4}
    samples = [0.0] * round(durations[name] * RATE)
    if name == 'loop':
        # Four original two-second phrases: a lantern dance, then a quiet cadence.
        melody = [67, 74, 77, 74, 70, 72, 74, None,
                  67, 70, 74, 79, 77, 74, 72, None,
                  70, 77, 79, 77, 74, 72, 70, None,
                  74, 72, 70, 67, 62, 65, 67, None]
        for step, note in enumerate(melody):
            if note is not None:
                chime(samples, step * 0.25, 0.23, note, 0.12)
        for step, note in enumerate([43, 46, 48, 43]):
            chime(samples, step * 2, 1.8, note, 0.10)
    if name == 'claim':
        for index, note in enumerate([74, 77, 82]):
            chime(samples, index * 0.14, 0.48, note)
    if name == 'ring-bell':
        chime(samples, 0, 1.55, 76, 0.23, metallic=True)
    if name == 'timer-end':
        for index, note in enumerate([77, 74, 70, 67]):
            chime(samples, index * 0.22, 0.6, note, 0.16)
    return samples


def generate():
    FOLDER.mkdir(exist_ok=True)
    for name in ['loop', 'claim', 'ring-bell', 'timer-end']:
        samples = compose(name)
        if max(abs(sample) for sample in samples) >= 0.95:
            raise ValueError('Unexpected clipping; check the composition instead of normalizing it.')
        pcm = b''.join(struct.pack('<h', round(sample * 32767)) for sample in samples)
        with wave.open(str(FOLDER / f'festival-{name}.wav'), 'wb') as audio:
            audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            audio.writeframes(pcm)
    print('Generated four original festival WAVs (8-second loop and three cues)')


if __name__ == '__main__':
    generate()
