/* ================= 数学与几何工具 ================= */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt))
export const rand = (a, b) => a + Math.random() * (b - a)
export const randInt = (a, b) => Math.floor(rand(a, b + 1))
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export const deg2rad = (d) => (d * Math.PI) / 180
export const TAU = Math.PI * 2

/** 射线 vs AABB —— 返回 {t, n:法线向量} 或 -1 */
export function rayBox(origin, dir, b) {
  let tmin = 0, tmax = Infinity, axis = -1
  for (let i = 0; i < 3; i++) {
    const o = origin[i], d = dir[i]
    if (Math.abs(d) < 1e-9) {
      if (o < b.min[i] || o > b.max[i]) return -1
      continue
    }
    let t1 = (b.min[i] - o) / d, t2 = (b.max[i] - o) / d
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
    if (t1 > tmin) { tmin = t1; axis = i }
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return -1
  }
  if (tmax < 0) return -1
  const n = [0, 0, 0]
  if (axis >= 0) n[axis] = dir[axis] > 0 ? -1 : 1
  return { t: Math.max(0, tmin), n }
}

/** 射线 vs 垂直胶囊（a,b 为轴线两端，r 为半径）—— 返回 t 或 -1 */
export function rayCapsule(origin, dir, a, b, r) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
  const w = [a[0] - origin[0], a[1] - origin[1], a[2] - origin[2]]
  const wd = w[0] * dir[0] + w[1] * dir[1] + w[2] * dir[2]
  const abd = ab[0] * dir[0] + ab[1] * dir[1] + ab[2] * dir[2]
  const wab = w[0] * ab[0] + w[1] * ab[1] + w[2] * ab[2]
  const denom = ab2 - abd * abd
  let s
  if (denom < 1e-9) s = 0
  else s = (wd * abd - wab) / denom
  s = clamp(s, 0, 1)
  let t = wd + s * abd
  if (t < 0) {
    // 射线起点在胶囊后方：检查起点是否在胶囊内
    const s0 = clamp(wab / (ab2 || 1e-9), 0, 1)
    const qx = a[0] + s0 * ab[0] - origin[0]
    const qy = a[1] + s0 * ab[1] - origin[1]
    const qz = a[2] + s0 * ab[2] - origin[2]
    return qx * qx + qy * qy + qz * qz <= r * r ? 0 : -1
  }
  const px = a[0] + s * ab[0] - origin[0] - t * dir[0]
  const py = a[1] + s * ab[1] - origin[1] - t * dir[1]
  const pz = a[2] + s * ab[2] - origin[2] - t * dir[2]
  const d2 = px * px + py * py + pz * pz
  if (d2 > r * r) return -1
  const near = t - Math.sqrt(r * r - d2)
  return near > 0 ? near : 0
}

/** 线段 vs AABB —— 返回是否相交 */
export function segVsBox(ax, ay, az, bx, by, bz, box) {
  let tmin = 0, tmax = 1
  const a = [ax, ay, az], d = [bx - ax, by - ay, bz - az]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (a[i] < box.min[i] || a[i] > box.max[i]) return false
    } else {
      let t1 = (box.min[i] - a[i]) / d[i], t2 = (box.max[i] - a[i]) / d[i]
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return false
    }
  }
  return true
}

/** 圆（x,z）vs AABB 水平碰撞 —— 将圆推出 */
export function resolveCircle(pos, r, boxes) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const nx = clamp(pos.x, b.min[0], b.max[0])
      const nz = clamp(pos.z, b.min[2], b.max[2])
      let dx = pos.x - nx, dz = pos.z - nz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      const d = Math.sqrt(d2) || 1e-6
      const push = (r - d) / d
      pos.x += dx * push
      pos.z += dz * push
    }
  }
}

/** 判断圆（x,z）是否与 AABB 相交 */
export function circleHits(px, pz, r, b) {
  const nx = clamp(px, b.min[0], b.max[0])
  const nz = clamp(pz, b.min[2], b.max[2])
  const dx = px - nx, dz = pz - nz
  return dx * dx + dz * dz < r * r
}

/** 射线在水平圆锥内的随机偏移方向（spread 为弧度半锥角）—— 返回数组（rayBox 按索引访问） */
export function coneDir(forward, right, up, spread) {
  const r = Math.sqrt(Math.random()) * spread
  const th = Math.random() * TAU
  const dx = Math.cos(th) * r
  const dy = Math.sin(th) * r
  return [
    forward[0] + right[0] * dx + up[0] * dy,
    forward[1] + right[1] * dx + up[1] * dy,
    forward[2] + right[2] * dx + up[2] * dy,
  ]
}

export const norm = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
