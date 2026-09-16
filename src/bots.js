/* ================= AI 机器人（FFA 死斗） ================= */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { scene, camera } from './render.js'
import { CFG } from './config.js'
import { WEAPON } from './weapons.js'
import { world } from './world/map.js'
import { ev } from './events.js'
import { cameraWorldRight } from './player.js'
import * as audio from './audio.js'
import { tracer, impact, blood, muzzleFlash } from './effects.js'
import { clamp, coneDir, rayCapsule, rand, pick, resolveCircle, circleHits } from './utils.js'

/* 敌军制服配色：[制服, 战术马甲, 腿, 头盔] */
const OUTFITS = [
  ['#8a2f38', '#232830', '#3a3132', '#2f343c'], ['#7a3a2a', '#252a33', '#3a352f', '#2f343c'],
  ['#8a4a26', '#242932', '#3d362e', '#2f343c'], ['#6e2a35', '#20252d', '#352e30', '#2f343c'],
  ['#7c3d2e', '#242a33', '#39322f', '#2f343c'], ['#923526', '#262b34', '#3c3430', '#2f343c'],
  ['#83333a', '#22272f', '#383133', '#2f343c'], ['#75422a', '#252a33', '#3a3430', '#2f343c'],
]
const ACCENTS = [0x7fe3ff, 0xffb14d, 0x9dff8f, 0xff7d9d, 0xffe66e, 0xb79dff]

const BOT_H = 1.8          // 机器人身高（碰撞）
const HEAD_Y = 1.55        // 瞄准高度（头）
const CHEST_Y = 1.15

