/**
 * Rolling frame and simulation times for the debug overlay. Frame time is the gap between two
 * frames; sim time is how long the simulation took within a frame. Both are kept over the last
 * `size` frames, so the readout settles instead of flickering.
 */

export interface FrameSummary {
  frameAvg: number;
  frameWorst: number;
  simAvg: number;
  simWorst: number;
  samples: number;
}

export class FrameMeter {
  private frames: number[] = [];
  private sims: number[] = [];

  private readonly size: number;

  constructor(size = 120) {
    this.size = size;
  }

  record(frameMs: number, simMs: number): void {
    this.frames.push(frameMs);
    this.sims.push(simMs);
    if (this.frames.length > this.size) {
      this.frames.shift();
      this.sims.shift();
    }
  }

  summary(): FrameSummary {
    const n = this.frames.length;
    if (n === 0) {
      return { frameAvg: 0, frameWorst: 0, simAvg: 0, simWorst: 0, samples: 0 };
    }
    const avg = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
    return {
      frameAvg: avg(this.frames),
      frameWorst: Math.max(...this.frames),
      simAvg: avg(this.sims),
      simWorst: Math.max(...this.sims),
      samples: n,
    };
  }
}
