/* ================= 玩家控制器（Valorant 手感） ================= */
import * as THREE from 'three'
import { camera } from './render.js'
import { input } from './input.js'
import { CFG, settings } from './config.js'
import { WEAPON, M4_PATTERN, buildViewmodel } from './weapons.js'
import { world } from './world/map.js'
import { ev } from './events.js'
import * as audio from './audio.js'
import { tracer, impact, blood, muzzleFlash, shellEject, decal, landDust, slashFx } from './effects.js'
import { clamp, deg2rad, coneDir, rayCapsule, resolveCircle, circleHits } from './utils.js'

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, 0)
    this.vel = new THREE.Vector3()
    this.yaw = Math.PI
    this.pitch = 0
    this.onGround = true
    this.crouched = false
    this.crouchAmount = 0
    this.alive = true
    this.hp = CFG.player.hp
    this.armor = CFG.player.armor
    this.invuln = 0
    this.enabled = false        // 比赛进行中才可移动射击
    this.weaponId = 'm4'
    this.pendingWeapon = null
    this.switching = false
    this.switchT = 0
    // 每把武器独立弹药（切枪不再免费满弹，Valorant 规则）
    this.mags = Object.fromEntries(Object.entries(WEAPON).map(([id, w]) => [id, w.mag]))
    this.reloading = false
    this.reloadT = 0
    this.reloadDur = 0
    this.fireCooldown = 0
    this.bloom = 0
    this.patternIdx = 0
    this.recoilPitch = 0
    this.recoilYaw = 0
    this.ads = 0
    this.eyeH = CFG.player.eyeStand
    this.bobT = 0
    this.bobAmt = 0
    this.swayX = 0
    this.swayY = 0
    this.lookYaw = this.yaw
    this.lookPitch = this.pitch
    this._lookInput = false
    this.kick = 0
    this.roll = 0
    this.shake = 0
    this.footT = 0
    this.jumpBuffer = 0         // 跳跃缓冲（提前按空格也生效）
    this.meleeT = 1             // 近战动画进度（>=1 表示不在攻击中）
    this.meleeHeavy = false
    this.meleeDur = 0.4
    this.pendingMelee = -1      // 攻击输入缓冲（-1 无，0 轻击，1 重击）
    this.inspectT = 0           // F 检视动画进度（0 不在检视）
    this.deathLookAt = null     // 击杀者位置（死亡镜头转向）
    this.targets = []           // 由 game 注入（机器人列表）
    this.training = false       // 训练靶场：无限弹药
    this.isPlayer = true
    this.name = '你'
    this.kills = 0
    this.deaths = 0
    this.streak = 0
    this.bestStreak = 0
    this.stats = { shots: 0, hits: 0, headshots: 0, melee: 0, meleeKills: 0 }
    this.muzzleWorld = new THREE.Vector3()

    // 第一人称武器
    this.viewModels = {}
    for (const id of ['m4', 'deagle', 'knife', 'op']) {
      const vm = buildViewmodel(id)
      vm.view.visible = id === this.weaponId
      this.viewModels[id] = { view: vm.view, muzzle: vm.muzzle, pose: vm.pose, hide: vm.hide }
      camera.add(vm.view)
      vm.view.updateMatrixWorld()
    }
    this.view = this.viewModels[this.weaponId]

    // 枪口闪光点光源
    this.muzzleLight = new THREE.PointLight(0xffd9a0, 0, 4.5, 1.6)
    this.muzzleLight.position.set(0.05, 0.02, -0.55)
    camera.add(this.muzzleLight)

    // 第一人称模型补光：世界光照主要照亮地图，枪械靠近镜头容易过暗。
    // 挂一盏衰减很快的暖白补光在相机上，只提亮近处枪身，几乎不影响场景。
    this.viewLight = new THREE.PointLight(0xfff0dd, 0.5, 2.8, 2)
    this.viewLight.position.set(0.25, 0.32, 0.12)
    camera.add(this.viewLight)

    // 玩家影子替身（只有阴影，看不见身体）
    this.shadowDummy = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.0, 4, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    this.shadowDummy.castShadow = true
    this.shadowDummy.position.y = 0.8
    scene.add(this.shadowDummy)
  }

  spawn(x, z) {
    this.pos.set(x, 0, z)
    this.vel.set(0, 0, 0)
    this.mags = Object.fromEntries(Object.entries(WEAPON).map(([id, w]) => [id, w.mag]))
    this.hp = CFG.player.hp
    this.armor = CFG.player.armor
    this.alive = true
    this.bloom = 0
    this.recoilPitch = 0
    this.recoilYaw = 0
    this.patternIdx = 0
    this.switching = false
    this._swMid = false
    this.pendingMelee = -1
    this.meleeT = 1
    this.deathLookAt = null
    this.ads = 0
    this.invuln = CFG.match.invuln
    this.crouched = false
    this.crouchAmount = 0
    this.eyeH = CFG.player.eyeStand
  }

  get weapon() { return WEAPON[this.weaponId] }
  get mag() { return this.mags[this.weaponId] }
  set mag(v) { this.mags[this.weaponId] = v }

  /* ---------- 受击 ---------- */
  hit(dmg, head, attacker, weaponId) {
    if (!this.alive || this.invuln > 0 || !this.enabled) return false
    let dealt = dmg
    if (!head) {
      const absorbed = Math.min(this.armor, dealt)
      this.armor -= absorbed
      dealt -= absorbed
    }
    this.hp -= dealt
    this.shake = Math.min(1, this.shake + 0.35)
    ev.emit('playerHurt', { hp: this.hp, armor: this.armor, head, from: attacker ? attacker.pos : null })
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      this.deaths++
      this.streak = 0
      if (attacker && attacker.pos) this.deathLookAt = attacker.pos.clone()
      ev.emit('entityKilled', { victim: this, attacker, head, weaponId })
      return true
    }
    return false
  }

  healFull() {
    this.hp = CFG.player.hp
    this.armor = CFG.player.armor
  }

  /* ---------- 换弹 / 切枪 ---------- */
  startReload() {
    if (this.reloading || this.switching || this.weaponId === 'knife' || this.mag >= this.weapon.mag) return
    this.reloading = true
    this.reloadT = 0
    this.reloadDur = this.weapon.reload
    audio.reloadSounds(this.weaponId)
  }

  finishReload() {
    this.reloading = false
    this.mag = this.weapon.mag
  }

  switchTo(id) {
    if (id === this.weaponId || this.switching) return
    this.pendingWeapon = id
    this.switching = true
    this.switchT = 0
    this._swMid = false
    this.reloading = false
    this.inspectT = 0
    this.bloom = 0
    this.patternIdx = 0
    this.meleeT = 1
    this.ads = 0
  }

  /* ---------- 散布（急停核心：速度低于阈值视为静止，第一发必准） ---------- */
  computeSpread() {
    const w = this.weapon
    if (w.id === 'knife') return 0
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    // 急停判定：速度低于 0.22×移速即视为完全静止（Valorant 急停手感）
    const spd = hSpeed < w.speed * 0.22 ? 0 : hSpeed / w.speed
    let move = w.movePen * (0.35 * spd + 0.65 * spd * spd)
    if (this.crouchAmount > 0.5) move *= w.crouchMult
    let spread = w.baseSpread + move + this.bloom
    spread *= lerp1(1, w.adsMult, this.ads)
    if (!this.onGround) spread = Math.max(spread, w.airPen)
    // 狙击枪开镜移动大幅失准（Valorant 大狙规则）—— 注意：spread 为度数，最后统一转弧度
    if (w.id === 'op' && this.ads > 0.5 && spd > 0.15) {
      spread = Math.max(spread, 6 * spd)
    }
    return deg2rad(spread)
  }

  /* ---------- 近战（匕首） ---------- */
  meleeAttack(heavy) {
    // 攻击冷却期间按下的攻击排队执行（输入缓冲，提升手感）
    if (this.meleeT < 1 || this.switching || this.reloading) {
      this.pendingMelee = heavy ? 1 : 0
      return
    }
    const w = this.weapon
    this.meleeHeavy = heavy
    this.inspectT = 0
    this.meleeT = 0
    this.meleeDur = heavy ? 0.75 : 0.45
    this.stats.melee++
    audio.meleeSwing(heavy)

    const origin = [camera.position.x, camera.position.y, camera.position.z]
    const fwd = cameraWorldForward()
    const nl = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1
    const dir = [fwd[0] / nl, fwd[1] / nl, fwd[2] / nl]
    const range = heavy ? w.heavyRange : w.range

    let bestT = range, best = null
    const tgt = this.targets
    for (let i = 0; i < tgt.length; i++) {
      const bot = tgt[i]
      if (!bot.alive) continue
      const t = rayCapsule(origin, dir, [bot.pos.x, 0, bot.pos.z], [bot.pos.x, 1.8, bot.pos.z], 0.42)
      if (t !== -1 && t < bestT) { bestT = t; best = { type: 'bot', bot, t } }
    }
    const mr = world.rayCast(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], bestT)
    if (mr.b) { bestT = mr.t; best = { type: 'world', b: mr.b, n: mr.n } }

    const hitP = [origin[0] + dir[0] * bestT, origin[1] + dir[1] * bestT, origin[2] + dir[2] * bestT]
    slashFx(origin, dir, bestT)

    if (!best) { audio.meleeWhiff(); return }
    if (best.type === 'bot') {
      const head = hitP[1] > best.bot.pos.y + 1.42
      const dmg = (heavy ? w.heavyDmg : w.dmg) * (head ? w.headMult : 1)
      if (best.bot.isTarget) {
        impact(hitP, [-dir[0], -dir[1], -dir[2]], 'metal')
      } else {
        blood(hitP, [-dir[0], -dir[1], -dir[2]], head)
      }
      if (!best.bot.isTarget) audio.meleeHit(head)
      // 命中反馈：刀刃顿挫 + 轻微受击感（Valorant 刀击手感）
      this.kick = Math.min(0.4, this.kick + (heavy ? 0.16 : 0.09))
      this.shake = Math.min(1, this.shake + (heavy ? 0.16 : 0.1))
      const killed = best.bot.hit(dmg, head, this, 'knife')
      ev.emit('hitmarker', { kill: killed, head })
      // 轻击击退
      if (!killed && !best.bot.isTarget) {
        best.bot.pos.x += dir[0] * 0.6
        best.bot.pos.z += dir[2] * 0.6
      }
    } else {
      audio.meleeImpact(best.b.mat)
      impact(hitP, best.n, best.b.mat)
    }
  }

  refillAmmo() {
    this.mags = Object.fromEntries(Object.entries(WEAPON).map(([id, w]) => [id, w.mag]))
  }

  /* ---------- 射击 ---------- */
  fire() {
    const w = this.weapon
    if (w.id === 'knife') { this.meleeAttack(false); return }
    this.inspectT = 0
    if (this.fireCooldown > 0) return
    // 换弹中开火：打断换弹直接射击（Valorant 规则）
    if (this.reloading) this.reloading = false
    if (this.mag <= 0) {
      if (this.training) {
        this.mags[this.weaponId] = w.mag
        this.mag = w.mag
      } else {
        audio.emptyClick()
        this.startReload()
        return
      }
    }
    if (this.switching) return
    this.fireCooldown = 60 / w.rpm
    this.mag--
    this.stats.shots++
    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloomPerShot)
    this.kick = Math.min(1, this.kick + (w.id === 'deagle' ? 0.5 : 0.18))
    this.roll = this.roll + (w.id === 'deagle' ? 0.02 : 0.004)

    // 后坐力（压枪弹道）
    if (w.id === 'm4' && this.patternIdx < M4_PATTERN.length) {
      const [p, y] = M4_PATTERN[this.patternIdx]
      this.recoilPitch += p
      this.recoilYaw += y
      this.patternIdx++
    } else {
      this.recoilPitch += w.kick + (Math.random() - 0.5) * 0.3
      this.recoilYaw += (Math.random() - 0.5) * (w.id === 'deagle' ? 0.5 : 0.12)
    }

    // 枪口特效 + 音效
    this.view.muzzle.getWorldPosition(this.muzzleWorld)
    muzzleFlash(this.muzzleWorld, w.id === 'deagle' ? 0.3 : 0.22)
    this.muzzleLight.intensity = w.id === 'deagle' ? 7 : 4.5
    audio.playShot(w)
    shellEject(this.muzzleWorld, cameraWorldRight(), cameraWorldUp())

    // 命中判定（即时命中）—— 注意：rayBox/rayCapsule 用数字索引，Vector3 不支持 [0]，须转纯数组
    const origin = [camera.position.x, camera.position.y, camera.position.z]
    const fwd = cameraWorldForward()
    const right = cameraWorldRight()
    const up = cameraWorldUp()
    const dir = coneDir(fwd, right, up, this.computeSpread())
    const nl = Math.hypot(dir[0], dir[1], dir[2]) || 1
    dir[0] /= nl; dir[1] /= nl; dir[2] /= nl

    let bestT = 48, best = null
    const wh = world.rayCast(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], 48)
    if (wh.b) { bestT = wh.t; best = { type: 'world', b: wh.b, n: wh.n } }
    const tgt = this.targets
    for (let i = 0; i < tgt.length; i++) {
      const bot = tgt[i]
      if (!bot.alive) continue
      const t = rayCapsule(origin, dir, [bot.pos.x, 0, bot.pos.z], [bot.pos.x, 1.8, bot.pos.z], 0.34)
      if (t !== -1 && t < bestT) { bestT = t; best = { type: 'bot', bot, t } }
    }

    // 木箱穿透（Valorant 机制）：命中木箱后继续追踪，穿透伤害衰减
    let penetrate = false
    if (best && best.type === 'world' && best.b.mat === 'wood') {
      const entryP = [origin[0] + dir[0] * bestT, origin[1] + dir[1] * bestT, origin[2] + dir[2] * bestT]
      decal(entryP, best.n)
      const o2 = [entryP[0] + dir[0] * 0.03, entryP[1] + dir[1] * 0.03, entryP[2] + dir[2] * 0.03]
      let bt2 = 48, b2 = null
      const pr = world.rayCast(o2[0], o2[1], o2[2], dir[0], dir[1], dir[2], 48, best.b)
      if (pr.b) { bt2 = pr.t; b2 = { type: 'world', b: pr.b, n: pr.n } }
      for (let i = 0; i < tgt.length; i++) {
        const bot = tgt[i]
        if (!bot.alive) continue
        const t = rayCapsule(o2, dir, [bot.pos.x, 0, bot.pos.z], [bot.pos.x, 1.8, bot.pos.z], 0.34)
        if (t !== -1 && t < bt2) { bt2 = t; b2 = { type: 'bot', bot, t } }
      }
      if (b2) {
        penetrate = true
        bestT = bestT + 0.03 + bt2
        best = b2
      }
    }

    const hitP = [origin[0] + dir[0] * bestT, origin[1] + dir[1] * bestT, origin[2] + dir[2] * bestT]
    tracer([this.muzzleWorld.x, this.muzzleWorld.y, this.muzzleWorld.z], hitP, w.tracer)

    if (!best) return
    if (best.type === 'bot') {
      const head = hitP[1] > best.bot.pos.y + 1.42
      this.stats.hits++
      if (head) this.stats.headshots++
      // 穿透伤害衰减 30%（穿透木箱后）
      const dmg = w.dmg * (head ? w.headMult : 1) * (penetrate ? 0.3 : 1)
      if (best.bot.isTarget) {
        impact(hitP, [-dir[0], -dir[1], -dir[2]], 'metal')
      } else {
        blood(hitP, [-dir[0], -dir[1], -dir[2]], head)
      }
      if (head) audio.hitHead(); else audio.hitBody()
      const killed = best.bot.hit(dmg, head, this, w.id)
      ev.emit('hitmarker', { kill: killed, head })
    } else {
      impact(hitP, best.n, best.b.mat)
      decal(hitP, best.n)
    }
  }

  /* ---------- 帧更新 ---------- */
  update(dt, time) {
    // 后坐力恢复
    this.recoilPitch = damp1(this.recoilPitch, 0, 4.2, dt)
    this.recoilYaw = damp1(this.recoilYaw, 0, 4.2, dt)
    this.bloom = damp1(this.bloom, 0, 8, dt)
    this.kick = damp1(this.kick, 0, 11, dt)
    this.roll = damp1(this.roll, 0, 7, dt)
    this.shake = damp1(this.shake, 0, 9, dt)
    this.muzzleLight.intensity = damp1(this.muzzleLight.intensity, 0, 24, dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.fireCooldown -= dt
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)
    this.inspectT = Math.max(0, this.inspectT - dt / 1.1)
    this.meleeT = Math.min(1, this.meleeT + dt / this.meleeDur)
    // 执行排队的近战攻击
    if (this.meleeT >= 1 && this.pendingMelee >= 0 && this.weaponId === 'knife') {
      const h = this.pendingMelee === 1
      this.pendingMelee = -1
      this.meleeAttack(h)
    }

    // 切枪（三段动画：收枪 → 换入 → 上膛，0.5s）
    if (this.switching) {
      this.switchT += dt / 0.42
      const t = this.switchT
      if (t >= 0.28 && !this._swMid) {
        this._swMid = true
        this.view.view.visible = false
        this.viewModels[this.pendingWeapon].view.visible = true
        this.weaponId = this.pendingWeapon
        this.view = this.viewModels[this.weaponId]
        this.patternIdx = 0
        audio.switchReady(this.weaponId)
      }
      if (t >= 1) {
        this.switching = false
        this._swMid = false
      }
    }

    // 换弹
    if (this.reloading) {
      this.reloadT += dt
      if (this.reloadT >= this.reloadDur) this.finishReload()
    }

    // 视角输入（存活与死亡均可转动视角；死亡时先自动转向击杀者）
    const fovScale = (settings.fov * lerp1(1, this.weapon.adsZoom, this.ads)) / CFG.player.fovH
    const sens = settings.sens * 0.0022 * fovScale
    // 消费式增量：单帧限制 300px（≈36°@103fov），超出部分下帧继续 —— 根治视角跳转
    const { dx: lookDx, dy: lookDy } = input.consumeLook()
    this._lookInput = !!(lookDx || lookDy)
    if (lookDx || lookDy) {
      this.yaw -= lookDx * sens
      this.pitch -= lookDy * sens * (settings.invertY ? -1 : 1)
      this.pitch = clamp(this.pitch, -1.53, 1.53)
      this.swayX = damp1(this.swayX, clamp(lookDx * 0.0007, -0.06, 0.06), 10, dt)
      this.swayY = damp1(this.swayY, clamp(lookDy * 0.0005, -0.05, 0.05), 10, dt)
    }

    // 死亡：镜头缓慢转向击杀者，然后保持自由视角
    if (!this.alive) {
      this.inspectT = 0
      if (this.deathLookAt) {
        const dx = this.deathLookAt.x - this.pos.x
        const dz = this.deathLookAt.z - this.pos.z
        const wantYaw = Math.atan2(dx, dz) + Math.PI
        const dA = angDiff(this.yaw, wantYaw)
        this.yaw += dA * Math.min(1, dt * 3)
        const dist = Math.hypot(dx, dz) || 1
        const wantPitch = Math.atan2(this.deathLookAt.y - (this.pos.y + 1.5), dist) * 0.5
        this.pitch = damp1(this.pitch, wantPitch, 3, dt)
        if (Math.abs(dA) < 0.05) this.deathLookAt = null
      }
      this.ads = damp1(this.ads, 0, 15, dt)
      this.updateViewmodel(dt, 0, time)
      this.applyCamera(dt, time)
      return
    }

    if (!this.enabled) {
      this.updateViewmodel(dt, 0, time)
      this.applyCamera(dt, time)
      return
    }

    /* ---- 移动 ---- */
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw)
    let ix = 0, iz = 0
    if (input.keys['KeyW']) { ix += fx; iz += fz }
    if (input.keys['KeyS']) { ix -= fx; iz -= fz }
    if (input.keys['KeyA']) { ix -= rx; iz -= rz }
    if (input.keys['KeyD']) { ix += rx; iz += rz }
    const il = Math.hypot(ix, iz)
    if (il > 0) { ix /= il; iz /= il }

    this.crouched = input.keys['ControlLeft'] || input.keys['ControlRight']
    this.crouchAmount = damp1(this.crouchAmount, this.crouched ? 1 : 0, 14, dt)

    const shift = input.keys['ShiftLeft'] || input.keys['ShiftRight']
    let targetSpeed = shift ? CFG.player.walkShift : this.weapon.speed
    if (this.crouchAmount > 0.4) targetSpeed *= CFG.player.crouchSpeed
    // 狙击枪开镜大幅减速（Valorant 大狙规则）
    if (this.weapon.isSniper && this.ads > 0.5) {
      targetSpeed *= CFG.sniper.moveAdsSpeedFactor
    }

    // 跳跃：缓冲 + 跳出蹲姿
    if (input.keys['Space']) this.jumpBuffer = 0.12
    if (this.jumpBuffer > 0 && this.onGround) {
      this.vel.y = CFG.player.jumpV
      this.onGround = false
      this.jumpBuffer = 0
      this.crouched = false
      this.crouchAmount = damp1(this.crouchAmount, 0, 20, dt)
    }

    // 地面加速度大 → 急停手感；空中加速弱
    const accel = this.onGround ? CFG.player.accelGround : CFG.player.accelAir
    const decel = this.onGround ? CFG.player.accelGround * 4.5 : CFG.player.accelAir
    this.vel.x = approach(this.vel.x, ix * targetSpeed, (Math.abs(ix * targetSpeed) >= Math.abs(this.vel.x) ? accel : decel) * dt)
    this.vel.z = approach(this.vel.z, iz * targetSpeed, (Math.abs(iz * targetSpeed) >= Math.abs(this.vel.z) ? accel : decel) * dt)

    if (!this.onGround) {
      const hSpeed = Math.hypot(this.vel.x, this.vel.z)
      const maxAir = this.weapon.speed * CFG.player.airSpeedFactor
      if (hSpeed > maxAir) {
        const k = maxAir / hSpeed
        this.vel.x *= k; this.vel.z *= k
      }
    }

    this.vel.y -= CFG.player.gravity * dt
    this.vel.y = Math.max(this.vel.y, -22)

    // 水平碰撞 + 台阶
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    resolveCircle(this.pos, CFG.player.radius, world.groundColliders)
    const feetY0 = this.pos.y
    for (const s of world.climbables) {
      if (circleHits(this.pos.x, this.pos.z, CFG.player.radius, s)) {
        if (s.top > feetY0 + 0.001 && s.top - feetY0 <= CFG.player.stepH + 0.001) {
          this.pos.y = s.top
          this.onGround = true
        }
      }
    }

    // 垂直：仅在下落时落地（修复跳跃被地面容差吞掉的问题）
    this.pos.y += this.vel.y * dt
    const gy = world.groundYUnder(this.pos.x, this.pos.z, this.pos.y, this.vel.y)
    if (gy !== null && this.vel.y <= 0 && this.pos.y - gy <= 0.12) {
      if (this.vel.y < -5.5) {
        audio.landThud()
        landDust(this.pos)
      }
      this.vel.y = 0
      this.pos.y = gy
      this.onGround = true
    } else {
      this.onGround = false
    }
    this.eyeH = lerp1(CFG.player.eyeStand, CFG.player.eyeCrouch, this.crouchAmount)

    // 脚步
    const hSpeed2 = Math.hypot(this.vel.x, this.vel.z)
    if (this.onGround && hSpeed2 > 0.6) {
      this.footT -= dt
      if (this.footT <= 0) {
        const ratio = hSpeed2 / this.weapon.speed
        this.footT = 0.62 / Math.max(0.4, ratio)
        const vol = (shift ? 0.025 : 0.085) * ratio * (this.crouched ? 0.4 : 1)
        audio.footstep(vol)
      }
    }

    // 换弹 / 切枪 / 射击输入
    // F 检视武器（Valorant 风格）
    if (input.down['KeyF'] && !this.reloading && !this.switching && this.ads < 0.5 && this.inspectT <= 0) {
      this.inspectT = 1
    }
    if (input.keys['KeyR']) this.startReload()
    if (input.down['Digit1']) this.switchTo('m4')
    if (input.down['Digit2']) this.switchTo('deagle')
    if (input.down['Digit3']) this.switchTo('knife')
    if (input.down['Digit4']) this.switchTo('op')
    if (input.wheel < 0) this.switchTo(prevWeapon(this.weaponId))
    if (input.wheel > 0) this.switchTo(nextWeapon(this.weaponId))
    if (input.down['KeyQ']) this.switchTo(nextWeapon(this.weaponId))

    const wAuto = this.weapon.auto
    if (input.mouse.left && (wAuto || input.leftEdge || this.weaponId === 'knife')) {
      if (this.weaponId === 'knife') this.meleeAttack(false)
      else this.fire()
    }
    // 右键重击：按住持续重击（Valorant 刀手感）；edge 修复后按下即触发
    if (input.mouse.right && this.weaponId === 'knife') this.meleeAttack(true)

    // ADS
    const wantAds = input.mouse.right && !this.reloading && !this.switching && this.weapon.adsZoom
    this.ads = damp1(this.ads, wantAds ? 1 : 0, 15, dt)

    // 移动与手部动画量（快速转动时抑制头部晃动 → 更平滑）
    const lookSpeed = Math.abs(input.lookDx) / 400
    this.bobAmt = damp1(this.bobAmt, (hSpeed2 / this.weapon.speed) * (1 - this.ads * 0.7) * (1 - Math.min(1, lookSpeed)), 8, dt)
    this.bobT += dt * CFG.player.headBobFreq * this.bobAmt

    this.applyCamera(dt, time)
    this.updateViewmodel(dt, hSpeed2, time)

    // 影子替身
    this.shadowDummy.position.set(this.pos.x, 0.78, this.pos.z)
  }

  applyCamera(dt, time) {
    // Valorant/CS 风格：鼠标增量直接映射到朝向，不叠加帧间平滑。
    // 之前这里的 damp 跟随会引入约 1 帧延迟与"回弹"手感，转动发飘。
    // 直接同步可保证准星、弹道与屏幕中心严格一致，转动零延迟。
    this.lookYaw = this.yaw
    this.lookPitch = this.pitch

    const bobY = Math.sin(this.bobT * Math.PI * 2) * CFG.player.headBobAmp * this.bobAmt * 0.9
    const bobX = Math.cos(this.bobT * Math.PI * 4) * CFG.player.headBobAmp * 0.16 * this.bobAmt
    // 转动视角时抑制呼吸晃动（消除画面割裂感）
    const breath = Math.sin(time * 1.3) * 0.002 * (1 - Math.min(1, Math.abs(input.lookDx) / 400))
    camera.position.set(
      this.pos.x + bobX,
      this.pos.y + this.eyeH + bobY + breath,
      this.pos.z
    )
    camera.rotation.y = this.lookYaw + this.recoilYaw * 0.012
    camera.rotation.x = this.lookPitch + this.recoilPitch * 0.012
    camera.rotation.z = Math.sin(time * 11) * 0.0022 * this.shake + this.roll * 0.06

    // FOV（ADS 缩放）—— 无开镜倍率的武器（刀）恒为 1，杜绝 FOV 塌缩黑屏
    const zoom = this.weapon.adsZoom || 1
    const fovV = (2 * Math.atan(Math.tan((settings.fov * Math.PI / 180) / 2) / camera.aspect) * 180) / Math.PI
    camera.fov = fovV * lerp1(1, zoom, this.ads)
    camera.updateProjectionMatrix()
  }

  updateViewmodel(dt, hSpeed, time) {
    const v = this.view
    const p = v.pose
    const t = this.ads
    const isKnife = this.weaponId === 'knife'

    // 狙击枪开镜时隐藏武器模型（防止瞄准镜模型挡视野）
    if (this.weaponId === 'op') {
      if (t > 0.85) v.view.visible = false
      else if (t < 0.7 && !v.view.visible) v.view.visible = true
    }
    // M4 开镜：隐藏提把/觇孔（防止机匣顶部遮挡屏幕中心准星），准星视线保持干净
    if (this.weaponId === 'm4' && v.hide) {
      const showParts = t < 0.7
      for (const m of v.hide) if (m.visible !== showParts) m.visible = showParts
    }

    // 位置：hip → ads 插值 + 晃动 + 后坐 + 换弹 + 切枪 + 近战
    let x = lerp1(p.hip.pos[0], p.ads.pos[0], t)
    let y = lerp1(p.hip.pos[1], p.ads.pos[1], t) - this.kick * 0.05
    let z = lerp1(p.hip.pos[2], p.ads.pos[2], t) + this.kick * 0.09

    const swayX = Math.sin(time * 1.7) * 0.0015 + this.swayX
    const swayY = Math.sin(time * 2.1) * 0.0012 + this.swayY
    x += swayX * (1 - t * 0.6)
    y += Math.sin(this.bobT * Math.PI * 2) * CFG.player.headBobAmp * this.bobAmt * 0.5
    y += swayY * (1 - t * 0.6)

    let rotX = lerp1(p.hip.rot[0], p.ads.rot[0], t) + this.kick * 0.45
    let rotY = lerp1(p.hip.rot[1], p.ads.rot[1], t) + this.swayX * 1.6
    let rotZ = lerp1(p.hip.rot[2], p.ads.rot[2], t) + this.roll

    // 换弹：下压
    if (this.reloading) {
      const k = Math.min(1, (this.reloadT / this.reloadDur) * 1.2)
      y -= Math.sin(Math.PI * Math.min(k, 1)) * 0.09
      z += Math.sin(Math.PI * Math.min(k, 1)) * 0.04
      rotX += 0.35
    }

    // 切枪动画：收枪（旧枪下落）→ 换入（新枪从下方升起）→ 上膛抖动
    if (this.switching) {
      const st = this.switchT
      if (st < 0.3) {
        // 阶段一：收枪
        const k = Math.sin((st / 0.3) * Math.PI)
        y -= k * 0.16
        rotX += k * 0.7
        z -= k * 0.05
      } else if (st < 0.42) {
        // 阶段二：新枪从下方进入
        const k = (st - 0.3) / 0.12
        y = -0.42 + k * 0.24
        rotX = 1.1 - k * 0.7
      } else {
        // 阶段三：归位 + 上膛
        const k = (st - 0.42) / 0.58
        y = lerp1(-0.18, p.hip.pos[1] * 0.3 + p.ads.pos[1] * 0.7, Math.min(1, k * 1.4))
        rotX = lerp1(0.5, 0, Math.min(1, k * 1.2))
        if (k > 0.62 && k < 0.78) {
          const rack = Math.sin(((k - 0.62) / 0.16) * Math.PI)
          y -= rack * 0.05
          z += rack * 0.06
          rotX += rack * 0.3
        }
      }
    }

    // 近战动画（挥砍：蓄力 → 挥出 → 回位，快出快回 + 大位移）
    if (this.meleeT < 1 && isKnife) {
      const k = this.meleeT
      const wind = Math.min(1, k / 0.16)                          // 蓄力（前 16%）
      const strike = Math.min(1, Math.max(0, (k - 0.16) / 0.34))  // 挥出（16%–50%）
      const rec = Math.min(1, Math.max(0, (k - 0.5) / 0.5))       // 回位（50%–100%）
      const hold = 1 - rec
      if (this.meleeHeavy) {
        // 重击：举刀蓄力 → 右上→左下大力劈砍（约 105°）
        rotX += wind * -0.85
        y += wind * 0.05
        rotX += strike * 2.3 * hold
        rotY += strike * 0.5 * hold
        x -= Math.sin(strike * Math.PI) * 0.16 * hold
        y -= Math.sin(strike * Math.PI) * 0.18 * hold
        z += Math.sin(strike * Math.PI) * 0.14 * hold
      } else {
        // 轻击：后拉蓄力 → 右上→左下快速斜削（幅度克制，画面内 1/3 横扫）
        rotY -= wind * 0.3
        rotX += wind * 0.15
        x += wind * 0.03
        rotY += strike * 1.1 * hold
        rotX -= strike * 0.5 * hold
        x -= Math.sin(strike * Math.PI) * 0.09 * hold
        y += Math.sin(strike * Math.PI) * 0.05 * hold
        z += Math.sin(strike * Math.PI) * 0.08 * hold
      }
    } else if (isKnife) {
      // 持刀待机：手腕摆动 + 呼吸起伏
      rotY += Math.sin(time * 2.2) * 0.02
      rotZ += Math.sin(time * 1.7) * 0.012
      y += Math.sin(time * 1.3) * 0.004
    }

    // 检视动画：武器旋转展示（F 键，Valorant 风格）
    if (this.inspectT > 0) {
      const k = 1 - this.inspectT
      const swing = Math.sin(k * Math.PI)
      x += swing * 0.1
      y -= swing * 0.05
      rotY += swing * Math.PI * 1.6
      rotX += swing * 0.8
      rotZ += swing * 0.4
    }

    // 死亡：武器收下
    if (!this.alive) {
      y -= 0.34
      rotX += 0.9
    }

    v.view.position.set(x, y, z)
    v.view.rotation.set(rotX, rotY, rotZ)
  }
}

/* ---------- 数学小工具 ---------- */
const lerp1 = (a, b, t) => a + (b - a) * t
const damp1 = (a, b, l, dt) => lerp1(a, b, 1 - Math.exp(-l * dt))

const WEAPON_CYCLE = ['m4', 'deagle', 'knife', 'op']
function nextWeapon(id) {
  return WEAPON_CYCLE[(WEAPON_CYCLE.indexOf(id) + 1) % WEAPON_CYCLE.length]
}

function prevWeapon(id) {
  return WEAPON_CYCLE[(WEAPON_CYCLE.indexOf(id) - 1 + WEAPON_CYCLE.length) % WEAPON_CYCLE.length]
}

function approach(cur, target, maxDelta) {
  const d = target - cur
  if (d > maxDelta) return cur + maxDelta
  if (d < -maxDelta) return cur - maxDelta
  return target
}

function angDiff(a, b) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/* 相机方向（世界系） */
export function cameraWorldForward() {
  const v = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  return [v.x, v.y, v.z]
}
export function cameraWorldRight() {
  const v = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  return [v.x, v.y, v.z]
}
export function cameraWorldUp() {
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
  return [v.x, v.y, v.z]
}
