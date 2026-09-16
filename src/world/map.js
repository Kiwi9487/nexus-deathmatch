/* ================= 地图：NEXUS 训练场 =================
 * Ascent 风格地中海庭院：暖色灰泥墙 + 石砖广场 + 中央喷泉
 * 布局：中央建筑（喷泉房间，S 型通路）+ 东西双车道 + 南北大区
 * 高架天桥（2.1m 平台，7 级台阶）提供垂直火力位
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { getMaterials, PALETTE } from './materials.js'
import { CFG } from '../config.js'
import { segVsBox, rayBox } from '../utils.js'

/* ---------- 数据：{x, z, w, d, h, mat, type} type: solid|step|oneWay ---------- */

const R = (w, d, h, mat, x, z, type = 'solid', y0 = 0) => ({ x, z, w, d, h, mat, type, y0 })

const DEFS = {
  solids: [
    // 边界围墙
    R(57.2, 0.6, 5.5, 'plaster', 0, -21), R(57.2, 0.6, 5.5, 'plaster', 0, 21),
    R(0.6, 42.6, 5.5, 'plaster', -28, 0), R(0.6, 42.6, 5.5, 'plaster', 28, 0),
    // 中央横向墙（东西两端留门 → 直通车道）
    R(20, 0.5, 4, 'stone', 0, -14), R(20, 0.5, 4, 'stone', 0, 14),
    // 左右车道中墙（竖向，z -6..6）
    R(0.5, 12, 4, 'stone', -14, 0), R(0.5, 12, 4, 'stone', 14, 0),
    // 中央喷泉房间（北墙东侧开门 / 南墙西侧开门 → S 型通路）
    R(7.5, 0.5, 4, 'stone', -1.25, -5), R(7.5, 0.5, 4, 'stone', 1.25, 5),
    R(0.5, 10, 4, 'stone', -5, 0), R(0.5, 10, 4, 'stone', 5, 0),
    // 东北露台墙（开门 x 22..24）与西南仓储墙（开门 x -24..-22）
    R(2, 0.5, 4, 'plaster', 15, -12), R(7.5, 0.5, 4, 'plaster', 24.25, -12),
    R(8, 0.5, 4, 'plaster', -18, 12), R(4, 0.5, 4, 'plaster', -26, 12),
    // 高架天桥支撑柱
    R(0.25, 0.25, 2.1, 'metal', 13.1, -10.1), R(0.25, 0.25, 2.1, 'metal', 13.1, -3.9),
    R(0.25, 0.25, 2.1, 'metal', 19.9, -10.1), R(0.25, 0.25, 2.1, 'metal', 19.9, -3.9),
    // 木箱（0.85 矮箱可跳上，1.7 高箱为完整掩体）
    R(0.85, 0.85, 1.7, 'wood', -20.5, -8.5), R(0.85, 0.85, 0.85, 'wood', -19.5, -8.5),
    R(0.85, 0.85, 0.85, 'wood', -21.5, -9.5), R(0.85, 0.85, 0.85, 'wood', -20.5, -10.5),
    R(0.85, 0.85, 0.85, 'wood', -11, 9), R(0.85, 0.85, 1.7, 'wood', -10, 10),
    R(0.85, 0.85, 0.85, 'wood', 20, 12), R(0.85, 0.85, 0.85, 'wood', 21, 11),
    R(0.85, 0.85, 1.7, 'wood', 22, 12),
    R(0.85, 0.85, 0.85, 'wood', 6, -18), R(0.85, 0.85, 1.7, 'wood', 7, -17.5),
    R(0.85, 0.85, 0.85, 'wood', -6, 17), R(0.85, 0.85, 1.7, 'wood', -5, 18),
    R(0.85, 0.85, 0.85, 'wood', 0, -17.5), R(0.85, 0.85, 0.85, 'wood', -19, 12.5),
    R(0.85, 0.85, 0.85, 'wood', 25, -4),
    // 油桶
    R(0.75, 0.75, 1, 'metal', 13, 17), R(0.75, 0.75, 1, 'metal', 13.9, 16.4),
    R(0.75, 0.75, 1, 'metal', 12.2, 16.6), R(0.75, 0.75, 1, 'metal', -16, 4.5),
    R(0.75, 0.75, 1, 'metal', -16.9, 5.3), R(0.75, 0.75, 1, 'metal', 17, -2),
    R(0.75, 0.75, 1, 'metal', -12, -18.5),
    // 花坛（0.5 低掩体）
    R(1.4, 0.6, 0.5, 'stone', -4, -19), R(1.4, 0.6, 0.5, 'stone', -2, -19),
    R(1.4, 0.6, 0.5, 'stone', 3, 19), R(1.4, 0.6, 0.5, 'stone', 5, 19),
    R(1.4, 0.6, 0.5, 'stone', -25, 4), R(1.4, 0.6, 0.5, 'stone', 26, -16),
    R(1.4, 0.6, 0.5, 'stone', 24.5, -17),
    // 喷泉：底座 + 中央立柱
    R(3.6, 3.6, 0.5, 'stoneLight', 0, 0), R(1.1, 1.1, 1.5, 'stone', 0, 0),
  ],

  steps: [
    // 天桥台阶（7 级，从 z=-14.4 一路走上 2.1m 平台）
    R(1.5, 0.6, 0.3, 'stone', 16.75, -14.4), R(1.5, 0.6, 0.6, 'stone', 16.75, -13.8),
    R(1.5, 0.6, 0.9, 'stone', 16.75, -13.2), R(1.5, 0.6, 1.2, 'stone', 16.75, -12.6),
    R(1.5, 0.6, 1.5, 'stone', 16.75, -12.0), R(1.5, 0.6, 1.8, 'stone', 16.75, -11.4),
    R(1.5, 0.6, 2.1, 'stone', 16.75, -10.8),
  ],

  oneWays: [
    // 天桥平台（顶部 2.1m，可从台阶登入）
    R(7, 7, 0.25, 'stoneLight', 16.5, -7, 'oneWay', 2.1),
  ],

  railings: [
    R(1.7, 0.12, 1, 'railing', 15.35, -10.44, 'solid', 2.1), R(2.5, 0.12, 1, 'railing', 18.75, -10.44, 'solid', 2.1),
    R(0.12, 7, 1, 'railing', 20.06, -7, 'solid', 2.1), R(0.12, 7, 1, 'railing', 12.94, -7, 'solid', 2.1),
  ],
}

