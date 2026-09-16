/* 直接调用 bot.fire() 验证命中链路 */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 4500))

const result = await page.evaluate(() => {
  const g = window.__nexus.game
  const p = g.player
  const bot = g.bots.list[0]
  // 摆好位置：玩家站在 (10, 10)，bot 在 (10, 4) 面向玩家（z 正方向）
  p.pos.set(10, 0, 10)
  p.yaw = Math.PI          // 面向 +z
  bot.pos.set(10, 0, 4)
  bot.respawnT = 0
  p.invuln = 0
  p.hp = 100
  p.armor = 50

  // bot 面向玩家（玩家在 bot 的 +z 方向 6m 处）
  bot.aimYaw = 0
  bot.aimPitch = Math.atan2(1.2 - 1.6, 6) // 瞄准胸部 y=1.2，微下倾
  bot.fireCooldown = 0

  const before = { hp: p.hp, armor: p.armor }
  let shots = 0
  for (let i = 0; i < 5; i++) { bot.fireCd = 0; bot.fire(); shots++ }

  // 内联复刻 fire() 的射线逻辑，找出问题
  const spread = 0.004 + (1 - bot.skill) * 0.012 + (bot.crouching ? 0 : 0.006) + (bot.isMoving ? 0.009 : 0) + bot.pitchBias
  const fwd = [Math.sin(bot.aimYaw) * Math.cos(bot.aimPitch), Math.sin(bot.aimPitch), Math.cos(bot.aimYaw) * Math.cos(bot.aimPitch)]
  const dir = { x: fwd[0], y: fwd[1], z: fwd[2] }
  const nl = Math.hypot(dir.x, dir.y, dir.z) || 1
  dir.x /= nl; dir.y /= nl; dir.z /= nl
  const origin = [bot.pos.x, bot.pos.y + 1.6, bot.pos.z]
  let bestT = 48, best = null
  const world = window.__nexus.world
  const rayBox = (o, d, b) => {
    let tmin = 0, tmax = Infinity, axis = -1
    for (let i = 0; i < 3; i++) {
      const oo = o[i], dd = d[i]
      if (Math.abs(dd) < 1e-9) { if (oo < b.min[i] || oo > b.max[i]) return -1; continue }
      let t1 = (b.min[i] - oo) / dd, t2 = (b.max[i] - oo) / dd
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
      if (t1 > tmin) { tmin = t1; axis = i }
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return -1
    }
    if (tmax < 0) return -1
    const n = [0, 0, 0]
    if (axis >= 0) n[axis] = dd > 0 ? -1 : 1
    return { t: Math.max(0, tmin), n }
  }
  for (const b of world.rayBoxes) {
    const r = rayBox(origin, dir, b)
    if (r !== -1 && r.t < bestT) { bestT = r.t; best = { type: 'world', b, n: r.n } }
  }
  // 玩家胶囊
  const dx2 = 0, dz2 = 0 // 玩家与 bot 同一 x/z
  let t = -1
  // 简化胶囊检测：直接距离
  const closest = (() => {
    // 玩家胶囊从 (10,0,10) 到 (10,1.8,10)
    const seg = [10, 0, 10], segB = [10, 1.8, 10]
    const ab = [0, 1.8, 0]
    const w = [seg[0] - origin[0], seg[1] - origin[1], seg[2] - origin[2]]
    const wd = w[0] * dir.x + w[1] * dir.y + w[2] * dir.z
    const abd = 1.8 * dir.y
    const wab = w[1] * 1.8
    const denom = 1.8 * 1.8 - abd * abd
    const s = Math.max(0, Math.min(1, denom < 1e-9 ? 0 : (wd * abd - wab) / denom))
    const tt = wd + s * abd
    const px = seg[0] + s * 0 - origin[0] - tt * dir.x
    const py = seg[1] + s * 1.8 - origin[1] - tt * dir.y
    const pz = seg[2] + s * 0 - origin[2] - tt * dir.z
    return { d2: px * px + py * py + pz * pz, tt }
  })()

  return {
    before, after: { hp: p.hp, armor: p.armor }, shots, botMag: bot.mag,
    skill: bot.skill, spread, aimPitch: bot.aimPitch, aimYaw: bot.aimYaw,
    fwd, dir, closest,
    worldHit: best ? bestT.toFixed(2) + ' ' + best.b.mat + ' box=' + JSON.stringify([best.b.min, best.b.max]) : null,
  }
})
console.log(JSON.stringify(result, null, 1))
console.log('ERRORS:', errors)
await browser.close()
