/* ================= 武器：定义 + 第一人称模型（高精度重构） =================
 * M4A1-S / 沙漠之鹰 / Karambit 剥皮小刀 / Ion 离子大狙
 *
 * 说明：第一人称武器挂在 camera 下，camera 向前为 -Z。因此所有枪口 / 刀尖
 * 一律朝向 -Z，枪托 / 刀柄朝向 +Z（靠近玩家）。之前的模型整体朝向反了，
 * 导致消音器、刀身等最有辨识度的部分被裁剪在镜头后方，只剩一个"抽象"枪身。
 * 本次重建统一修正朝向，并用倒角几何 + 程序化材质替代纯方盒子。
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CFG } from './config.js'

/** M4 压枪弹道（每发 [上跳°, 水平°]）—— 前 3 发准，之后稳定爬升 + 小幅横移 */
export function m4Pattern() {
  const p = []
  for (let i = 0; i < 30; i++) {
    const climb = 0.55 + i * 0.02
    const yaw = Math.sin(i * 1.85 + 0.6) * 0.3 + (i >= 14 ? Math.sin(i * 0.85) * 0.16 : 0)
    p.push([climb, yaw])
  }
  return p
}

/* ================================================================
 * 程序化纹理：用 Canvas 生成金属拉丝 / 塑料颗粒 / 橡胶网点，并配 bump。
 * 目标是让枪械表面不再是一块平滑的纯色，而是有材质层次的实体。
 * ================================================================ */
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  return c
}

function makeTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}

function brushedMetal() {
  const c = makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#7d828a'
    g.fillRect(0, 0, w, h)
    // 竖向拉丝
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w
      const light = Math.random() > 0.5
      g.fillStyle = light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
      g.fillRect(x, 0, 1 + Math.random() * 2, h)
    }
    // 细微划痕
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
      g.lineWidth = 0.5
      const y = Math.random() * h
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(w / 3, y + (Math.random() - 0.5) * 6, (w * 2) / 3, y + (Math.random() - 0.5) * 6, w, y)
      g.stroke()
    }
  })
  return makeTex(c, 2, true)
}

function brushedMetalBump() {
  const c = makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#808080'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 320; i++) {
      const x = Math.random() * w
      const v = Math.random() > 0.5 ? 210 : 40
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x, 0, 1 + Math.random() * 2, h)
    }
  })
  return makeTex(c, 2, false)
}

function polymerTex() {
  const c = makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#24272d'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 2200; i++) {
      const v = Math.random() > 0.5 ? 255 : 0
      const a = Math.random() * 0.05
      g.fillStyle = `rgba(${v},${v},${v},${a})`
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1)
    }
  })
  return makeTex(c, 2, true)
}

function polymerBump() {
  const c = makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#808080'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 1600; i++) {
      const v = Math.random() > 0.5 ? 145 : 110
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1)
    }
  })
  return makeTex(c, 2, false)
}

