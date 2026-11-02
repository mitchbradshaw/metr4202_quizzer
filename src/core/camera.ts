// Pinhole camera model (summary notes §7). Lengths in metres unless a function says otherwise.

/** Image size of an object of height h at depth Z: h' = f h / Z. */
export function imageSize(f: number, h: number, Z: number): number {
  return (f * h) / Z;
}

/** Depth from a measured image size: Z = f h / h'. */
export function depthFromImage(f: number, h: number, hImg: number): number {
  return (f * h) / hImg;
}

/** Focal length from a measured image size at a known depth: f = h' Z / h. */
export function focalFromImage(h: number, hImg: number, Z: number): number {
  return (hImg * Z) / h;
}

/** Object height from its image: h = h' Z / f. */
export function heightFromImage(f: number, hImg: number, Z: number): number {
  return (hImg * Z) / f;
}

export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];
export type V3 = [number, number, number];

/** Intrinsic matrix K: focal lengths in pixels (αx = f/ρw, αy = f/ρh), principal point (u0, v0), skew s. */
export function intrinsics(ax: number, ay: number, u0: number, v0: number, skew = 0): Mat3 {
  return [
    [ax, skew, u0],
    [0, ay, v0],
    [0, 0, 1],
  ];
}

function mulMV(M: Mat3, v: V3): V3 {
  return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
}

/**
 * World point → pixel: extrinsics (Xc = R Xw + t), perspective division (x = Xc/Zc, y = Yc/Zc),
 * then intrinsics ([u v 1]ᵀ = K [x y 1]ᵀ). Returns the camera-frame point too. Zc ≤ 0 is behind the camera.
 */
export function projectPoint(K: Mat3, R: Mat3, t: V3, Xw: V3): { Xc: V3; x: number; y: number; u: number; v: number; visible: boolean } {
  const Rx = mulMV(R, Xw);
  const Xc: V3 = [Rx[0] + t[0], Rx[1] + t[1], Rx[2] + t[2]];
  const x = Xc[0] / Xc[2];
  const y = Xc[1] / Xc[2];
  const p = mulMV(K, [x, y, 1]);
  return { Xc, x, y, u: p[0], v: p[1], visible: Xc[2] > 0 };
}
