export function latLngTo3D(lat: number, lng: number): [number, number, number] {
  const r = (lat * Math.PI) / 180
  const a = (lng * Math.PI) / 180 - Math.PI
  const o = Math.cos(r)
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)]
}

export function projectTo2D(
  v: [number, number, number],
  phi: number,
  theta: number,
): { x: number; y: number; visible: boolean } {
  const cr = Math.cos(theta), ca = Math.cos(phi)
  const sr = Math.sin(theta), sa = Math.sin(phi)
  const c = ca * v[0] + sa * v[2]
  const s = sa * sr * v[0] + cr * v[1] - ca * sr * v[2]
  const z = -sa * cr * v[0] + sr * v[1] + ca * cr * v[2]
  return { x: (c + 1) / 2, y: (-s + 1) / 2, visible: z >= 0 }
}