function colored(geo, color) {
  const n = geo.attributes.position.count
  const col = new Float32Array(n * 3)
  const c = new THREE.Color(color)
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

/* ---------------- 单个机器人 ---------------- */
export class Bot {
  constructor(scene, x, z, name, diff) {
    this.name = name
    this.diff = diff
    this.skill = diff === 'hard' ? rand(0.88, 0.95) : diff === 'normal' ? rand(0.62, 0.75) : rand(0.38, 0.5)
    this.hsBias = CFG.bots.headshotBias[diff]
    this.maxArmor = CFG.bots.armor[diff]
    this.weaponId = Math.random() < CFG.bots.m4Chance ? 'm4' : 'deagle'
    this.isPlayer = false

    this.pos = new THREE.Vector3(x, 0, z)
    this.yaw = Math.random() * Math.PI * 2
    this.aimYaw = this.yaw
    this.aimPitch = 0
    this.pitchBias = 0
    this.hp = 100
    this.armor = this.maxArmor
    this.alive = true
    this.mag = WEAPON[this.weaponId].mag
    this.reloading = false
    this.reloadT = 0

    this.state = 'roam'          // roam | hunt | fight | flee
    this.path = []
    this.pathIdx = 0
    this.target = null
    this.lastKnown = null
    this.lastKnownT = 0
    this.thinkT = 0
    this.reactT = 0
    this.burstLeft = 0
    this.fireCd = 0
    this.burstPause = 0
    this.strafeDir = Math.random() < 0.5 ? 1 : -1
    this.strafeT = 0
    this.crouching = false
    this.crouchT = 0
    this.fleeT = 0
    this.idleT = rand(0.5, 1.5)
    this.stuckT = 0
    this.lastX = x
    this.lastZ = z
    this.walkPhase = rand(0, 6)
    this.deathT = 0
    this.fallDir = Math.random() < 0.5 ? 1 : -1
    this.flash = 0
    this.isMoving = false

    this.kills = 0
    this.deaths = 0
    this.streak = 0
    this.bestStreak = 0
    this.stats = { shots: 0, hits: 0, hsKills: 0 }
    this.respawnT = 0
    this.spawnProtect = 0
    // 真人感参数：个人瞄准习惯（0=身体型 ~1=爆头线型）+ 准星漂移（随机游走）+ 脚步计时
    this.aimStyle = rand(0.15, 0.85)
    this.aimDrift = 0
    this.aimDriftV = 0
    this.footT = rand(0, 0.5)
    this.coverPos = null            // 换弹掩体目标（Valorant 向：换弹不站桩）

    this.buildVisual(scene)
  }

  get weapon() { return WEAPON[this.weaponId] }

  /* 人形建模：所有部件以脚底(y=0)为原点构建 */
  buildVisual(scene) {
    const [uniform, vestC, legC, helmetC] = pick(OUTFITS)
    const g = new THREE.Group()

    // 腿（独立 mesh，可摆动）+ 靴子
    this.legs = []
    for (const side of [-1, 1]) {
      const legGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.8, 8)
      legGeo.translate(0, -0.4, 0)
      const leg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: legC, roughness: 0.75 }))
      leg.position.set(0.12 * side, 0.8, 0)
      g.add(leg)
      this.legs.push(leg)
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.24), new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.9 }))
      boot.position.set(0.12 * side, 0.045, 0.04)
      g.add(boot)
    }

    // 合并身体（躯干+胸甲+肩+臂+头+枪）
    const torso = new THREE.CapsuleGeometry(0.24, 0.42, 4, 10)
    torso.translate(0, 1.12, 0)
    const chest = new THREE.BoxGeometry(0.52, 0.34, 0.24)
    chest.translate(0, 1.2, 0)
    const belt = new THREE.BoxGeometry(0.44, 0.09, 0.22)
    belt.translate(0, 0.86, 0)
    const shoulderGeo = new THREE.SphereGeometry(0.12, 8, 6)
    const shoulderL = shoulderGeo.clone(); shoulderL.translate(-0.31, 1.33, 0)
    const shoulderR = shoulderGeo.clone(); shoulderR.translate(0.31, 1.33, 0)
    const armGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.55, 7)
    armGeo.rotateX(1.35)
    const armL = armGeo.clone(); armL.translate(-0.3, 1.16, 0.24)
    const armR = armGeo.clone(); armR.translate(0.3, 1.16, 0.24)
    const head = new THREE.SphereGeometry(0.19, 12, 10)
    head.translate(0, 1.62, 0)
    const helmet = new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)
    helmet.translate(0, 1.64, -0.01)
    const gun = new THREE.BoxGeometry(0.05, 0.085, 0.48)
    gun.translate(0.07, 1.06, 0.4)
    const gunMag = new THREE.BoxGeometry(0.035, 0.11, 0.06)
    gunMag.translate(0.07, 0.93, 0.34)
    gunMag.rotateX(0.3)

    const geos = [torso, chest, belt, shoulderL, shoulderR, armL, armR, head, helmet, gun, gunMag].map((geo) => {
      let c = uniform
      if (geo === chest || geo === belt) c = vestC
      else if (geo === helmet) c = helmetC
      else if (geo === gun || geo === gunMag) c = 0x23262d
      else if (geo === head) c = 0x3d3336
      return colored(geo, c)
    })
    const merged = mergeGeometries(geos)
    this.bodyMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.12, flatShading: true }))
    this.bodyMesh.castShadow = true
    g.add(this.bodyMesh)
    this.mat = this.bodyMesh.material

    // 敌方深红描边（以身体中心 y=0.9 为缩放原点，加宽加亮 → 与暖色背景鲜明区分）
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0xff1730, side: THREE.BackSide })
    this.outline = new THREE.Mesh(merged, outlineMat)
    this.outline.position.set(0, 0.9, 0)
    this.outline.scale.setScalar(1.09)
    this.outline.renderOrder = -1
    g.add(this.outline)

    // 面罩（自发光 → 醒目）
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), new THREE.MeshStandardMaterial({
      color: 0x111318, emissive: pick(ACCENTS), emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.4,
    }))
    this.visor.position.set(0, 1.6, 0.16)
    g.add(this.visor)

    g.position.set(this.pos.x, 0, this.pos.z)
    g.rotation.y = this.yaw
    scene.add(g)
    this.group = g

    // 名牌 + 血条
    this.hpCanvas = document.createElement('canvas')
    this.hpCanvas.width = 256
    this.hpCanvas.height = 60
    this.hpTex = new THREE.CanvasTexture(this.hpCanvas)
    this.hpTex.colorSpace = THREE.SRGBColorSpace
    const spriteMat = new THREE.SpriteMaterial({ map: this.hpTex, depthWrite: false, transparent: true })
    this.tag = new THREE.Sprite(spriteMat)
    this.tag.scale.set(1.7, 0.4, 1)
    this.tag.position.set(0, 2.2, 0)
    g.add(this.tag)
    this.drawTag()

    this.setAliveVisual(true)
  }

  dispose() {
    scene.remove(this.group)
    this.hpTex.dispose()
  }

  drawTag() {
    const g = this.hpCanvas.getContext('2d')
    g.clearRect(0, 0, 256, 60)
    const color = this.diff === 'hard' ? '#ff6b7d' : this.diff === 'normal' ? '#f5b942' : '#c8cdd8'
    g.font = 'bold 20px Segoe UI, sans-serif'
    g.textAlign = 'center'
    g.fillStyle = color
    g.fillText(this.name, 128, 24)
    g.font = '12px Consolas, monospace'
    g.fillStyle = '#8b95a8'
    g.fillText(`${this.hp}`, 224, 24)
    // 血条
    g.fillStyle = 'rgba(0,0,0,0.55)'
    g.fillRect(14, 36, 228, 10)
    g.fillStyle = this.hp > 55 ? '#59d47c' : this.hp > 25 ? '#f5b942' : '#ff5c6c'
    g.fillRect(16, 38, 224 * Math.max(0, this.hp / 100), 6)
    this.hpTex.needsUpdate = true
  }

  setAliveVisual(alive) {
    this.group.visible = alive
  }

  /* ---------- 受击 ---------- */
  hit(dmg, head, attacker, weaponId) {
    if (!this.alive) return false
    let dealt = dmg
    if (!head) {
      const absorbed = Math.min(this.armor, dealt)
      this.armor -= absorbed
      dealt -= absorbed
    }
    this.hp -= dealt
    this.flash = 1
    this.stats.hits++
    this.drawTag()
    if (this.hp <= 0) {
      this.hp = 0
      this.die(attacker, head, weaponId)
      return true
    }
    return false
  }

  die(attacker, head, weaponId) {
    this.alive = false
    this.deaths++
    this.streak = 0
    this.state = 'dead'
    this.deathT = 0
    this.tag.visible = false
    ev.emit('entityKilled', { victim: this, attacker, head, weaponId })
  }

  respawn(x, z) {
    this.respawnT = 0
    this.pos.set(x, 0, z)
    this.yaw = Math.random() * Math.PI * 2
    this.aimYaw = this.yaw
    this.hp = 100
    this.armor = this.maxArmor
    this.alive = true
    this.mag = WEAPON[this.weaponId].mag
    this.reloading = false
    this.state = 'roam'
    this.path = []
    this.target = null
    this.deathT = 0
    this.idleT = 0.3
    this.mat.opacity = 1
    this.mat.transparent = false
    this.outline.material.opacity = 1
    this.outline.material.transparent = false
    this.group.rotation.z = 0
    this.group.rotation.x = 0
    this.group.scale.y = 1
    this.group.position.y = 0
    this.tag.visible = true
    this.spawnProtect = CFG.bots.spawnProtect
    this.setAliveVisual(true)
    this.drawTag()
  }

  /* ---------- 换弹掩体 ---------- */
  /** 找最近的掩体背后点（换弹时躲避） */
  findCover() {
    if (!this.target) return null
    let best = null, bestD = Infinity
    for (const b of world.groundColliders) {
      if (b.h < 1) continue
      const dx = this.pos.x - b.x, dz = this.pos.z - b.z
      const d = Math.hypot(dx, dz)
      if (d < bestD) { bestD = d; best = b }
    }
    if (!best || bestD > 9) return null
    const tx = this.target.pos.x - best.x, tz = this.target.pos.z - best.z
    const tl = Math.hypot(tx, tz) || 1
    const half = Math.max(best.w, best.d) / 2 + 0.9
    return { x: best.x - (tx / tl) * half, z: best.z - (tz / tl) * half }
  }

  /* ---------- 感知 ---------- */
  scan(player, bots) {
    let best = null, bestD = Infinity
    const cands = []
    if (player.alive) cands.push(player)
    for (const b of bots) if (b !== this && b.alive) cands.push(b)
    for (const c of cands) {
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z
      const d = Math.hypot(dx, dz)
      // 背后感知距离减半（Valorant 向：看不到身后）
      const dA = Math.abs(angDiff(this.yaw, Math.atan2(dx, dz)))
      const fovMult = dA > Math.PI / 3 ? 0.5 : 1
      if (d > CFG.bots.visionRange * fovMult) continue
      // 视线检测
      const dir = [dx / d, (1.15 - 1.6) / d, dz / d]
      const r = world.rayCast(this.pos.x, 1.6, this.pos.z, dir[0], dir[1], dir[2], d)
      if (r.b) continue
      if (d < bestD) { bestD = d; best = c }
    }
    return best
  }

  /* ---------- 帧更新 ---------- */
  update(dt, time, player, bots) {
    this.flash = Math.max(0, this.flash - dt * 5)
    this.mat.emissive.setRGB(this.flash, 0, 0)
    this.mat.emissiveIntensity = this.flash * 0.8

    if (!this.alive) {
      this.deathT += dt
      const k = Math.min(1, this.deathT / 0.3)
      this.group.rotation.z = this.fallDir * 1.55 * k
      this.group.position.y = -0.05 * k
      if (this.deathT > 1.3 && this.deathT < 2.6) {
        this.mat.transparent = true
        this.mat.opacity = 1 - (this.deathT - 1.3) / 1.3
        this.outline.material.transparent = true
        this.outline.material.opacity = 1 - (this.deathT - 1.3) / 1.3
      }
      return
    }

    // 换弹
    if (this.reloading) {
      this.reloadT -= dt
      if (this.reloadT <= 0) {
        this.reloading = false
        this.mag = this.weapon.mag
        this.coverPos = null
      }
    }
    this.fireCd -= dt
    this.burstPause -= dt

    // 感知
    this.thinkT -= dt
    if (this.thinkT <= 0) {
      this.thinkT = CFG.bots.thinkInterval
      const seen = this.scan(player, bots)
      if (seen) {
        if (this.target !== seen) {
          this.target = seen
          this.reactT = (0.18 + Math.random() * 0.35) * (1.4 - this.skill)
        }
        if (this.state === 'roam' || this.state === 'hunt') this.state = 'fight'
      } else if (this.state === 'fight' && this.target) {
        this.lastKnown = { x: this.target.pos.x, z: this.target.pos.z }
        this.lastKnownT = time
        this.target = null
        this.state = 'hunt'
      }
    }

    /* --- 状态决策 --- */
    if (this.state === 'fight' && this.target) {
      const d = Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z)
      if (this.hp < 30 && Math.random() < 0.004 * dt * 60) {
        this.state = 'flee'
        this.fleeT = 1.4 + Math.random() * 0.6
      }
      if (!this.target.alive) { this.target = null; this.state = 'roam' }
      if (d > CFG.bots.visionRange) { this.target = null; this.state = 'hunt' }
    }
    if (this.state === 'flee') {
      this.fleeT -= dt
      if (this.fleeT <= 0) this.state = 'fight'
    }

    /* --- 朝向与移动 --- */
    let moveX = 0, moveZ = 0, speedFactor = 0.6, faceAngle = null

    if (this.state === 'fight' && this.target) {
      faceAngle = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z)
      this.strafeT -= dt
      if (this.strafeT <= 0) {
        this.strafeT = rand(0.7, 1.7)
        if (Math.random() < 0.5) this.strafeDir *= -1
      }
      const toX = this.target.pos.x - this.pos.x, toZ = this.target.pos.z - this.pos.z
      const tl = Math.hypot(toX, toZ) || 1
      moveX = (-toZ / tl) * this.strafeDir
      moveZ = (toX / tl) * this.strafeDir
      speedFactor = this.crouching ? 0.42 : 0.78
      const d = Math.hypot(toX, toZ)
      if (d < 4.5) {
        moveX = -toX / tl
        moveZ = -toZ / tl
        speedFactor = 0.5
      }
      // 换弹时躲掩体（Valorant 向：不在开阔地站桩）
      if (this.reloading && this.coverPos) {
        const cx2 = this.coverPos.x - this.pos.x, cz2 = this.coverPos.z - this.pos.z
        const cl2 = Math.hypot(cx2, cz2) || 1
        if (cl2 > 0.6) {
          faceAngle = Math.atan2(cx2, cz2)
          moveX = cx2 / cl2
          moveZ = cz2 / cl2
          speedFactor = 0.95
        } else { moveX = 0; moveZ = 0 }
      } else if (this.burstLeft > 0) {
        // 点射急停：burst 期间站定开火（Valorant 风格）
        moveX = 0
        moveZ = 0
        speedFactor = 0
      }
    } else if (this.state === 'flee' && this.target) {
      faceAngle = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z)
      const toX = this.target.pos.x - this.pos.x, toZ = this.target.pos.z - this.pos.z
      const tl = Math.hypot(toX, toZ) || 1
      moveX = -toX / tl
      moveZ = -toZ / tl
      speedFactor = 0.95
    } else {
      // 沿路径移动
      if (this.pathIdx >= this.path.length) {
        if (this.state === 'hunt' && this.lastKnown) {
          // 已接近最后已知位置：短暂停留后转为漫游
          if (Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) < 2.2) {
            this.lastKnown = null
            this.idleT = rand(0.5, 1.1)
            this.state = 'roam'
          } else {
            this.path = world.findPath(this.pos.x, this.pos.z, this.lastKnown.x, this.lastKnown.z)
            if (this.path.length) { this.pathIdx = 0 }
            else { this.lastKnown = null; this.idleT = 0.6 }
          }
        }
        if (this.state === 'hunt' && this.lastKnown && time - this.lastKnownT > 6) {
          this.lastKnown = null
          this.state = 'roam'
          this.idleT = 0.5
        }
        if (this.idleT > 0) {
          this.idleT -= dt
        } else {
          this.pickWanderTarget()
        }
      } else {
        const n = world.getNavPoint(this.path[this.pathIdx])
        const dx = n[0] - this.pos.x, dz = n[1] - this.pos.z
        const dl = Math.hypot(dx, dz)
        faceAngle = Math.atan2(dx, dz)
        if (dl < 0.7) {
          this.pathIdx++
        } else {
          moveX = dx / dl
          moveZ = dz / dl
          speedFactor = this.state === 'hunt' ? 0.78 : 0.6
          // 接近最后已知位置但被掩体遮挡：放慢脚步并朝向目标
          if (this.state === 'hunt' && this.lastKnown) {
            const dG = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z)
            if (dG < 5.5 && !world.lineClear(this.pos.x, this.pos.z, this.lastKnown.x, this.lastKnown.z)) {
              speedFactor = Math.min(speedFactor, 0.38)
              faceAngle = Math.atan2(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z)
            }
          }
        }
      }
    }

    // 卡住检测
    const moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ)
    this.lastX = this.pos.x; this.lastZ = this.pos.z
    if (moved < 0.1) {
      this.stuckT += dt
      if (this.stuckT > 1.2) {
        this.stuckT = 0
        this.path = []
        this.idleT = 0.4
        if (this.state === 'hunt') this.state = 'roam'
      }
    } else this.stuckT = 0

    // 蹲伏
    this.crouchT -= dt
    if (this.state === 'fight' && this.crouchT <= 0) {
      this.crouchT = rand(0.9, 2.2)
      this.crouching = Math.random() < 0.22 && Math.random() < this.skill + 0.2
    }
    if (this.state !== 'fight') this.crouching = false
    const crouchScale = this.crouching ? 0.8 : 1
    this.group.scale.y = crouchScale

    // 移动执行
    const speed = this.weapon.speed * speedFactor
    const accel = 20
    this.pos.x = approach(this.pos.x, this.pos.x + moveX * speed * dt, accel * dt)
    this.pos.z = approach(this.pos.z, this.pos.z + moveZ * speed * dt, accel * dt)
    resolveCircle(this.pos, 0.32, world.groundColliders)
    const feetY = this.pos.y
    for (const s of world.climbables) {
      if (circleHits(this.pos.x, this.pos.z, 0.32, s)) {
        if (s.top > feetY + 0.001 && s.top - feetY <= 0.36) {
          this.pos.y = s.top
        }
      }
    }
    const gy = world.groundYUnder(this.pos.x, this.pos.z, this.pos.y, -1)
    if (gy !== null && gy >= this.pos.y - 0.05) {
      this.pos.y = gy
    } else {
      // 走下平台/台阶：平滑下落（避免瞬间贴地）
      this.pos.y = Math.max(gy === null ? -50 : gy, this.pos.y - 14 * dt)
    }

    // 机器人互相避让（+玩家）
    for (const o of bots) {
      if (o === this || !o.alive) continue
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.85 && d > 0.001) {
        this.pos.x += (dx / d) * (0.85 - d) * 0.5
        this.pos.z += (dz / d) * (0.85 - d) * 0.5
      }
    }
    if (player.alive) {
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.85 && d > 0.001) {
        this.pos.x += (dx / d) * (0.85 - d) * 0.5
        this.pos.z += (dz / d) * (0.85 - d) * 0.5
      }
    }

    // 行走动画：腿部摆动 + 身体起伏 + 前倾
    const walkSpd = Math.hypot(moveX, moveZ) * speedFactor
    this.isMoving = walkSpd > 0.25
    // 敌人脚步音（空间化：玩家可听到接近脚步）
    if (this.isMoving && this.pos.y < 0.05) {
      this.footT -= dt
      if (this.footT <= 0) {
        this.footT = 0.55
        const camP = camera.position
        const d3 = Math.hypot(camP.x - this.pos.x, camP.z - this.pos.z)
        if (d3 < 22) {
          const rel = [this.pos.x - camP.x, this.pos.z - camP.z]
          const rl = Math.hypot(rel[0], rel[1]) || 1
          const right = cameraWorldRight()
          const pan = clamp((rel[0] * right[0] + rel[1] * right[2]) / rl, -0.85, 0.85)
          audio.footstepPan(pan, Math.max(0.02, 0.06 * (1 - d3 / 22)))
        }
      }
    }
    this.walkPhase += dt * 7 * Math.max(0.15, walkSpd)
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.05 * walkSpd
    this.group.position.set(this.pos.x, bob, this.pos.z)
    this.legs[0].rotation.x = Math.sin(this.walkPhase) * 0.55 * walkSpd
    this.legs[1].rotation.x = -Math.sin(this.walkPhase) * 0.55 * walkSpd
    const tilt = walkSpd * 0.08
    this.group.rotation.x = tilt

    // 朝向
    if (faceAngle !== null) {
      const dA = angDiff(this.yaw, faceAngle)
      const turnRate = this.state === 'fight' ? 9 : 5
      this.yaw += clamp(dA, -turnRate * dt, turnRate * dt)
    }
    this.group.rotation.y = this.yaw

    /* --- 交火 --- */
    if (this.spawnProtect > 0) {
      this.spawnProtect -= dt
      this.pitchBias = 0
      // 重生保护期间不主动开火（防背后偷袭），但保持移动与转向
    } else if (this.state === 'fight' && this.target) {
      this.reactT -= dt
      const toX = this.target.pos.x - this.pos.x, toZ = this.target.pos.z - this.pos.z
      const dist = Math.hypot(toX, toZ) || 1
      // 真人瞄准：个人习惯修正爆头偏好 + 距离惩罚（远距离更倾向打身体）
      const bias = this.hsBias * (0.5 + this.aimStyle) * (1 - Math.min(1, dist / 18) * 0.55)
      const targetY = Math.random() < bias ? HEAD_Y : CHEST_Y
      // 水平误差（真人左右偏）+ 准星漂移（慢速随机游走）
      const err = (1 - this.skill) * (dist * 0.012 + 0.35)
      this.aimDriftV = clamp(this.aimDriftV + (Math.random() - 0.5) * 0.004, -0.004, 0.004)
      this.aimDrift = clamp(this.aimDrift + this.aimDriftV, -0.03, 0.03)
      const aimX = this.target.pos.x + (Math.random() - 0.5) * 2 * err + this.aimDrift * dist * 0.6
      const aimZ = this.target.pos.z + (Math.random() - 0.5) * 2 * err + this.aimDrift * dist * 0.6
      const aimY = (this.target.pos.y || 0) + targetY + (Math.random() - 0.5) * 0.25 * err
      const wantYaw = Math.atan2(aimX - this.pos.x, aimZ - this.pos.z)
      const wantPitch = Math.atan2(aimY - (this.pos.y + 1.6), dist)
      this.aimYaw = dampAngle(this.aimYaw, wantYaw, (7 + this.skill * 6) * dt)
      this.aimPitch = dampAngle(this.aimPitch, wantPitch, (7 + this.skill * 6) * dt)

      // 开火决策
      if (this.reactT <= 0 && this.burstPause <= 0 && this.fireCd <= 0 && !this.reloading) {
        const facing = Math.abs(angDiff(this.yaw, this.aimYaw))
        if (facing < 0.45 && this.mag > 0) {
          if (this.burstLeft <= 0) {
            this.burstLeft = this.weaponId === 'm4'
              ? Math.floor(3 + this.skill * 6 + Math.random() * 3)
              : 1 + (Math.random() < 0.35 ? 1 : 0)
          }
          this.fire()
          this.burstLeft--
          if (this.burstLeft <= 0) {
            this.burstPause = this.weaponId === 'm4' ? rand(0.22, 0.55) : rand(0.42, 0.8)
          }
        }
      }
      if (this.mag <= 0 && !this.reloading) {
        this.reloading = true
        this.reloadT = this.weapon.reload * (1.25 - this.skill * 0.35)
        this.coverPos = this.findCover()
      }
    } else {
      this.pitchBias = 0
    }
    this.pitchBias = clamp(this.pitchBias, -0.12, 0.12)

    // 身体倾斜恢复
    this.group.rotation.x = dampAngle(this.group.rotation.x, tilt, 5 * dt)
  }

  pickWanderTarget() {
    const hi = []
    for (let k = 0; k < world.navHeights.length; k++) if (world.navHeights[k] >= 1.8) hi.push(k)
    for (let tries = 0; tries < 8; tries++) {
      let i = Math.floor(Math.random() * world.navCount)
      // 高难度 AI 更倾向抢占高台
      if (this.diff === 'hard' && hi.length && Math.random() < 0.45) {
        i = hi[Math.floor(Math.random() * hi.length)]
      }
      const n = world.getNavPoint(i)
      const d = Math.hypot(n[0] - this.pos.x, n[1] - this.pos.z)
      if (d > 6 && d < 24) {
        this.path = world.findPath(this.pos.x, this.pos.z, n[0], n[1])
        if (this.path.length) { this.pathIdx = 0; return }
      }
    }
    this.idleT = rand(0.8, 1.6)
  }

  fire() {
    const w = this.weapon
    this.fireCd = 60 / w.rpm
    this.mag--
    this.stats.shots++
    // 后坐爬升（影响后续弹道散布）
    this.pitchBias = Math.min(0.09, this.pitchBias + (w.id === 'm4' ? 0.005 : 0.012) * (0.5 + this.skill))

    // 弹道方向：瞄准（后坐爬升使枪口上抬）+ 随机扩散
    const spread = 0.004 + (1 - this.skill) * 0.012 + (this.crouching ? 0 : 0.006) + (this.isMoving ? 0.009 : 0)
    const pitchUsed = this.aimPitch + this.pitchBias
    const dir = coneDir(
      [Math.sin(this.aimYaw) * Math.cos(pitchUsed), Math.sin(pitchUsed), Math.cos(this.aimYaw) * Math.cos(pitchUsed)],
      [Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw)],
      [0, 1, 0],
      spread
    )
    const nl = Math.hypot(dir[0], dir[1], dir[2]) || 1
    dir[0] /= nl; dir[1] /= nl; dir[2] /= nl

    const origin = [this.pos.x, this.pos.y + 1.6, this.pos.z]
    let bestT = 48, best = null
    const wh = world.rayCast(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], 48)
    if (wh.b) { bestT = wh.t; best = { type: 'world', b: wh.b, n: wh.n } }
    const check = (tgt) => {
      if (!tgt.alive) return
      const t = rayCapsule(origin, dir, [tgt.pos.x, 0, tgt.pos.z], [tgt.pos.x, 1.8, tgt.pos.z], 0.34)
      if (t !== -1 && t < bestT) { bestT = t; best = { type: 'ent', tgt } }
    }
    for (const b of this.botsRef) if (b !== this && b.alive) check(b)
    if (this.playerRef.alive) check(this.playerRef)

    const hitP = [origin[0] + dir[0] * bestT, origin[1] + dir[1] * bestT, origin[2] + dir[2] * bestT]
    const gunTip = [this.pos.x + Math.sin(this.aimYaw) * 0.8, this.pos.y + 1.2, this.pos.z + Math.cos(this.aimYaw) * 0.8]
    tracer(gunTip, hitP, w.tracer)
    muzzleFlash(new THREE.Vector3(gunTip[0], gunTip[1], gunTip[2]), 0.16)

    // 空间音效
    const camP = camera.position
    const d2 = Math.hypot(camP.x - this.pos.x, camP.y - (this.pos.y + 1.5), camP.z - this.pos.z)
    const rel = [this.pos.x - camP.x, this.pos.z - camP.z]
    const rl = Math.hypot(rel[0], rel[1]) || 1
    const right = cameraWorldRight()
    const pan = clamp((rel[0] * right[0] + rel[1] * right[2]) / rl, -0.85, 0.85)
    audio.playShot(w, { pan, dist: d2 })

    if (!best) return
    if (best.type === 'ent') {
      const head = hitP[1] > best.tgt.pos.y + 1.42
      const dmg = w.dmg * (head ? w.headMult : 1)
      blood(hitP, [-dir[0], -dir[1], -dir[2]], head)
      if (head) audio.hitHead(); else audio.hitBody()
      best.tgt.hit(dmg, head, this, w.id)
    } else {
      impact(hitP, best.n, best.b.mat)
    }
  }
}