function rubberTex() {
  const c = makeCanvas(96, 96, (g, w, h) => {
    g.fillStyle = '#1b1e23'
    g.fillRect(0, 0, w, h)
    const step = 8
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.beginPath()
        g.arc(x + step / 2, y + step / 2, 1.6, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,0.05)'
        g.beginPath()
        g.arc(x + step / 2 + 1, y + step / 2 - 1, 0.8, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
  return makeTex(c, 2, true)
}

function rubberBump() {
  const c = makeCanvas(96, 96, (g, w, h) => {
    g.fillStyle = '#808080'
    g.fillRect(0, 0, w, h)
    const step = 8
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        g.fillStyle = 'rgb(190,190,190)'
        g.beginPath()
        g.arc(x + step / 2, y + step / 2, 1.8, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
  return makeTex(c, 2, false)
}

const TEX = {
  metal: brushedMetal(),
  metalBump: brushedMetalBump(),
  polymer: polymerTex(),
  polymerBump: polymerBump(),
  rubber: rubberTex(),
  rubberBump: rubberBump(),
}

/* ================================================================
 * 材质工厂
 * ================================================================ */
const _matCache = new Map()
function mat(key, make) {
  if (!_matCache.has(key)) _matCache.set(key, make())
  return _matCache.get(key)
}

function std(key, opts = {}) {
  return mat(key, () => {
    const m = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      metalness: opts.metalness ?? 0.4,
      roughness: opts.roughness ?? 0.5,
      flatShading: !!opts.flatShading,
      side: opts.side ?? THREE.FrontSide,
    })
    if (opts.map) m.map = opts.map
    if (opts.bumpMap) {
      m.bumpMap = opts.bumpMap
      m.bumpScale = opts.bumpScale ?? 0.02
    }
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive)
      m.emissiveIntensity = opts.emissiveIntensity ?? 1
    }
    return m
  })
}

/* 刀身用 Physical：高金属 + 清漆，强光下有明显高光与层次 */
function bladeMat() {
  return mat('blade', () => new THREE.MeshPhysicalMaterial({
    color: 0xc3cbd4,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
  }))
}

/* ================================================================
 * 几何工具（默认轴向为 +Z 表示靠近玩家 / -Z 表示朝向枪口）
 * ================================================================ */
function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  if (rx) mesh.rotation.x = rx
  if (ry) mesh.rotation.y = ry
  if (rz) mesh.rotation.z = rz
  return mesh
}

function rbox(w, h, d, m, r, seg = 2, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), m)
  mesh.position.set(x, y, z)
  if (rx) mesh.rotation.x = rx
  if (ry) mesh.rotation.y = ry
  if (rz) mesh.rotation.z = rz
  return mesh
}

/** 沿 Z 轴的圆柱（枪管 / 消音器等） */
function tube(rt, rb, len, m, seg = 16, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), m)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(x, y, z)
  return mesh
}

/** 沿 Z 轴的胶囊（手指 / 护木等柔和部件） */
function capZ(radius, len, m, seg = 8, x = 0, y = 0, z = 0, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 3, seg), m)
  mesh.rotation.x = Math.PI / 2 + rx
  mesh.position.set(x, y, z)
  return mesh
}

/* ================================================================
 * 手部：手套 + 四指（每指三段）+ 拇指。比原版的圆柱指更自然。
 * ================================================================ */
function buildHand(right, opts = {}) {
  const glove = opts.glove || std('glove', {
    color: 0x242a32, map: TEX.polymer, bumpMap: TEX.polymerBump,
    bumpScale: 0.02, metalness: 0.12, roughness: 0.72,
  })
  const gloveDark = std('gloveDark', {
    color: 0x171b21, map: TEX.polymer, bumpMap: TEX.polymerBump,
    bumpScale: 0.03, metalness: 0.08, roughness: 0.85,
  })
  const accent = std('gloveAccent', { color: 0x39434f, metalness: 0.15, roughness: 0.65 })

  const hand = new THREE.Group()

  // 手腕 / 小臂残端（朝向 +Z，靠近玩家）
  const wrist = capZ(0.03, 0.08, gloveDark, 10, 0, 0, 0.05)
  hand.add(wrist)

  // 手掌：主块 + 掌背
  const palm = rbox(0.085, 0.062, 0.12, glove, 0.022, 2, 0, 0, 0)
  hand.add(palm)
  const back = rbox(0.078, 0.036, 0.085, gloveDark, 0.018, 2, 0, 0.022, -0.015)
  hand.add(back)
  // 拇指球
  const thenar = rbox(0.05, 0.045, 0.06, gloveDark, 0.016, 2, right ? 0.045 : -0.045, -0.015, 0.02)
  hand.add(thenar)

  // 四指：每根三段 + 指尖，向 -Z 方向弯曲包裹握把
  const fingerDefs = [
    { x: -0.029, curl: 0.5, splay: 0.12, s: 0.9 },   // 小指
    { x: -0.009, curl: 0.42, splay: 0.05, s: 1.0 },
    { x: 0.011, curl: 0.34, splay: -0.05, s: 1.0 },  // 中指
    { x: 0.029, curl: 0.24, splay: -0.12, s: 0.95 }, // 食指
  ]
  for (const f of fingerDefs) {
    const sx = right ? 1 : -1
    const g = new THREE.Group()
    const s = f.s
    const seg = (r, len, y, z) => {
      const m = capZ(r * s, len, glove, 8, 0, y, z, 0)
      g.add(m)
    }
    seg(0.012, 0.034, 0.0, -0.02)
    seg(0.011, 0.03, 0.0, -0.052)
    seg(0.0095, 0.026, 0.0, -0.081)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009 * s, 8, 6), gloveDark)
    tip.position.set(0, 0, -0.096)
    g.add(tip)
    g.position.set(f.x * sx, 0.03, 0.055)
    g.rotation.x = f.curl
    g.rotation.z = f.splay * sx
    hand.add(g)
  }

  // 拇指（两段，朝对握方向）
  const thumb = new THREE.Group()
  const t1 = capZ(0.014, 0.03, glove, 8, 0, 0, 0.02)
  const t2 = capZ(0.0125, 0.026, gloveDark, 8, 0, 0, -0.018)
  thumb.add(t1, t2)
  thumb.position.set(right ? 0.052 : -0.052, 0.005, 0.04)
  thumb.rotation.z = right ? -0.7 : 0.7
  thumb.rotation.y = right ? 0.5 : -0.5
  hand.add(thumb)

  // 腕口
  const cuff = tube(0.034, 0.036, 0.045, accent, 14, 0, 0, 0.095)
  hand.add(cuff)

  return hand
}