/* ---------- 碰撞 / 导航图 ---------- */

function finalize(list) {
  for (const b of list) {
    b.y0 = b.y0 || 0
    b.min = [b.x - b.w / 2, b.y0, b.z - b.d / 2]
    b.max = [b.x + b.w / 2, b.y0 + b.h, b.z + b.d / 2]
    b.top = b.y0 + b.h
    b.cx = b.x; b.cz = b.z
  }
  return list
}

const solids = finalize(DEFS.solids)
const steps = finalize(DEFS.steps)
const oneWays = finalize(DEFS.oneWays)
const railings = finalize(DEFS.railings)

/** 全域地面（y=0，可站立 / 子弹可命中，但水平不阻挡） */
const FLOOR = { min: [-30, -0.05, -23], max: [30, 0, 23], top: 0, mat: 'stone', type: 'floor' }

/** 水平碰撞体（机器人/玩家圆形碰撞） */
const groundColliders = [...solids]
/** 子弹阻挡体（一切实体） */
const rayBoxes = [...solids, ...oneWays, ...railings, FLOOR]
/** 站立面（地面检测） */
const standBoxes = [...solids, ...steps, ...oneWays, FLOOR]
/** 导航阻挡（高度 ≥ 0.4 的地面障碍） */
const navBlockers = [...solids, ...railings].filter((b) => b.h >= 0.4)

