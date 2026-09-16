/* ================= 训练靶场：静态靶 + 命中反馈 ================= */
import * as THREE from 'three'
import { scene } from './render.js'
import { world } from './world/map.js'
import * as audio from './audio.js'

// 候选靶位 [x, z, kind]  kind: body | head | far
const CANDIDATES = [
  [-7, -6.5, 'body'], [7, -6.5, 'body'], [0, -6.5, 'head'],
  [-9, -11, 'body'], [9, -11, 'body'], [0, -12.5, 'head'],
  [-13, -9, 'body'], [13, -9, 'body'], [-16, -4, 'far'], [16, -4, 'far'],
  [-20, 2, 'far'], [20, 2, 'far'], [-12, 6, 'body'], [12, 6, 'body'],
  [-4, 10, 'body'], [4, 10, 'body'], [0, 12, 'head'],
  [-14, 14, 'far'], [14, 14, 'far'], [-22, 14, 'far'], [22, 14, 'far'],
  [-8, 17, 'far'], [8, 17, 'far'],
]

let targets = []
let spawnPoint = { x: 0, z: -19 }

function makeTarget(x, z, kind, sx, sz) {
  const cfg = kind === 'head'
    ? { r: 0.16, y: 1.6, color: 0xffd75e, ring: 0x9a6a00 }
    : { r: kind === 'far' ? 0.5 : 0.42, y: 1.2, color: 0xfff2dd, ring: 0xd84a2f }

  const group = new THREE.Group()
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.6, metalness: 0.6 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, cfg.y + 0.15, 8), poleMat)
  pole.position.y = (cfg.y + 0.15) / 2 - 0.05
  group.add(pole)

  const boardMat = new THREE.MeshStandardMaterial({
    color: cfg.color, roughness: 0.5, emissive: cfg.color, emissiveIntensity: 0.25, side: THREE.DoubleSide,
  })
  const disc = new THREE.Mesh(new THREE.CircleGeometry(cfg.r, 24), boardMat)
  disc.position.y = cfg.y
  const ringMat = new THREE.MeshStandardMaterial({
    color: cfg.ring, roughness: 0.6, emissive: cfg.ring, emissiveIntensity: 0.5, side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(cfg.r * 0.72, cfg.r, 24), ringMat)
  ring.position.y = cfg.y
  const look = new THREE.Vector3(sx, cfg.y, sz)
  disc.lookAt(look)
  ring.lookAt(look)
  group.add(disc, ring)
  group.position.set(x, 0, z)
  scene.add(group)

  return {
    isTarget: true,
    isPlayer: false,
    name: 'TARGET',
    alive: true,
    pos: new THREE.Vector3(x, 0, z),
    kind,
    flash: 0,
    group,
    boardMat,
    hit(dmg, head, attacker, weaponId) {
      this.flash = 1
      audio.targetDing(head)
      return false // 靶子不会死
    },
  }
}

export function buildTraining() {
  // 清理旧靶（防重复进入）
  for (const t of targets) {
    scene.remove(t.group)
    t.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
  }
  targets = []

  const g0 = world.groundYUnder(0, -11, 100, -1)
  spawnPoint = g0 === null ? { x: 0, z: -19 } : { x: 0, z: -11 }

  for (const [x, z, kind] of CANDIDATES) {
    const g = world.groundYUnder(x, z, 100, -1)
    if (g === null || Math.abs(g) > 0.02) continue          // 只放平整地面
    if (world.rayCast(x, 0.6, z, 1, 0, 0, 0.01).b) continue // 不在墙内
    if (world.rayCast(x, 0.6, z, 0, 0, 1, 0.01).b) continue
    if (!world.lineClear(spawnPoint.x, spawnPoint.z, x, z)) continue // 出生点可见
    targets.push(makeTarget(x, z, kind, spawnPoint.x, spawnPoint.z))
  }

  return {
    targets,
    spawn: spawnPoint,
    update(dt) {
      for (const t of targets) {
        if (t.flash > 0) {
          t.flash = Math.max(0, t.flash - dt * 2.5)
          t.boardMat.emissiveIntensity = 0.25 + t.flash * 2.5
        }
      }
    },
    dispose() {
      for (const t of targets) {
        scene.remove(t.group)
        t.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
      }
      targets = []
    },
  }
}