/* ================================================================
 * M4A1-S · 侦察力量（Recon）
 * ================================================================ */
function buildM4() {
  const metal = std('m4-metal', { color: 0x2b2f36, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.72, roughness: 0.34 })
  const metalDark = std('m4-metalDark', { color: 0x1a1d22, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.62, roughness: 0.48 })
  const polymer = std('m4-polymer', { color: 0x15171b, map: TEX.polymer, bumpMap: TEX.polymerBump, metalness: 0.18, roughness: 0.58 })
  const gripMat = std('m4-grip', { color: 0x1d2026, map: TEX.rubber, bumpMap: TEX.rubberBump, metalness: 0.08, roughness: 0.9 })
  const red = std('m4-red', { color: 0x300e13, emissive: 0xff2b3c, emissiveIntensity: 1.55, metalness: 0.3, roughness: 0.4 })
  const redDim = std('m4-redDim', { color: 0x241015, emissive: 0xc81e2c, emissiveIntensity: 0.65, metalness: 0.3, roughness: 0.5 })

  const g = new THREE.Group()

  // 一体式消音器（朝向 -Z）
  g.add(tube(0.02, 0.019, 0.34, metalDark, 18, 0, 0.028, -0.42))
  g.add(tube(0.0215, 0.02, 0.07, metal, 18, 0, 0.028, -0.6))
  for (let i = 0; i < 3; i++) g.add(tube(0.0218, 0.022, 0.012, metalDark, 18, 0, 0.028, -0.28 - i * 0.055))
  g.add(tube(0.0215, 0.0225, 0.008, red, 18, 0, 0.028, -0.42))
  g.add(tube(0.0215, 0.0225, 0.008, red, 18, 0, 0.028, -0.52))

  // 护木（M-LOK 风格开槽）
  g.add(rbox(0.052, 0.066, 0.24, polymer, 0.012, 2, 0, 0.014, -0.16))
  for (let i = 0; i < 5; i++) g.add(box(0.054, 0.009, 0.012, metalDark, 0, -0.024, -0.04 - i * 0.038))
  g.add(box(0.02, 0.012, 0.2, metalDark, 0, -0.035, -0.16))
  g.add(box(0.02, 0.007, 0.19, redDim, 0, -0.041, -0.16))
  g.add(box(0.006, 0.05, 0.2, redDim, 0.028, 0.014, -0.16))
  g.add(box(0.006, 0.05, 0.2, redDim, -0.028, 0.014, -0.16))

  // 机匣（上 + 下）
  g.add(rbox(0.06, 0.07, 0.34, metal, 0.014, 2, 0, 0.032, 0.02))
  g.add(rbox(0.055, 0.052, 0.3, metalDark, 0.012, 2, 0, -0.02, 0.035))
  g.add(box(0.006, 0.024, 0.34, red, 0.031, 0.012, 0.02))
  g.add(box(0.006, 0.024, 0.34, red, -0.031, 0.012, 0.02))
  // 顶部皮轨
  g.add(box(0.022, 0.012, 0.34, metalDark, 0, 0.074, 0.0))
  for (let i = 0; i < 10; i++) g.add(box(0.024, 0.005, 0.012, metal, 0, 0.068, -0.15 + i * 0.03))

  // 弹匣（弧形：两段成角度）
  g.add(rbox(0.046, 0.105, 0.075, metalDark, 0.012, 2, 0, -0.075, 0.05, 0.35))
  g.add(rbox(0.046, 0.085, 0.075, metal, 0.012, 2, 0, -0.15, 0.03, -0.12))
  g.add(box(0.048, 0.16, 0.008, redDim, 0, -0.11, 0.065, 0.35))

  // 握把 + 防滑纹
  g.add(rbox(0.045, 0.13, 0.052, gripMat, 0.012, 2, 0, -0.12, 0.14, 0.55))
  for (let i = 0; i < 4; i++) g.add(box(0.047, 0.006, 0.054, polymer, 0, -0.075 - i * 0.026, 0.145, 0.55))

  // 枪托（缓冲管 + 托体）
  g.add(tube(0.012, 0.012, 0.16, metalDark, 12, 0, 0.028, 0.32))
  g.add(rbox(0.05, 0.1, 0.1, polymer, 0.014, 2, 0, 0.028, 0.4))
  g.add(rbox(0.042, 0.085, 0.07, gripMat, 0.012, 2, 0, 0.028, 0.48))
  g.add(box(0.012, 0.05, 0.008, red, 0, 0.036, 0.5))

  // 抛壳窗 + 拉机柄 + 快慢机
  g.add(box(0.008, 0.04, 0.08, metal, 0.032, 0.04, 0.02))
  g.add(box(0.01, 0.016, 0.03, metalDark, 0.032, 0.055, -0.02))
  g.add(box(0.012, 0.014, 0.02, red, -0.03, -0.035, 0.06, 0, 0.5))

  // 红点瞄具（顶部导轨上，ADS 时保留）
  const dot = new THREE.Group()
  dot.add(box(0.03, 0.02, 0.05, polymer, 0, 0.02, -0.05))
  dot.add(box(0.02, 0.02, 0.012, metalDark, 0, 0.022, -0.075))
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16), red)
  lens.rotation.x = Math.PI / 2
  lens.position.set(0, 0.02, -0.079)
  dot.add(lens)
  dot.position.set(0, 0.078, 0.08)
  g.add(dot)

  // 前机械准星（折叠式小突起）
  g.add(box(0.008, 0.03, 0.008, metalDark, 0.014, 0.066, -0.26))
  g.add(box(0.014, 0.006, 0.006, red, 0.014, 0.082, -0.26))

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.028, -0.63)
  g.add(muzzle)
  return { group: g, muzzle }
}

