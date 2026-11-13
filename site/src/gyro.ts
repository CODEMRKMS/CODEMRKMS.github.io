import type { PointField } from './gl/field';

/**
 * Gyroscope parallax for phones and tablets. It only listens and never asks: iOS sends no orientation events
 * until a permission prompt has been accepted, and a portfolio should not open with one, so there the listener
 * simply stays silent and touch parallax remains. The pose the device is held in counts as neutral and re-centres slowly, so reading in bed works as well as at a desk.
 */
export function initGyro(field: PointField) {
  if (!('DeviceOrientationEvent' in window)) return;
  let g0: number | null = null, b0 = 0;
  const RANGE = 22; // degrees of tilt for full travel
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    // in landscape the two axes swap roles
    const land = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90;
    const side = land ? e.beta : e.gamma, tip = land ? e.gamma : e.beta;
    if (g0 === null) { g0 = side; b0 = tip; }
    g0 += (side - g0) * 0.004; b0 += (tip - b0) * 0.004;
    const x = Math.max(-1, Math.min(1, (side - g0) / RANGE)), y = Math.max(-1, Math.min(1, (tip - b0) / RANGE));
    field.setTilt(x, -y);
  }, { passive: true });
}