/* ---------- static ray BVH: hitscan / sight acceleration ---------- */
let rayTree = null
function buildRayTree() {
  const boxes = rayBoxes.map((b) => ({ b, min: b.min, max: b.max }))
  const build = (list) => {
    const node = { boxes: null, left: null, right: null, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    for (const q of list) {
      for (let i = 0; i < 3; i++) {
        if (q.min[i] < node.min[i]) node.min[i] = q.min[i]
        if (q.max[i] > node.max[i]) node.max[i] = q.max[i]
      }
    }
    if (list.length <= 8) { node.boxes = list; return node }
    let axis = 0
    if (node.max[2] - node.min[2] > node.max[0] - node.min[0]) axis = 2
    list.sort((a, q) => a.min[axis] - q.min[axis])
    const mid = list.length >> 1
    node.left = build(list.slice(0, mid))
    node.right = build(list.slice(mid))
    return node
  }
  rayTree = build(boxes)
}

/** world raycast: nearest static collider hit within maxDist, returns {t, b, n}; skip ignores one box (penetration) */
export function rayCast(ox, oy, oz, dx, dy, dz, maxDist, skip = null) {
  if (!rayTree) buildRayTree()
  const origin = [ox, oy, oz]
  const inv = [1 / (dx || 1e-12), 1 / (dy || 1e-12), 1 / (dz || 1e-12)]
  let bestT = maxDist, bestB = null, bestN = null
  const stack = [rayTree]
  while (stack.length) {
    const node = stack.pop()
    let tmin = 0, tmax = Infinity
    let miss = false
    for (let i = 0; i < 3; i++) {
      let t1 = (node.min[i] - origin[i]) * inv[i]
      let t2 = (node.max[i] - origin[i]) * inv[i]
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
      if (t1 > tmin) tmin = t1
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) { miss = true; break }
    }
    if (miss || tmin >= bestT) continue
    if (node.boxes) {
      for (const q of node.boxes) {
        if (q.b === skip) continue
        const r = rayBox(origin, [dx, dy, dz], q)
        if (r !== -1 && r.t < bestT) { bestT = r.t; bestB = q.b; bestN = r.n }
      }
    } else {
      stack.push(node.right, node.left)
    }
  }
  return { t: bestT, b: bestB, n: bestN }
}

/* ---------- 导航节点 ---------- */
const NAV = [
  [-24, -18], [-20, -14], [-24, -9], [-18, -5], [-13, -14],
  [-5, -11], [5, -11], [-4, -4], [4, 4], [0, 11], [-7, 11], [7, 11],
  [-20, 11], [-24, 14], [-20, 17], [-14.5, 13], [20, -14], [24, -9],
  [22, -3], [19, -1], [25, -10], [19, -13], [20, 9], [24, 14], [17, 13],
  [24, 4], [16, 18], [19, -2], [-9.5, 0], [-9.5, 5.5], [-20, 0],
  [-5, -17], [5, -17], [0, -19], [12, -17], [-16, -17], [16, -18],
  [22, -17], [8, 17], [-12, 17], [12, 12], [20, 17], [-24, 17],
  // 高架天桥（2.1m 平台，经台阶可达）
  [16.75, -14.3], [16.75, -10.2], [16.5, -8], [15.5, -5], [16.5, -4.5],
  [18.5, -13], [18.5, -11],
  // S 型通路 / 门洞 / 中路 / 房间内
  [12, -16], [12, -10], [4, -7], [4, -3], [-4, 3], [-4, 7],
  // 南墙 z=14 两侧门洞（x -14..-10 / x 10..14）
  [-12, 12], [-12, 16], [12, 15],
  // 东北露台门 x 22..24 与西南仓储门 x -24..-22
  [-20, 6], [-23, 10], [-23, 14],
]

/** 返回脚下最高地面高度（feetY 上方 0.15 内可站立） */
export function groundYUnder(px, pz, feetY, vy) {
  let gy = -Infinity
  for (let i = 0; i < standBoxes.length; i++) {
    const b = standBoxes[i]
    if (px < b.min[0] - 0.3 || px > b.max[0] + 0.3) continue
    if (pz < b.min[2] - 0.3 || pz > b.max[2] + 0.3) continue
    if (b.type === 'oneWay' && vy > 0) continue
    if (b.top > feetY + 0.15) continue
    if (b.top > gy) gy = b.top
  }
  return gy === -Infinity ? null : gy
}

/** 行走阻挡体：实体墙 + 栏杆 + 台阶（高度 >= 0.4 才挡人） */
const walkSolids = [...solids, ...railings, ...steps].filter((b) => b.h >= 0.4)
const groundAt = (x, z) => groundYUnder(x, z, 100, -1) ?? 0

/** 每个导航节点的高度：0=地面，>1=高台 */
const nodeH = NAV.map(([x, z]) => groundAt(x, z))

function pointBlocked(x, y, z) {
  for (let i = 0; i < walkSolids.length; i++) {
    const b = walkSolids[i]
    if (x < b.min[0] - 0.25 || x > b.max[0] + 0.25) continue
    if (z < b.min[2] - 0.25 || z > b.max[2] + 0.25) continue
    if (y <= b.y0 || y >= b.y0 + b.h) continue
    return true
  }
  return false
}