/* ================================================================
 * 沙漠之鹰 · 奇点（Singularity）
 * ================================================================ */
function buildDeagle() {
  const blue = std('dg-blue', { color: 0x1c2440, map: TEX.polymer, bumpMap: TEX.polymerBump, metalness: 0.6, roughness: 0.3 })
  const purple = std('dg-purple', { color: 0x2c2050, map: TEX.polymer, bumpMap: TEX.polymerBump, metalness: 0.55, roughness: 0.34 })
  const dark = std('dg-dark', { color: 0x12142a, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.55, roughness: 0.45 })
  const glow = std('dg-glow', { color: 0x1a3a66, emissive: 0x4a8aff, emissiveIntensity: 1.7, metalness: 0.4, roughness: 0.3 })
  const glowDim = std('dg-glowDim', { color: 0x16284a, emissive: 0x3a6ad0, emissiveIntensity: 0.8, metalness: 0.35, roughness: 0.4 })

  const g = new THREE.Group()

  // 枪管（朝向 -Z）
  g.add(tube(0.014, 0.0135, 0.18, dark, 16, 0, -0.02, -0.18))
  g.add(tube(0.018, 0.015, 0.045, blue, 16, 0, -0.02, -0.28))
  g.add(tube(0.019, 0.018, 0.01, glow, 16, 0, -0.02, -0.295))

  // 套筒（上滑套，带锯齿）
  g.add(rbox(0.066, 0.078, 0.3, blue, 0.012, 2, 0, 0.035, -0.02))
  g.add(rbox(0.068, 0.08, 0.1, purple, 0.012, 2, 0, 0.035, 0.1))
  for (let i = 0; i < 4; i++) g.add(box(0.07, 0.006, 0.012, dark, 0, 0.077, 0.08 + i * 0.018))
  g.add(box(0.008, 0.028, 0.24, glow, 0.034, 0.035, -0.03))
  g.add(box(0.008, 0.028, 0.24, glow, -0.034, 0.035, -0.03))

  // 套筒座 + 扳机护圈
  g.add(rbox(0.06, 0.045, 0.17, purple, 0.01, 2, 0, -0.045, 0.03))
  g.add(box(0.005, 0.05, 0.04, dark, 0, -0.062, 0.03, 0.25))

  // 鹅颈握把（蓝紫 + 发光核心）
  g.add(rbox(0.055, 0.19, 0.068, purple, 0.014, 2, 0, -0.13, 0.13, -0.5))
  g.add(box(0.026, 0.13, 0.007, glow, 0.016, -0.12, 0.115, -0.5))
  g.add(box(0.026, 0.13, 0.007, glow, -0.016, -0.12, 0.115, -0.5))
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), glow)
  core.position.set(0.012, -0.15, 0.11)
  core.rotation.x = -0.5
  g.add(core)

  // 弹匣
  g.add(rbox(0.046, 0.09, 0.055, dark, 0.01, 2, 0, -0.07, 0.12, 0.25))
  g.add(box(0.048, 0.07, 0.006, glowDim, 0, -0.07, 0.1, 0.25))

  // 击锤 + 保险 + 抛壳口
  g.add(box(0.024, 0.042, 0.022, dark, 0, 0.09, 0.16))
  g.add(box(0.008, 0.02, 0.022, glow, 0, 0.05, 0.15))
  g.add(box(0.008, 0.04, 0.09, glowDim, 0.032, 0.05, 0.0))

  // 发光瞄具
  g.add(box(0.03, 0.018, 0.012, glow, 0, 0.082, 0.12))
  g.add(box(0.008, 0.035, 0.008, glow, 0, 0.098, -0.18))
  g.add(box(0.014, 0.008, 0.006, glow, 0.006, 0.112, -0.18))

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, -0.02, -0.3)
  g.add(muzzle)
  return { group: g, muzzle }
}