/* ---------------- 机器人管理 ---------------- */
export class Bots {
  constructor(scene, player) {
    this.playerRef = player
    this.list = []
    this.rebuild(CFG.bots.count)
  }

  get aliveList() { return this.list.filter((b) => b.alive) }

  /** 按数量重建（设置面板可调敌人数量） */
  rebuild(count) {
    for (const b of this.list) b.dispose()
    this.list = []
    // 关键：重建后必须同步玩家的目标引用，否则玩家永远打不到新机器人
    this.playerRef.targets = this.list
    const names = [...CFG.bots.names].sort(() => Math.random() - 0.5)
    for (let i = 0; i < count; i++) {
      const diff = CFG.bots.roster[i % CFG.bots.roster.length]
      const bot = new Bot(scene, rand(-20, 20), rand(-15, 15), names[i % names.length], diff)
      bot.botsRef = this.list
      bot.playerRef = this.playerRef
      this.list.push(bot)
    }
    // 初始分散出生
    const living = [{ x: this.playerRef.pos.x, z: this.playerRef.pos.z }]
    for (const b of this.list) {
      const sp = pickSpawnWorld(living)
      b.respawn(sp.x, sp.z)
      living.push(b.pos)
    }
  }

  respawnBot(bot) {
    const living = this.aliveList.filter((b) => b !== bot)
    if (this.playerRef.alive) living.push(this.playerRef)
    const sp = pickSpawnWorld(living)
    bot.respawn(sp.x, sp.z)
  }

  update(dt, time) {
    for (const b of this.list) b.update(dt, time, this.playerRef, this.list)
  }
}

function pickSpawnWorld(living) {
  const spawns = CFG.spawns.map((s) => ({ x: s[0], z: s[1] }))
  let best = spawns[0], bestScore = -Infinity
  for (const s of spawns) {
    let minD = Infinity
    for (const e of living) {
      // 实体可能是 Bot/Player 对象（.pos.x）或纯坐标 {x, z}
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

/* ---------- 数学 ---------- */
const approach = (cur, target, maxDelta) => {
  const d = target - cur
  if (d > maxDelta) return cur + maxDelta
  if (d < -maxDelta) return cur - maxDelta
  return target
}

const angDiff = (a, b) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
const dampAngle = (a, b, k) => a + clamp(angDiff(a, b), -k, k)