/** 判断两导航节点间是否可步行（高度差 <=0.37 且无阻挡） */
function walkableSeg(x1, z1, x2, z2, hStart, hGoal) {
  const dx = x2 - x1, dz = z2 - z1
  const len = Math.hypot(dx, dz)
  const n = Math.max(1, Math.ceil(len / 0.4))
  let h = hStart
  for (let s = 1; s <= n; s++) {
    const t = s / n
    const x = x1 + dx * t, z = z1 + dz * t
    if (pointBlocked(x, h + 0.5, z)) return false
    const g = groundYUnder(x, z, h + 0.2, -1)
    if (g === null) continue
    if (g > h + 0.37) return false
    h = Math.max(g, h - 1.3)
  }
  return Math.abs(h - hGoal) <= 0.45 && !pointBlocked(x2, h + 0.5, z2)
}

let navEdges = null
function buildNav() {
  navEdges = NAV.map(() => [])
  for (let i = 0; i < NAV.length; i++) {
    for (let j = 0; j < NAV.length; j++) {
      if (i === j) continue
      const dx = NAV[i][0] - NAV[j][0], dz = NAV[i][1] - NAV[j][1]
      if (dx * dx + dz * dz > 81) continue
      if (!walkableSeg(NAV[i][0], NAV[i][1], NAV[j][0], NAV[j][1], nodeH[i], nodeH[j])) continue
      navEdges[i].push(j)
    }
  }
}

/** 两点间是否有清晰视线（用于 AI 预瞄与路径检查） */
export function lineClear(x1, z1, x2, z2) {
  for (let i = 0; i < walkSolids.length; i++) {
    const b = walkSolids[i]
    if (b.y0 > 1) continue
    const box = {
      min: [b.min[0] - 0.2, b.y0 - 0.1, b.min[2] - 0.2],
      max: [b.max[0] + 0.2, b.y0 + b.h + 0.1, b.max[2] + 0.2],
    }
    if (segVsBox(x1, 0.5, z1, x2, 0.5, z2, box)) return false
  }
  return true
}