/* ================================================================
 * Karambit 剥皮小刀：鹰嘴弯刃 + 指环 + 分段握柄
 * ================================================================ */
function buildKnife() {
  const steel = bladeMat()
  const spine = std('knife-spine', { color: 0x7c8792, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.85, roughness: 0.22 })
  const gripMat = std('knife-grip', { color: 0x2a2320, map: TEX.rubber, bumpMap: TEX.rubberBump, metalness: 0.1, roughness: 0.85 })
  const ringMat = std('knife-ring', { color: 0x8f9aa6, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.9, roughness: 0.2 })
  const gold = std('knife-gold', { color: 0xc9a227, metalness: 0.9, roughness: 0.24 })

  const g = new THREE.Group()

  // 鹰嘴弯刃：轮廓在 XY 平面，X 为长度方向，挤出厚度后旋转到 YZ 平面
  const shape = new THREE.Shape()
  shape.moveTo(0.0, 0.0)
  shape.lineTo(0.0, 0.012)
  shape.quadraticCurveTo(0.1, 0.05, 0.21, 0.02)
  shape.quadraticCurveTo(0.28, 0.0, 0.31, -0.06)
  shape.lineTo(0.295, -0.078)
  shape.quadraticCurveTo(0.25, -0.05, 0.16, -0.032)
  shape.quadraticCurveTo(0.06, -0.012, 0.0, 0.0)
  const bladeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  })
  bladeGeo.rotateY(Math.PI / 2)
  const blade = new THREE.Mesh(bladeGeo, steel)
  blade.position.set(0, 0.012, -0.05)
  g.add(blade)

  // 刀背高光（沿刀刃背部的一根细亮条）
  const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.24, 3, 8), spine)
  back.rotation.z = Math.PI / 2
  back.rotation.y = 0.08
  back.position.set(0, 0.03, -0.1)
  g.add(back)

  // 指环（Karambit 标志性的尾环）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 10, 24), ringMat)
  ring.position.set(0, 0.014, 0.13)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  const ringCap = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), gold)
  ringCap.position.set(0, 0.014, 0.09)
  g.add(ringCap)

  // 分段握柄（中段贴合手掌的起伏）
  g.add(capZ(0.017, 0.075, gripMat, 12, 0, 0.014, 0.02, 0.35))
  for (let i = 0; i < 3; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0045, 6, 16), ringMat)
    wrap.position.set(0, 0.014, -0.005 + i * 0.026)
    wrap.rotation.x = Math.PI / 2
    g.add(wrap)
  }

  g.scale.setScalar(1.15)

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.01, -0.34)
  g.add(muzzle)
  return { group: g, muzzle }
}

