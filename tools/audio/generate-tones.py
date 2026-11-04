#!/usr/bin/env python3
"""
Generates the game's UI tones from parameters, so every sound is our own and can be rebuilt.

Standard library only. Each sound is a list of mallet notes (a sine with a little upper harmonic
and an exponential decay), with an optional wooden tick and low-pass filter. Output is 16-bit mono
WAV at 44.1 kHz.

Usage: python3 tools/audio/generate-tones.py [output folder] [sound names...]
(default: apps/game/public/audio/sfx, where the game loads them; with names, only those are built)
"""
import math
import os
import random
import struct
import sys
import wave

SR = 44100


def note(freq, start, dur, decay, bright, glide_cents=0.0, glide_time=0.04, amp=1.0):
    """One mallet note. `decay` is per second; `bright` scales the upper harmonics."""
    return dict(freq=freq, start=start, dur=dur, decay=decay, bright=bright,
                glide_cents=glide_cents, glide_time=glide_time, amp=amp)


# The sound set. Each entry is the design we discuss and tune; change a value and rebuild.
SOUNDS = {
    "menu-enter": dict(
        about="Going deeper into a menu: two mallet notes rising a fifth, C5 then G5.",
        length=0.42,
        notes=[note(523.25, 0.00, 0.40, decay=14, bright=1.0),
               note(783.99, 0.07, 0.35, decay=12, bright=1.0)],
        peak_db=-6.0,
    ),
    "menu-back": dict(
        about="Backing out: the same notes falling, G5 then C5, darker and a little shorter.",
        length=0.38,
        notes=[note(783.99, 0.00, 0.36, decay=16, bright=0.5),
               note(523.25, 0.07, 0.31, decay=15, bright=0.5)],
        lowpass=2500,
        peak_db=-6.0,
    ),
    "map-next": dict(
        about="Map carousel right: one short note on E5 bending up a quarter tone, with a soft wooden tick.",
        length=0.22,
        notes=[note(659.25, 0.0, 0.22, decay=22, bright=0.7, glide_cents=50)],
        tick=dict(amp=0.25, dur=0.006, decay=900, lowpass=3000),
        peak_db=-8.0,
    ),
    "map-previous": dict(
        about="Map carousel left: the same tick on C5 bending down a quarter tone.",
        length=0.22,
        notes=[note(523.25, 0.0, 0.22, decay=22, bright=0.7, glide_cents=-50)],
        tick=dict(amp=0.25, dur=0.006, decay=900, lowpass=3000),
        peak_db=-8.0,
    ),
    "clock-select": dict(
        about="Clock menu choice (play, pause, 2x): one soft, low mallet note on A4, apart from the menu and map pairs.",
        length=0.30,
        notes=[note(440.0, 0.0, 0.30, decay=13, bright=0.4)],
        peak_db=-9.0,
    ),
    "clock-tick": dict(
        about="Week-end clock, the tick: a short woodblock click on G6.",
        length=0.09,
        notes=[note(1567.98, 0.0, 0.09, decay=60, bright=0.3)],
        tick=dict(amp=0.35, dur=0.004, decay=1500, lowpass=4000),
        peak_db=-10.0,
    ),
    "clock-tock": dict(
        about="Week-end clock, the tock: the same click a fifth lower, on C6.",
        length=0.09,
        notes=[note(1046.50, 0.0, 0.09, decay=60, bright=0.3)],
        tick=dict(amp=0.35, dur=0.004, decay=1500, lowpass=4000),
        peak_db=-10.0,
    ),
    "level-select": dict(
        about="Play on a map: three notes rising through a C major chord, C5, E5, G5.",
        length=0.55,
        notes=[note(523.25, 0.00, 0.50, decay=10, bright=0.9),
               note(659.25, 0.06, 0.45, decay=10, bright=0.9),
               note(783.99, 0.12, 0.42, decay=9, bright=0.9)],
        peak_db=-6.0,
    ),
    "building-spawn": dict(
        about="A new building appears: one low, round note on G4 bending up a whole tone, like a soft pop.",
        length=0.26,
        notes=[note(392.00, 0.0, 0.26, decay=16, bright=0.5, glide_cents=200, glide_time=0.05)],
        peak_db=-9.0,
    ),
    "game-over": dict(
        about="The run ends: three slow notes falling through C major, G4, E4, C4, darker and longer.",
        length=1.30,
        notes=[note(392.00, 0.00, 0.90, decay=5, bright=0.6),
               note(329.63, 0.25, 0.90, decay=5, bright=0.6),
               note(261.63, 0.50, 0.80, decay=4.5, bright=0.6)],
        lowpass=1800,
        peak_db=-6.0,
    ),
    "pin-appeared": dict(
        about="A destination asks for a car: a tiny, quiet high ping on E6. Frequent, so very soft.",
        length=0.12,
        notes=[note(1318.51, 0.0, 0.12, decay=40, bright=0.2)],
        peak_db=-16.0,
    ),
    "car-arrived": dict(
        about="A car reaches its destination: a muted low tap on D5 with a wooden tick. The most frequent sound, so the quietest.",
        length=0.09,
        notes=[note(587.33, 0.0, 0.09, decay=55, bright=0.2)],
        lowpass=2000,
        tick=dict(amp=0.2, dur=0.004, decay=1500, lowpass=2500),
        peak_db=-18.0,
    ),
    "overflow-started": dict(
        about="A destination starts to overflow: two quick notes a tritone apart, C5 down to F#4, to catch the ear without alarm.",
        length=0.40,
        notes=[note(523.25, 0.00, 0.30, decay=12, bright=0.8),
               note(369.99, 0.10, 0.30, decay=12, bright=0.8)],
        peak_db=-8.0,
    ),
    "overflow-countdown": dict(
        about="Once a second while an overflow countdown runs: a soft low pulse on A3, like a heartbeat.",
        length=0.18,
        notes=[note(220.0, 0.0, 0.18, decay=25, bright=0.3)],
        lowpass=1200,
        peak_db=-14.0,
    ),
    "week-ended": dict(
        about="The week ends and an upgrade is offered: a quick bright rise, G5, C6, E6, resolving the clock's ticking.",
        length=0.80,
        notes=[note(783.99, 0.00, 0.70, decay=7, bright=1.0),
               note(1046.50, 0.06, 0.65, decay=7, bright=1.0),
               note(1318.51, 0.12, 0.60, decay=7, bright=1.0)],
        peak_db=-7.0,
    ),
    "road-place": dict(
        about="A road tile laid: a soft woody tap on G4. Fires per tile, so it is short and quiet.",
        length=0.06,
        notes=[note(392.00, 0.0, 0.06, decay=60, bright=0.3)],
        tick=dict(amp=0.25, dur=0.003, decay=1800, lowpass=3000),
        peak_db=-20.0,
    ),
    "road-erase": dict(
        about="A road tile removed: the same tap lower and duller, on D4, bending slightly down.",
        length=0.07,
        notes=[note(293.66, 0.0, 0.07, decay=55, bright=0.2, glide_cents=-80, glide_time=0.05)],
        lowpass=1500,
        tick=dict(amp=0.2, dur=0.003, decay=1800, lowpass=2000),
        peak_db=-21.0,
    ),
    "place-refused": dict(
        about="A placement that cannot be made: a low, muted thud of two notes a semitone apart, E3 and F3.",
        length=0.16,
        notes=[note(164.81, 0.0, 0.16, decay=22, bright=0.3),
               note(174.61, 0.0, 0.16, decay=22, bright=0.3)],
        lowpass=900,
        peak_db=-12.0,
    ),
    "upgrade-pick": dict(
        about="An upgrade chosen: a bright bell of two notes together, C6 and G6, ringing a little longer.",
        length=0.90,
        notes=[note(1046.50, 0.0, 0.90, decay=5, bright=1.0),
               note(1567.98, 0.0, 0.85, decay=6, bright=0.8, amp=0.6)],
        peak_db=-8.0,
    ),
    "control-place": dict(
        about="Traffic lights or a roundabout placed: an open fifth struck together, A4 and E5.",
        length=0.30,
        notes=[note(440.00, 0.0, 0.30, decay=14, bright=0.7),
               note(659.25, 0.0, 0.28, decay=15, bright=0.7, amp=0.8)],
        peak_db=-10.0,
    ),
    "motorway-place": dict(
        about="A motorway placed: one note on C4 gliding up an octave, like lifting off the ground.",
        length=0.40,
        notes=[note(261.63, 0.0, 0.40, decay=8, bright=0.6, glide_cents=1200, glide_time=0.25)],
        peak_db=-10.0,
    ),
    "crossing-place": dict(
        about="A bridge or tunnel placed: a hollow low fifth, A3 and E4, softened.",
        length=0.35,
        notes=[note(220.00, 0.0, 0.35, decay=11, bright=0.5),
               note(329.63, 0.0, 0.33, decay=12, bright=0.5, amp=0.8)],
        lowpass=1400,
        peak_db=-10.0,
    ),
    "toggle-on": dict(
        about="A switch turned on, or a volume step up: one short clear note on G5.",
        length=0.10,
        notes=[note(783.99, 0.0, 0.10, decay=35, bright=0.5)],
        peak_db=-12.0,
    ),
    "toggle-off": dict(
        about="A switch turned off, or a volume step down: the same note lower, on D5.",
        length=0.10,
        notes=[note(587.33, 0.0, 0.10, decay=35, bright=0.4)],
        peak_db=-12.0,
    ),
    "options-tab": dict(
        about="An Options tab or a tutorial step: one soft page note on F5.",
        length=0.12,
        notes=[note(698.46, 0.0, 0.12, decay=30, bright=0.3)],
        peak_db=-13.0,
    ),
    "motorway-erase": dict(
        about="A motorway removed: the motorway sound in reverse, C5 gliding down an octave.",
        length=0.35,
        notes=[note(523.25, 0.0, 0.35, decay=9, bright=0.4, glide_cents=-1200, glide_time=0.22)],
        lowpass=2000,
        peak_db=-11.0,
    ),
    "district-opened": dict(
        about="A new district opens: three slow notes rising in fourths, D5, G5, C6, soft and spacious.",
        length=1.10,
        notes=[note(587.33, 0.00, 0.90, decay=4.5, bright=0.5),
               note(783.99, 0.12, 0.85, decay=4.5, bright=0.5),
               note(1046.50, 0.24, 0.80, decay=4.5, bright=0.5)],
        lowpass=2500,
        peak_db=-9.0,
    ),
    "new-best": dict(
        about="A new best score: the level-select rise carried up to the octave, C5, E5, G5, C6, ringing longer.",
        length=1.10,
        notes=[note(523.25, 0.00, 0.80, decay=6, bright=1.0),
               note(659.25, 0.07, 0.80, decay=6, bright=1.0),
               note(783.99, 0.14, 0.80, decay=6, bright=1.0),
               note(1046.50, 0.21, 0.85, decay=5, bright=1.0)],
        peak_db=-6.0,
    ),
    "map-unlocked": dict(
        about="The next campaign map opens: the upgrade bell, C6 and G6, then a step up to D6 and A6.",
        length=1.10,
        notes=[note(1046.50, 0.00, 0.70, decay=6, bright=1.0),
               note(1567.98, 0.00, 0.65, decay=7, bright=0.8, amp=0.6),
               note(1174.66, 0.18, 0.90, decay=5, bright=1.0),
               note(1760.00, 0.18, 0.85, decay=6, bright=0.8, amp=0.6)],
        peak_db=-7.0,
    ),
    "save-done": dict(
        about="A save exported or imported: two quick soft taps on the same note, B5, like a nod.",
        length=0.22,
        notes=[note(987.77, 0.00, 0.10, decay=35, bright=0.4),
               note(987.77, 0.09, 0.13, decay=30, bright=0.4)],
        peak_db=-12.0,
    ),
    "notice-error": dict(
        about="Something could not be done (a refused import, a map that fails to load): a soft fall of a minor third, E5 to C#5.",
        length=0.32,
        notes=[note(659.25, 0.00, 0.20, decay=18, bright=0.5),
               note(554.37, 0.10, 0.22, decay=16, bright=0.5)],
        lowpass=2200,
        peak_db=-11.0,
    ),
}


