/* ================= 特效系统（对象池） ================= */
import * as THREE from 'three'
import { scene } from './render.js'
import { softDot, radialGlow } from './world/textures.js'
import { impactSound, shellTick } from './audio.js'

const dotTex = softDot('255,255,255', 1)
const flashTex = radialGlow()

function makeSprite(color) {
  const mat = new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, depthWrite: false })
  const s = new THREE.Sprite(mat)
  s.visible = false
  scene.add(s)
  return s
}

/* ---- 曳光弹（细长发光条） ---- */
const tracers = []
for (let i = 0; i < 28; i++) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.016, 1),
    new THREE.MeshBasicMaterial({ color: 0x9fd4ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  )
  m.visible = false
  scene.add(m)
  tracers.push({ mesh: m, life: 0, max: 0.06 })
}

export function tracer(a, b, color) {
  const t = tracers.find((t) => !t.mesh.visible)
  if (!t) return
  const { mesh } = t
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = dir.length() || 1
  mesh.visible = true
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  mesh.scale.set(1, 1, len)
  mesh.lookAt(b[0], b[1], b[2])
  mesh.material.color.setHex(color)
  mesh.material.opacity = 0.9
  t.life = 0
  t.max = 0.05 + Math.min(len, 30) * 0.0012
}

/* ---- 火花 / 血迹 / 灰尘（精灵池） ---- */
const sprites = []
const SPRITE_COUNT = 150
for (let i = 0; i < SPRITE_COUNT; i++) {
  sprites.push({
    s: makeSprite(0xffffff),
    vel: new THREE.Vector3(),
    life: 0, max: 0.3,
    grav: 9, drag: 1,
  })
}
let sprIdx = 0
function spawnSprite(color, pos, vel, opts = {}) {
  const p = sprites[sprIdx]
  sprIdx = (sprIdx + 1) % SPRITE_COUNT
  p.s.visible = true
  p.s.material.color.setHex(color)
  p.s.material.opacity = 1
  p.s.position.copy(pos)
  const scale = opts.scale || 0.05
  p.s.scale.setScalar(scale * (opts.randScale ? 0.6 + Math.random() * 0.8 : 1))
  p.vel.copy(vel)
  p.life = 0
  p.max = opts.life || 0.3
  p.grav = opts.grav ?? 9
  p.drag = opts.drag ?? 1
  p.blend = opts.additive
  p.s.material.blending = opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending
  return p
}

function impactFx(pos, normal, color, count, opts) {
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(
      normal[0] + (Math.random() - 0.5) * 2,
      normal[1] + (Math.random() - 0.5) * 2,
      normal[2] + (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(2.2 + Math.random() * 3)
    v.y += 1.5
    spawnSprite(color, new THREE.Vector3(pos[0], pos[1], pos[2]), v, { additive: opts.additive, scale: opts.scale, life: opts.life, grav: opts.grav, drag: 2 })
  }
}

/** 子弹命中墙体/箱子 */
export function impact(pos, normal, mat) {
  impactSound(mat)
  const n = normal
  if (mat === 'metal') {
    impactFx(pos, n, 0xffd27a, 7, { additive: true, scale: 0.03, life: 0.22, grav: 4 })
  } else if (mat === 'wood') {
    impactFx(pos, n, 0xc9a06a, 6, { scale: 0.045, life: 0.3, grav: 10 })
  } else if (mat === 'plant') {
    impactFx(pos, n, 0x7fb06a, 6, { scale: 0.05, life: 0.3, grav: 7 })
  } else {
    impactFx(pos, n, 0xd8d2c4, 7, { scale: 0.035, life: 0.25, grav: 6 })
    impactFx(pos, n, 0xffe9b0, 3, { additive: true, scale: 0.025, life: 0.18, grav: 3 })
  }
}

/** 命中身体 */
export function blood(pos, normal, big = false) {
  const n = normal
  impactFx(pos, n, 0xc22b33, big ? 14 : 8, { scale: big ? 0.07 : 0.05, life: 0.38, grav: 12 })
  impactFx(pos, n, 0x8f1d24, 3, { scale: 0.04, life: 0.5, grav: 9 })
}

/** 枪口焰 */
const flashes = []
for (let i = 0; i < 6; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  s.visible = false
  scene.add(s)
  flashes.push({ s, life: 0 })
}
export function muzzleFlash(pos, scale = 0.22) {
  const f = flashes.find((f) => !f.s.visible) || flashes[0]
  f.s.visible = true
  f.s.position.copy(pos)
  f.s.scale.setScalar(scale * (0.8 + Math.random() * 0.5))
  f.s.material.opacity = 1
  f.s.material.rotation = Math.random() * Math.PI
  f.life = 0
}

/* ---- 弹壳 ---- */
const shells = []
const shellGeo = new THREE.BoxGeometry(0.018, 0.018, 0.045)
for (let i = 0; i < 26; i++) {
  const m = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.3 }))
  m.visible = false
  scene.add(m)
  shells.push({ m, vel: new THREE.Vector3(), rot: new THREE.Vector3(), life: 0 })
}
export function shellEject(pos, right, up) {
  const s = shells.find((s) => !s.m.visible)
  if (!s) return
  s.m.visible = true
  s.m.position.copy(pos)
  s.vel.set(
    right.x * (1.4 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.8,
    up.y * 0.6 + 1.6 + Math.random() * 1.4,
    right.z * (1.4 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.8,
  )
  s.rot.set(Math.random() * 12, Math.random() * 12, Math.random() * 12)
  s.life = 0
  s.tick = false
}

/* ---- 弹孔贴花 ---- */
const decals = []
const decalGeo = new THREE.CircleGeometry(0.14, 10)
for (let i = 0; i < 42; i++) {
  const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x191410, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))
  m.visible = false
  scene.add(m)
  decals.push({ m, life: 0, max: 9 })
}
export function decal(pos, normal) {
  const d = decals.find((d) => !d.m.visible)
  if (!d) return
  d.m.visible = true
  d.m.position.set(pos[0] + normal[0] * 0.02, pos[1] + normal[1] * 0.02, pos[2] + normal[2] * 0.02)
  d.m.lookAt(pos[0] + normal[0], pos[1] + normal[1], pos[2] + normal[2])
  d.m.rotateZ(Math.random() * Math.PI)
  d.m.material.opacity = 0.85
  d.m.scale.setScalar(0.7 + Math.random() * 0.8)
  d.life = 0
}

