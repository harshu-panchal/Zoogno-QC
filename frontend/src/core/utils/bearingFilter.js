import { shortestAngleDelta } from "./mapGeometry.js";

/**
 * Smooth bearing rotation — shortest path, filtered against GPS noise.
 */
export class BearingFilter {
  constructor(initial = 0, { smoothing = 0.12, minSpeedForGps = 1.2 } = {}) {
    this.current = initial;
    this.smoothing = smoothing;
    this.minSpeedForGps = minSpeedForGps;
    this.lastPosition = null;
  }

  reset(bearing = 0) {
    this.current = bearing;
    this.lastPosition = null;
  }

  /**
   * @param {number|null} gpsBearing - device heading (may be null when stationary)
   * @param {{ lat: number, lng: number }|null} position
   * @param {number|null} speed - m/s
   * @param {(from, to) => number} computeBearingFn
   */
  update(gpsBearing, position, speed, computeBearingFn) {
    let target = this.current;

    if (
      position &&
      this.lastPosition &&
      Number.isFinite(speed) &&
      speed >= this.minSpeedForGps
    ) {
      const moved =
        Math.abs(position.lat - this.lastPosition.lat) > 1e-6 ||
        Math.abs(position.lng - this.lastPosition.lng) > 1e-6;
      if (moved) {
        target = computeBearingFn(this.lastPosition, position);
      }
    } else if (
      Number.isFinite(gpsBearing) &&
      gpsBearing >= 0 &&
      Number.isFinite(speed) &&
      speed >= this.minSpeedForGps
    ) {
      target = gpsBearing;
    }

    if (position) this.lastPosition = { ...position };

    const delta = shortestAngleDelta(this.current, target);
    this.current = (this.current + delta * this.smoothing + 360) % 360;
    return this.current;
  }

  get() {
    return this.current;
  }
}