/* ================================================================
 * Ion 离子大狙（白色主体 + 青色能量线 + 大型瞄准镜）
 * ================================================================ */
function buildOp() {
  const white = std('op-white', { color: 0xe8ecf2, map: TEX.polymer, bumpMap: TEX.polymerBump, metalness: 0.35, roughness: 0.3 })
  const polymer = std('op-polymer', { color: 0x14161a, map: TEX.polymer, bumpMap: TEX.polymerBump, metalness: 0.22, roughness: 0.6 })
  const barrel = std('op-barrel', { color: 0x4a4f58, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.9, roughness: 0.22 })
  const barrelDark = std('op-barrelDark', { color: 0x33373e, map: TEX.metal, bumpMap: TEX.metalBump, metalness: 0.85, roughness: 0.3 })
  const cyan = std('op-cyan', { color: 0x1f3a4d, emissive: 0x35e0ff, emissiveIntensity: 1.4, metalness: 0.4, roughness: 0.3 })
  const cyanDim = std('op-cyanDim', { color: 0x24404f, emissive: 0x1fb8d8, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 })
  const lens = std('op-lens', { color: 0x0a1018, emissive: 0x12304a, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.1 })

  const g = new THREE.Group()

  // 长枪管 + 枪口
  g.add(tube(0.018, 0.017, 0.42, barrelDark, 18, 0, 0.03, -0.48))
  g.add(tube(0.021, 0.019, 0.09, barrel, 18, 0, 0.03, -0.68))
  g.add(tube(0.023, 0.022, 0.014, cyan, 18, 0, 0.03, -0.56))
  g.add(tube(0.023, 0.022, 0.014, cyan, 18, 0, 0.03, -0.64))

  // 护木（白色 + 青色能量条）
  g.add(rbox(0.055, 0.075, 0.2, white, 0.014, 2, 0, 0.025, -0.28))
  g.add(box(0.008, 0.02, 0.18, cyan, -0.032, 0.025, -0.28))
  g.add(box(0.008, 0.02, 0.18, cyan, 0.032, 0.025, -0.28))

  // 机匣（白色大块 + 导轨 + 能量线）
  g.add(rbox(0.062, 0.12, 0.46, white, 0.016, 2, 0, 0.035, 0.04))
  g.add(box(0.02, 0.016, 0.4, polymer, 0, 0.102, 0.06))
  g.add(box(0.064, 0.008, 0.3, cyan, 0, -0.02, 0.08))
  g.add(box(0.008, 0.04, 0.09, cyan, 0.032, 0.06, 0.1))

  // 大型瞄准镜（Ion 特色：白色镜筒 + 青色环）
  g.add(tube(0.026, 0.024, 0.24, white, 18, 0, 0.145, 0.04))
  g.add(tube(0.024, 0.024, 0.03, polymer, 16, 0, 0.145, 0.16))
  g.add(tube(0.018, 0.018, 0.012, lens, 16, 0, 0.145, 0.175))
  g.add(tube(0.028, 0.028, 0.03, polymer, 16, 0, 0.145, -0.1))
  const objLens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 16), lens)
  objLens.rotation.y = -Math.PI / 2
  objLens.position.set(0, 0.145, -0.115)
  g.add(objLens)
  g.add(tube(0.029, 0.028, 0.012, cyan, 16, 0, 0.145, 0.03))
  g.add(tube(0.029, 0.028, 0.012, cyan, 16, 0, 0.145, -0.04))
  g.add(box(0.016, 0.03, 0.1, polymer, 0, 0.158, 0.04))

  // 弹匣 + 青色条
  g.add(rbox(0.046, 0.14, 0.075, white, 0.012, 2, 0, -0.075, 0.05, 0.25))
  g.add(box(0.048, 0.1, 0.008, cyan, 0, -0.075, 0.07, 0.25))

  // 握把 + 扳机护圈
  g.add(rbox(0.045, 0.14, 0.05, white, 0.012, 2, 0, -0.11, 0.18, 0.5))
  g.add(rbox(0.047, 0.11, 0.052, polymer, 0.012, 2, 0, -0.105, 0.18, 0.5))
  g.add(box(0.005, 0.05, 0.04, polymer, 0, -0.065, 0.1, 0.3))

  // 枪托（白色 + 青色托腮板）
  g.add(tube(0.014, 0.014, 0.14, polymer, 12, 0, 0.035, 0.34))
  g.add(rbox(0.05, 0.115, 0.11, white, 0.014, 2, 0, 0.035, 0.42))
  g.add(rbox(0.04, 0.09, 0.06, polymer, 0.012, 2, 0, 0.035, 0.5))
  g.add(box(0.028, 0.04, 0.05, cyan, 0, 0.095, 0.45))

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.03, -0.72)
  g.add(muzzle)
  return { group: g, muzzle }
}