def lowpass(buf, cutoff):
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = 0.0
    out = []
    for x in buf:
        y = (1 - a) * x + a * y
        out.append(y)
    return out


def render(spec, seed=1):
    n = int(spec["length"] * SR)
    buf = [0.0] * n
    for nt in spec["notes"]:
        s0 = int(nt["start"] * SR)
        phase = 0.0
        for i in range(int(nt["dur"] * SR)):
            j = s0 + i
            if j >= n:
                break
            t = i / SR
            g = min(t / nt["glide_time"], 1.0) if nt["glide_time"] > 0 else 1.0
            f = nt["freq"] * 2 ** (nt["glide_cents"] * g / 1200)
            phase += 2 * math.pi * f / SR
            env = min(t / 0.003, 1.0) * math.exp(-t * nt["decay"])
            v = (math.sin(phase)
                 + 0.35 * nt["bright"] * math.sin(2 * phase) * math.exp(-t * nt["decay"])
                 + 0.12 * nt["bright"] * math.sin(4 * phase) * math.exp(-t * nt["decay"] * 2))
            buf[j] += nt["amp"] * env * v
    if spec.get("lowpass"):
        buf = lowpass(buf, spec["lowpass"])
    tick = spec.get("tick")
    if tick:
        rng = random.Random(seed)
        burst = [rng.uniform(-1, 1) * math.exp(-(i / SR) * tick["decay"])
                 for i in range(int(tick["dur"] * SR))]
        burst = lowpass(burst, tick["lowpass"])
        for i, x in enumerate(burst):
            buf[i] += tick["amp"] * x
    fade = int(0.010 * SR)
    for i in range(fade):
        buf[n - 1 - i] *= i / fade
    peak = max(abs(x) for x in buf) or 1.0
    scale = 10 ** (spec["peak_db"] / 20) / peak
    return [x * scale for x in buf]


def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 32767)) for x in samples))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "apps/game/public/audio/sfx"
    only = set(sys.argv[2:])
    unknown = only - set(SOUNDS)
    if unknown:
        sys.exit(f"Unknown sound: {', '.join(sorted(unknown))}")
    os.makedirs(out, exist_ok=True)
    for name, spec in SOUNDS.items():
        if only and name not in only:
            continue
        path = os.path.join(out, f"{name}.wav")
        write_wav(path, render(spec))
        print(f"{path}: {spec['about']}")


if __name__ == "__main__":
    main()
