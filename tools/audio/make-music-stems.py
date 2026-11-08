#!/usr/bin/env python3
"""
Make the game's music stems from the Freesound music WAVs in docs/sounds/.

The WAVs are not kept in the repo. To remake the stems, download each track from its Freesound page
(the ids and file names are in apps/game/src/audio/catalog.ts) into docs/sounds/ first.

Each source loop is split into three stems that add back to the original:
  percussion  the transient (vertical) part of the spectrogram
  pad         the sustained part below the crossover
  melody      the sustained part above the crossover

The split uses median-filter harmonic/percussive separation and a soft frequency crossover. It is
not a learned source separation, so the stems are approximate: listen before trusting them.

Then each stem is looped the way build-music.py loops the full mix (same loop count, gain and
50 ms crossfade) and encoded as MP3.

Needs numpy and scipy, and ffmpeg on the PATH. Stems are written to
apps/game/public/audio/music/stems/<track>/<stem>.mp3.

Usage: python3 tools/audio/make-music-stems.py
"""
import os
import subprocess
import tempfile

import numpy as np
import scipy.io.wavfile as wf
from scipy import ndimage, signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "docs", "sounds")
OUT = os.path.join(ROOT, "apps", "game", "public", "audio", "music", "stems")

NPERSEG, HOP = 2048, 512
CROSS_LO, CROSS_HI = 250.0, 400.0  # Hz: pad below, melody above, blended between
XFADE = 0.05
BITRATE = "192k"
STEMS = ["pad", "melody", "percussion"]

# (source archive without .wav, output folder, loop count, gain dB) as in the game's catalog
TRACKS = [
    ("518198__nnaudio__synth-pad-chords-130bpm-cmin", "synth-pad-chords", 9, -1.3),
    ("518644__nnaudio__vibey-synth-10-133bpm-emin", "vibey-synth", 9, -1.1),
    ("583356__nnaudio__summer-love-tyler-flower-synth-keys-80bpm-c", "summer-love-keys", 10, -0.7),
    ("507032__nnaudio__lofi-zelda-quest-bells-120bpm-gmin", "lofi-zelda-bells", 8, -1.2),
    ("518189__nnaudio__lofi-bells-140bpm-amin", "lofi-bells-140", 9, -2.7),
    ("518203__nnaudio__uber-smooth-chords-153bpm-dmin", "uber-smooth-chords", 10, 1.6),
    ("518194__nnaudio__lofi-bells-145bpm-cmin", "lofi-bells-145", 9, -2.5),
]


def split(samples, sr):
    """Return {stem: samples} for a (frames, channels) float array. The stems sum to the input."""
    n = samples.shape[0]
    _, _, Zm = signal.stft(samples.mean(axis=1), fs=sr, window="hann", nperseg=NPERSEG, noverlap=NPERSEG - HOP)
    S = np.abs(Zm)
    # Masks come from the mid signal, so both channels are split identically.
    percussive = (ndimage.median_filter(S, size=(17, 1)) >= ndimage.median_filter(S, size=(1, 17))).astype(float)
    freqs = np.linspace(0, sr / 2, S.shape[0])
    low = np.clip((CROSS_HI - freqs) / (CROSS_HI - CROSS_LO), 0.0, 1.0)[:, None]
    harmonic = 1.0 - percussive
    masks = {"percussion": percussive, "pad": harmonic * low, "melody": harmonic * (1 - low)}
    out = {k: np.zeros_like(samples) for k in masks}
    for c in range(samples.shape[1]):
        _, _, Z = signal.stft(samples[:, c], fs=sr, window="hann", nperseg=NPERSEG, noverlap=NPERSEG - HOP)
        for k, m in masks.items():
            _, y = signal.istft(Z * m, fs=sr, window="hann", nperseg=NPERSEG, noverlap=NPERSEG - HOP)
            y = y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))
            out[k][:, c] = y
    return out


def loop_and_encode(wav_path, mp3_path, loops, gain):
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for _ in range(loops):
        cmd += ["-i", wav_path]
    parts, prev = [], "v0"
    for i in range(loops):
        parts.append(f"[{i}:a]volume={gain}dB[v{i}]")
    for i in range(1, loops):
        out = f"x{i}"
        parts.append(f"[{prev}][v{i}]acrossfade=d={XFADE}:c1=tri:c2=tri[{out}]")
        prev = out
    cmd += ["-filter_complex", ";".join(parts), "-map", f"[{prev}]", "-c:a", "libmp3lame", "-b:a", BITRATE, mp3_path]
    subprocess.run(cmd, check=True)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        for archive, folder, loops, gain in TRACKS:
            raw_sr, raw = wf.read(os.path.join(SRC, archive + ".wav"))
            scale = np.iinfo(raw.dtype).max if raw.dtype.kind == "i" else 1.0
            samples = raw.astype(np.float64) / scale
            if samples.ndim == 1:
                samples = np.stack([samples, samples], axis=1)
            stems = split(samples, raw_sr)
            out_dir = os.path.join(OUT, folder)
            os.makedirs(out_dir, exist_ok=True)
            for stem in STEMS:
                wav = os.path.join(tmp, f"{folder}-{stem}.wav")
                wf.write(wav, raw_sr, stems[stem].astype(np.float32))
                loop_and_encode(wav, os.path.join(out_dir, f"{stem}.mp3"), loops, gain)
            print("made", folder)


if __name__ == "__main__":
    main()