function nearestNode(x, z) {
  let best = 0, bestD = Infinity
  for (let i = 0; i < NAV.length; i++) {
    const dx = NAV[i][0] - x, dz = NAV[i][1] - z
    const d = dx * dx + dz * dz
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/** A* 寻路：返回节点索引路径（不含起点） */
export function findPath(x1, z1, x2, z2) {
  const start = nearestNode(x1, z1)
  const goal = nearestNode(x2, z2)
  if (start === goal) return [goal]
  const open = [{ i: start, g: 0, f: 0 }]
  const came = new Int32Array(NAV.length).fill(-2)
  const gScore = new Float64Array(NAV.length).fill(Infinity)
  gScore[start] = 0
  const h = (i) => {
    const dx = NAV[i][0] - x2, dz = NAV[i][1] - z2
    return Math.sqrt(dx * dx + dz * dz)
  }
  let guard = 0
  while (open.length && guard++ < 2000) {
    open.sort((a, b) => a.f - b.f)
    const cur = open.shift()
    if (cur.i === goal) {
      const path = []
      let n = goal
      while (n !== start) { path.unshift(n); n = came[n] }
      return path
    }
    for (const nb of navEdges[cur.i]) {
      const dx = NAV[nb][0] - NAV[cur.i][0], dz = NAV[nb][1] - NAV[cur.i][1]
      const w = Math.sqrt(dx * dx + dz * dz)
      const ng = cur.g + w
      if (ng < gScore[nb]) {
        gScore[nb] = ng
        came[nb] = cur.i
        open.push({ i: nb, g: ng, f: ng + h(nb) })
      }
    }
  }
  return []
}

/** 地面上方判定：返回脚下地面高度（feetY 上方 0.15 内的平台顶） */
export const world = {
  solids, steps, oneWays, railings,
  groundColliders, rayBoxes, standBoxes,
  findPath, groundYUnder, lineClear, rayCast,
  climbables: [...steps, ...oneWays],
  navHeights: nodeH,
  spawns: CFG.spawns.map((s) => ({ x: s[0], z: s[1] })),
  getNavPoint(i) { return NAV[i] },
  getEdges(i) { return navEdges[i] },
  navCount: NAV.length,
}

/* ---------- 可视化 ---------- */

const MAT_KEYS = {
  plaster: 'plaster', stone: 'stone', wood: 'wood', metal: 'metal',
  plant: 'plant', stoneLight: 'stoneLight', trim: 'trim', railing: 'railing',
}

function boxGeo(b) {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d)
  g.translate(b.x, b.y0 + b.h / 2, b.z)
  return g
}

export function buildMap(scene) {
  const M = getMaterials()
  const merged = {} // mat → {geos: [], list: []}

  const add = (b, mat) => {
    const key = MAT_KEYS[mat] || mat
    if (!merged[key]) merged[key] = []
    merged[key].push(boxGeo(b))
  }
  for (const b of [...solids, ...steps, ...oneWays, ...railings]) add(b, b.mat)

  for (const [key, geos] of Object.entries(merged)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), M[key])
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(58, 44), M.floor)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // 中央房间门廊拱架（纯装饰）
  for (const [ax, az] of [[3.75, -5], [-3.75, 5]]) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 0.55), M.arch)
    arch.position.set(ax, 2.55, az)
    arch.castShadow = true
    scene.add(arch)
  }

  // 围墙内侧霓虹饰条（Valorant 感）
  const trim = new THREE.Mesh(new THREE.BoxGeometry(40, 0.1, 0.08), M.trim)
  trim.position.set(0, 2.5, -20.35); scene.add(trim)
  trim.position.set(0, 2.5, 20.35); scene.add(trim.clone())
  const trimX = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 40), M.trim)
  trimX.position.set(-27.35, 2.5, 0); scene.add(trimX)
  trimX.position.set(27.35, 2.5, 0); scene.add(trimX.clone())

  // 喷泉水池 + 水面
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.55, 28), M.water)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.52, 0)
  scene.add(water)

  // 地毯
  for (const [x, z, w, d, mat] of [[-24, 14, 6, 4, 'rugA'], [24, -9, 6, 4, 'rugB'], [0, 17, 5, 3, 'rugA']]) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M[mat])
    rug.rotation.x = -Math.PI / 2
    rug.position.set(x, 0.012, z)
    scene.add(rug)
  }

  // 花坛灌木
  for (const b of solids.filter((s) => s.mat === 'stone' && s.h === 0.5)) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(b.w * 0.55, 0), M.plant)
    bush.position.set(b.x, 0.75, b.z)
    bush.scale.set(1, 0.62, 1.4)
    bush.castShadow = true
    scene.add(bush)
  }

  // 油桶装饰顶
  for (const b of solids.filter((s) => s.mat === 'metal' && s.h === 1)) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 14), M.metal)
    cap.position.set(b.x, 1.03, b.z)
    scene.add(cap)
  }

  // 棕榈树（纯装饰，不挡弹道）
  for (const [x, z] of [[12, -19], [14, -18], [-12, 19], [-14, 18], [0, 19], [-26, -17], [26, 17]]) {
    const palm = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 3.4, 7), M.trunk)
    trunk.position.y = 1.7
    palm.add(trunk)
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 5), M.leaf)
      frond.scale.set(0.5, 1, 0.22)
      const a = (i / 7) * Math.PI * 2
      frond.position.set(Math.cos(a) * 0.9, 3.5, Math.sin(a) * 0.9)
      frond.rotation.z = Math.cos(a) * 0.9 - 0.5
      frond.rotation.x = -Math.sin(a) * 0.9
      palm.add(frond)
    }
    palm.position.set(x, 0, z)
    palm.scale.setScalar(1 + Math.random() * 0.2)
    scene.add(palm)
  }

  // 车道地标线
  for (const [x, z, w, d] of [[-21, 0, 0.22, 10], [21, 0, 0.22, 10], [0, -17.5, 9, 0.22], [0, 17.5, 9, 0.22]]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.laneLine)
    line.rotation.x = -Math.PI / 2
    line.position.set(x, 0.012, z)
    scene.add(line)
  }

  buildNav()
  buildDecor(scene)
  mergeStatic(scene)

  return world
}

/* ---------- static decor batching: merge meshes by material, fewer draw calls ---------- */
function mergeStatic(scene) {
  scene.updateMatrixWorld(true)
  const meshes = []
  const walk = (obj) => {
    if (obj.isMesh) { meshes.push(obj); return }
    for (const c of obj.children) walk(c)
  }
  walk(scene)
  // group by material + geometry type: keeps attribute sets compatible
  const byMat = new Map()
  for (const m of meshes) {
    if (m.userData.speed !== undefined) continue
    if (!m.material || m.material.isShaderMaterial) continue
    if (!m.geometry || m.geometry.attributes.position.count < 3) continue
    const key = m.material.uuid + '|' + m.geometry.type
    let list = byMat.get(key)
    if (!list) { list = []; byMat.set(key, list) }
    list.push(m)
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue
    const geos = []
    let cast = false, receive = false
    for (const m of list) {
      geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld))
      if (m.castShadow) cast = true
      if (m.receiveShadow) receive = true
    }
    let merged = null
    try { merged = mergeGeometries(geos) } catch { /* incompatible attributes: keep separate */ }
    for (const g of geos) g.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = cast
    mesh.receiveShadow = receive
    scene.add(mesh)
    for (const m of list) if (m.parent) m.parent.remove(m)
  }
}