/* ================================================================
 * 组装：武器 + 双手持握（朝向已修正，枪口 -Z）
 * ================================================================ */
const POSE = {
  hip: { pos: [0.16, -0.165, -0.42], rot: [0, 0.03, 0] },
  ads: { pos: [0, -0.165, -0.34], rot: [0, 0, 0] },
}
const KNIFE_POSE = {
  hip: { pos: [0.15, -0.12, -0.38], rot: [-0.85, 0.12, 0.04] },
  ads: { pos: [0.15, -0.12, -0.38], rot: [-0.85, 0.12, 0.04] },
}
const OP_POSE = {
  hip: { pos: [0.15, -0.17, -0.5], rot: [0, 0.04, 0] },
  ads: { pos: [0, -0.15, -0.44], rot: [0, 0, 0] },
}

export function buildViewmodel(id) {
  const { group, muzzle } =
    id === 'm4' ? buildM4() :
    id === 'deagle' ? buildDeagle() :
    id === 'knife' ? buildKnife() : buildOp()
  const pose = id === 'knife' ? KNIFE_POSE : id === 'op' ? OP_POSE : POSE

  // 右手：握把 / 握柄
  const rightHand = buildHand(true)
  if (id === 'knife') {
    rightHand.position.set(0.045, -0.1, 0.02)
    rightHand.rotation.y = 0.5
    rightHand.rotation.z = 0.28
  } else if (id === 'op') {
    rightHand.position.set(0.05, -0.115, 0.16)
    rightHand.rotation.y = 0.25
  } else if (id === 'm4') {
    rightHand.position.set(0.045, -0.11, 0.15)
    rightHand.rotation.y = 0.12
  } else {
    rightHand.position.set(0.048, -0.13, 0.12)
    rightHand.rotation.y = 0.18
  }
  group.add(rightHand)

  // 左手：护木 / 枪管 / 镜桥
  if (id !== 'knife') {
    const leftHand = buildHand(false)
    if (id === 'op') {
      leftHand.position.set(-0.042, -0.01, -0.26)
      leftHand.rotation.y = -0.12
    } else if (id === 'm4') {
      leftHand.position.set(-0.042, -0.012, -0.16)
      leftHand.rotation.y = -0.1
    } else {
      leftHand.position.set(-0.036, -0.035, -0.12)
      leftHand.rotation.y = -0.15
      leftHand.rotation.z = 0.15
    }
    group.add(leftHand)
  } else {
    // 持刀：左手轻扶刀柄尾段
    const leftHand = buildHand(false)
    leftHand.position.set(-0.05, -0.06, 0.02)
    leftHand.rotation.y = -0.3
    leftHand.rotation.z = -0.18
    group.add(leftHand)
  }

  const view = new THREE.Group()
  view.add(group)
  view.position.set(...pose.hip.pos)
  view.rotation.set(...pose.hip.rot)

  return { view, muzzle, pose, id, hide: group.userData.adsHide || null }
}

export const WEAPON = CFG.weapons
export const M4_PATTERN = m4Pattern()
