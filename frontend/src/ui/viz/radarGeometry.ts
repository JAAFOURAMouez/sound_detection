// Géométrie du radar : le temps est l'angle, le score est la distance au centre.

/** Angle (radians, 0 = midi, sens horaire) correspondant à l'instant `seconds`. */
export function angleForTime(seconds: number, periodSeconds: number): number {
  const turns = (((seconds % periodSeconds) + periodSeconds) % periodSeconds) / periodSeconds;
  return turns * 2 * Math.PI;
}

/** Coordonnées canvas d'un point (angle depuis midi, sens horaire ; rayon en pixels). */
export function polarToCanvas(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}