/* ================= 装饰细节（纯视觉，无碰撞） ================= */
function buildDecor(scene) {
  const M = getMaterials()
  const dMats = {
    frame: new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.85 }),
    frameLight: new THREE.MeshStandardMaterial({ color: 0x6b5b48, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x7fa8c9, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0xc46a3a, roughness: 0.95, side: THREE.DoubleSide }),
    canvas2: new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.95, side: THREE.DoubleSide }),
    pole: new THREE.MeshStandardMaterial({ color: 0x5a5144, roughness: 0.7, metalness: 0.3 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x6a6f78, roughness: 0.55, metalness: 0.5 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.6 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb95e, emissiveIntensity: 1.8 }),
    pot: new THREE.MeshStandardMaterial({ color: 0x8a4a30, roughness: 0.9 }),
    drain: new THREE.MeshStandardMaterial({ color: 0x3f444d, roughness: 0.7, metalness: 0.6 }),
    banner: new THREE.MeshStandardMaterial({ color: 0xd8452f, roughness: 0.9, side: THREE.DoubleSide }),
    banner2: new THREE.MeshStandardMaterial({ color: 0xe8c33a, roughness: 0.9, side: THREE.DoubleSide }),
  }

  /* --- 遮阳棚（帆布 + 木架） --- */
  const awnings = [
    { x: -14.5, z: -13.5, y: 3.4, ry: 0, w: 5.2, d: 2.2, canvas: 'canvas' },   // 西区入口
    { x: 14.5, z: -13.5, y: 3.4, ry: 0, w: 5.2, d: 2.2, canvas: 'canvas2' },  // 东区入口
    { x: 0, z: 6.2, y: 4.0, ry: Math.PI, w: 4.6, d: 2.0, canvas: 'canvas2' }, // 中央房间南门
    { x: -25.5, z: 13, y: 3.6, ry: Math.PI / 2, w: 4.4, d: 2.0, canvas: 'canvas' }, // 西南
  ]
  for (const a of awnings) {
    const grp = new THREE.Group()
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(a.w, 0.06, a.d), dMats[a.canvas])
    cloth.position.set(0, 0, 0)
    cloth.rotation.x = 0.28
    cloth.position.z = -0.35
    grp.add(cloth)
    // 木架
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), dMats.pole)
      post.position.set((a.w / 2 - 0.2) * sx, -0.9, 0.9)
      grp.add(post)
    }
    // 波浪边
    for (let i = 0; i < 5; i++) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(a.w / 5 - 0.03, 0.16, 0.04), dMats[a.canvas])
      flap.position.set(-a.w / 2 + a.w / 10 + (i * a.w) / 5, -0.08 - (i % 2) * 0.05, 0.62)
      grp.add(flap)
    }
    grp.position.set(a.x, a.y, a.z)
    grp.rotation.y = a.ry
    scene.add(grp)
  }

  /* --- 窗户（窗框 + 玻璃 + 十字棂） --- */
  const windows = [
    { x: -10.5, y: 2.6, z: -14.25, ry: 0, w: 2.2, h: 1.4 },
    { x: -7.5, y: 2.6, z: -14.25, ry: 0, w: 2.2, h: 1.4 },
    { x: 7.5, y: 2.6, z: 14.25, ry: Math.PI, w: 2.2, h: 1.4 },
    { x: 10.5, y: 2.6, z: 14.25, ry: Math.PI, w: 2.2, h: 1.4 },
    { x: -14.25, y: 2.6, z: 9.5, ry: Math.PI / 2, w: 2.2, h: 1.4 },
    { x: -14.25, y: 2.6, z: 12.5, ry: Math.PI / 2, w: 2.2, h: 1.4 },
    { x: 14.25, y: 2.6, z: -2.5, ry: -Math.PI / 2, w: 2.2, h: 1.4 },
    { x: 14.25, y: 2.6, z: 2.5, ry: -Math.PI / 2, w: 2.2, h: 1.4 },
    { x: -27.75, y: 2.6, z: -8, ry: Math.PI / 2, w: 2.2, h: 1.4 },
    { x: 27.75, y: 2.6, z: 8, ry: Math.PI / 2, w: 2.2, h: 1.4 },
  ]
  for (const wd of windows) {
    const grp = new THREE.Group()
    const glass = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, 0.06), dMats.glass)
    grp.add(glass)
    // 十字窗棂
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.08, 0.07, 0.08), dMats.frame))
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, wd.h + 0.08, 0.08), dMats.frame))
    // 窗台
    const sill = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.25, 0.09, 0.3), dMats.frameLight)
    sill.position.set(0, -wd.h / 2 - 0.06, 0.08)
    grp.add(sill)
    grp.position.set(wd.x, wd.y, wd.z)
    grp.rotation.y = wd.ry
    scene.add(grp)
  }

  /* --- 壁灯 --- */
  const lamps = [
    { x: -12.5, z: -13.8, ry: 0 }, { x: 12.5, z: 13.8, ry: Math.PI },
    { x: -13.8, z: 6.5, ry: Math.PI / 2 }, { x: 13.8, z: -6.5, ry: -Math.PI / 2 },
    { x: -26.2, z: 10, ry: Math.PI / 2 }, { x: 26.2, z: -10, ry: -Math.PI / 2 },
    { x: -3.5, z: -20.8, ry: 0 }, { x: 3.5, z: 20.8, ry: Math.PI },
  ]
  for (const l of lamps) {
    const grp = new THREE.Group()
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), dMats.lamp)
    arm.position.set(0, 0.2, 0)
    arm.rotation.z = Math.PI / 2 - 0.35
    grp.add(arm)
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dMats.lampGlow)
    glow.position.set(0.28, -0.05, 0)
    grp.add(glow)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 8), dMats.lamp)
    shade.position.set(0.28, 0.06, 0)
    shade.rotation.z = -Math.PI / 2
    grp.add(shade)
    grp.position.set(l.x, 2.5, l.z)
    grp.rotation.y = l.ry
    scene.add(grp)
  }

  /* --- 管道（墙角竖管 + 横管） --- */
  const pipes = [
    { x: -27.6, z: -10, len: 5, ry: 0 },
    { x: 27.6, z: 10, len: 5, ry: 0 },
    { x: -10, z: -20.6, len: 5, ry: Math.PI / 2 },
    { x: 10, z: 20.6, len: 5, ry: Math.PI / 2 },
    { x: 14, z: -20.6, len: 5, ry: Math.PI / 2 },
  ]
  for (const p of pipes) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, p.len, 8), dMats.pipe)
    tube.position.set(p.x, p.len / 2, p.z)
    tube.rotation.y = p.ry
    scene.add(tube)
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 8), dMats.pipe)
    joint.position.set(p.x, p.len - 0.4, p.z)
    joint.rotation.y = p.ry
    scene.add(joint)
  }

  /* --- 通风口（百叶） --- */
  const vents = [
    { x: -20.8, z: -6.5, ry: 0 }, { x: 20.8, z: 6.5, ry: Math.PI },
  ]
  for (const v of vents) {
    const grp = new THREE.Group()
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.1), dMats.frame))
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.04), dMats.pipe)
      slat.position.set(0, 0.3 - i * 0.15, 0.05)
      slat.rotation.x = 0.4
      grp.add(slat)
    }
    grp.position.set(v.x, 2.0, v.z)
    grp.rotation.y = v.ry
    scene.add(grp)
  }

  /* --- 涂鸦（canvas 纹理贴墙） --- */
  function graffiti(text, color, x, y, z, ry, w, h) {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = 'rgba(255,255,255,0.06)'
    g.fillRect(0, 0, 256, 128)
    g.fillStyle = color
    g.font = 'bold 88px Segoe UI, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.save()
    g.translate(128, 64)
    g.rotate(-0.06)
    g.fillText(text, 0, 0)
    g.restore()
    g.strokeStyle = 'rgba(20,20,20,0.5)'
    g.lineWidth = 10
    g.strokeRect(0, 0, 256, 128)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
    )
    mesh.position.set(x, y, z)
    mesh.rotation.y = ry
    scene.add(mesh)
  }
  graffiti('NEXUS', 'rgba(232,120,90,0.9)', -27.92, 2.3, -4, Math.PI / 2, 2.6, 1.3)
  graffiti('DM', 'rgba(126,162,255,0.85)', 27.92, 2.1, 4, -Math.PI / 2, 1.8, 1.1)
  graffiti('⚡', 'rgba(245,185,66,0.9)', -9.8, 1.9, -20.92, 0, 1.2, 1.2)

  /* --- 盆栽 --- */
  for (const [x, z] of [[-24, -19.5], [24, 19.5], [-19.5, 17.5], [19.5, -17.5], [-1.5, -20.6], [1.5, 20.6], [0, 8], [8, 16.5]]) {
    const grp = new THREE.Group()
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.4, 10), dMats.pot)
    pot.position.y = 0.2
    grp.add(pot)
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), M.plant)
    plant.position.y = 0.6
    plant.scale.set(1, 1.3, 1)
    grp.add(plant)
    grp.position.set(x, 0, z)
    grp.rotation.y = Math.random() * Math.PI
    scene.add(grp)
  }

  /* --- 井盖 --- */
  for (const [x, z] of [[-6, -9], [6, 9], [-16, 4], [16, -4]]) {
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20), dMats.drain)
    cover.position.set(x, 0.02, z)
    scene.add(cover)
  }

  /* --- 三角旗横幅 --- */
  for (const [x, z, len, color] of [[-4.5, -14.05, 7, 'banner'], [4.5, 14.05, 7, 'banner2'], [-14.05, -3, 6, 'banner2'], [14.05, 3, 6, 'banner']]) {
    const grp = new THREE.Group()
    for (let i = 0; i < 6; i++) {
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), dMats[color])
      flag.position.set(-len / 2 + (i * len) / 5, -0.12 - (i % 2) * 0.08, 0)
      flag.rotation.x = Math.PI / 2
      grp.add(flag)
    }
    grp.position.set(x, 4.1, z)
    scene.add(grp)
  }

  /* --- 远景建筑剪影（地平线，提升远景层次） --- */
  const skyline = new THREE.Group()
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x9aa4b5, roughness: 1, metalness: 0 })
  const silhouettes = [
    { x: -85, z: -110, w: 24, h: 18, d: 20 }, { x: -60, z: -108, w: 16, h: 26, d: 18 },
    { x: -38, z: -112, w: 20, h: 14, d: 20 }, { x: -10, z: -110, w: 26, h: 22, d: 22 },
    { x: 18, z: -112, w: 18, h: 16, d: 18 }, { x: 40, z: -109, w: 22, h: 28, d: 20 },
    { x: 66, z: -112, w: 16, h: 18, d: 18 }, { x: 88, z: -108, w: 22, h: 24, d: 20 },
    { x: 100, z: 60, w: 20, h: 20, d: 18 }, { x: 78, z: 58, w: 16, h: 26, d: 16 },
    { x: 54, z: 62, w: 22, h: 16, d: 20 }, { x: -62, z: 60, w: 24, h: 20, d: 22 },
    { x: -88, z: 58, w: 18, h: 26, d: 18 }, { x: -100, z: 30, w: 20, h: 18, d: 20 },
  ]
  for (const s of silhouettes) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), silhouette)
    b.position.set(s.x, s.h / 2, s.z)
    skyline.add(b)
    // 顶部水箱/天线
    if (Math.random() > 0.4) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 10), silhouette)
      tank.position.set(s.x + s.w / 4, s.h + 1.5, s.z)
      skyline.add(tank)
    }
  }
  scene.add(skyline)
}

/** 小地图矩形（用于 UI 绘制） */
export function minimapRects() {
  const out = []
  const push = (list) => {
    for (const b of list) out.push({ x: b.x, z: b.z, w: b.w, d: b.d, type: b.type })
  }
  push(solids); push(steps); push(oneWays)
  return out
}

/** 出生点选择：远离所有存活敌人的点 */
export function pickSpawn(living) {
  const spawns = CFG.spawns.map((s) => ({ x: s[0], z: s[1] }))
  let best = spawns[0], bestScore = -Infinity
  for (const s of spawns) {
    let minD = Infinity
    for (const e of living) {
      // 实体可能是 Bot 对象（.pos.x）或纯坐标 {x, z}
      const ex = e.pos ? e.pos.x : e.x
      const ez = e.pos ? e.pos.z : e.z
      const d = Math.hypot(s.x - ex, s.z - ez)
      if (d < minD) minD = d
    }
    const score = minD + Math.random() * 2
    if (score > bestScore) { bestScore = score; best = s }
  }
  return best
}