/* ---- 落地扬尘 ---- */
export function landDust(pos) {
  for (let i = 0; i < 8; i++) {
    spawnSprite(0xcfc4ae, new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.5, 0.05, pos.z + (Math.random() - 0.5) * 0.5),
      new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6),
      { scale: 0.09, life: 0.5, grav: -0.5, drag: 2.5 })
  }
}

/** 近战挥砍刀光（弧形残影） */
const slashPool = []
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xd8e8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  )
  m.visible = false
  scene.add(m)
  slashPool.push({ m, life: 0 })
}
export function slashFx(origin, dir, dist) {
  const s = slashPool.find((s) => !s.m.visible)
  if (!s) return
  s.m.visible = true
  const mid = [origin[0] + dir[0] * dist * 0.6, origin[1] + dir[1] * dist * 0.6 + 0.1, origin[2] + dir[2] * dist * 0.6]
  s.m.position.set(mid[0], mid[1], mid[2])
  s.m.lookAt(origin[0], origin[1], origin[2])
  s.m.rotation.z = (Math.random() - 0.5) * 1.5
  s.m.scale.set(1.15 + Math.random() * 0.45, 1.7 + Math.random() * 0.7, 1)
  s.m.material.opacity = 0.95
  s.life = 0
}

/** 喷泉持续水花（每帧少量粒子） */
let fountainT = 0
export function updateFountain(dt, time) {
  fountainT -= dt
  if (fountainT > 0) return
  fountainT = 0.09
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * 0.5
    spawnSprite(0xa8d8ff,
      new THREE.Vector3(Math.cos(a) * r, 0.55, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * 1.2, 2.2 + Math.random() * 1.6, Math.sin(a) * 1.2),
      { scale: 0.04, life: 0.7, grav: 11, drag: 1.2 })
  }
}

let shellTickTimer = 0
export function updateEffects(dt) {
  for (const s of slashPool) {
    if (!s.m.visible) continue
    s.life += dt
    if (s.life > 0.16) { s.m.visible = false; continue }
    s.m.material.opacity = 0.95 * (1 - s.life / 0.16)
  }

  shellTickTimer -= dt

  for (const t of tracers) {
    if (!t.mesh.visible) continue
    t.life += dt
    if (t.life > t.max) { t.mesh.visible = false; continue }
    t.mesh.material.opacity = 0.9 * (1 - t.life / t.max)
  }

  for (const p of sprites) {
    if (!p.s.visible) continue
    p.life += dt
    if (p.life > p.max) { p.s.visible = false; continue }
    p.vel.y -= p.grav * dt
    p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
    p.s.position.addScaledVector(p.vel, dt)
    p.s.material.opacity = 1 - p.life / p.max
  }

  for (const f of flashes) {
    if (!f.s.visible) continue
    f.life += dt
    if (f.life > 0.045) { f.s.visible = false; continue }
    f.s.material.opacity = 1 - f.life / 0.045
  }

  for (const s of shells) {
    if (!s.m.visible) continue
    s.life += dt
    if (s.life > 2.4) { s.m.visible = false; continue }
    s.vel.y -= 17.5 * dt
    s.m.position.addScaledVector(s.vel, dt)
    s.m.rotation.x += s.rot.x * dt
    s.m.rotation.y += s.rot.y * dt
    if (s.m.position.y < 0.02 && s.vel.y < 0) {
      s.m.position.y = 0.02
      s.vel.y *= -0.32
      s.vel.x *= 0.55
      s.vel.z *= 0.55
      s.rot.multiplyScalar(0.4)
      if (!s.tick && shellTickTimer <= 0) { shellTick(); s.tick = true; shellTickTimer = 0.07 }
    }
    if (s.life > 2.0) s.m.material.transparent = true
  }

  for (const d of decals) {
    if (!d.m.visible) continue
    d.life += dt
    if (d.life > d.max) { d.m.visible = false; continue }
    if (d.life > d.max - 2) d.m.material.opacity = 0.85 * (1 - (d.life - (d.max - 2)) / 2)
  }
}
