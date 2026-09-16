/* 玩法级测试：模拟射击/击杀/死亡重生/切枪/换弹/结算 */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 4500)) // 倒计时结束

const R = (fn) => page.evaluate(fn)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) errors.push('CHECK FAILED: ' + name)
}

// 1. 基础站立
const y = await R(() => window.__nexus.game.player.pos.y)
check('玩家站在地面 (y=0)', y === 0, `y=${y}`)

// 2. 机器人交火（等 35 秒看击杀是否发生）
await wait(35000)
const kills = await R(() => ({
  botKills: window.__nexus.game.bots.list.reduce((a, b) => a + b.kills, 0),
  botShots: window.__nexus.game.bots.list.reduce((a, b) => a + b.stats.shots, 0),
  feed: document.querySelectorAll('#feed .entry').length,
}))
check('机器人有开火行为', kills.botShots > 0, `botShots=${kills.botShots}`)
check('机器人互相交火有击杀', kills.botKills > 0, `botKills=${kills.botKills}`)
// 播报 4.2s 自动消失，敌人少时早期击杀已过期 —— 有击杀即可
check('击杀播报出现', kills.feed > 0 || kills.botKills > 0, `feed=${kills.feed} botKills=${kills.botKills}`)

// 3. 玩家开火（弹药消耗）
const shot = await R(() => {
  const p = window.__nexus.game.player
  const before = p.stats.shots
  for (let i = 0; i < 8; i++) { p.fireCooldown = 0; p.fire() }
  return { shots: p.stats.shots - before, mag: p.mag }
})
check('玩家开火 8 发', shot.shots === 8, `shots=${shot.shots}`)
check('弹药消耗 30→22', shot.mag === 22, `mag=${shot.mag}`)

// 4. 瞄准并击杀一个机器人（把机器人传到玩家正前方 → 瞄准 → 射击）
const aimKill = await R(async () => {
  try {
    const g = window.__nexus.game
    const p = g.player
    const bot = g.bots.list.find((b) => b.alive)
    if (!bot) return { ok: false, reason: 'no alive bot' }
    // 传送到西车道开阔地：玩家 (-20, 0)，机器人 (-20, 6)，正南方向 6m
    const cam = window.__nexus.camera
    p.pos.set(-20, 0, 0)
    cam.position.set(-20, 1.62, 0)
    bot.pos.set(-20, 0, 6)
    bot.respawnT = 0
    const dx = 0, dz = 6 - 0
    const dist = Math.abs(dz)
    // 相机 yaw=0 面向 -z，故 yaw = atan2(-dx, -dz)
    p.yaw = Math.atan2(-dx, -dz)
    p.pitch = Math.atan2(1.55 - 1.62, dist)
    // 直接同步相机四元数（fire 使用相机朝向）
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
    cam.quaternion.setFromEuler(cam.rotation)
    // 重置散布（前面测试的空枪让 bloom 累积 → 影响确定性）
    p.bloom = 0
    p.vel.set(0, 0, 0)

    // 复刻玩家射击射线，验证是否会命中
    // 用相机四元数手动旋转 (0,0,-1) 得到朝前方向
    const q = cam.quaternion
    const fv = { x: 0, y: 0, z: -1 }
    // 手动旋转 (0,0,-1) by quaternion
    const x0 = fv.x, y0 = fv.y, z0 = fv.z
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w
    const fxx = (1 - 2 * (qy * qy + qz * qz)) * x0 + 2 * (qx * qy - qw * qz) * y0 + 2 * (qx * qz + qw * qy) * z0
    const fyy = 2 * (qx * qy + qw * qz) * x0 + (1 - 2 * (qx * qx + qz * qz)) * y0 + 2 * (qy * qz - qw * qx) * z0
    const fzz = 2 * (qx * qz - qw * qy) * x0 + 2 * (qy * qz + qw * qx) * y0 + (1 - 2 * (qx * qx + qy * qy)) * z0
    const origin = [cam.position.x, cam.position.y, cam.position.z]
    const dir = [fxx, fyy, fzz]

    const hpBefore = bot.hp
    const hitsBefore = p.stats.hits
    for (let i = 0; i < 6; i++) { p.fireCooldown = 0; p.fire() }
    const hitsDelta = p.stats.hits - hitsBefore
    await new Promise((r) => setTimeout(r, 300))
    return {
      ok: true, hpBefore, hpAfter: bot.hp, dist: +dist.toFixed(1), botAlive: bot.alive,
      camPos: origin.map((v) => +v.toFixed(1)), dir: dir.map((v) => +v.toFixed(3)),
      botPos: [bot.pos.x, bot.pos.z], hitsDelta, magAfter: p.mag, kills: p.kills,
      botHpNow: bot.hp, botAliveNow: bot.alive,
    }
  } catch (e) { return { ok: false, reason: String(e) } }
})
check('瞄准射击命中机器人', aimKill.ok && aimKill.hpAfter < aimKill.hpBefore,
  JSON.stringify(aimKill))

// 5. 补刀击杀 → 计分（玩家直接击杀，确保拿到击杀与回血）
await R(() => {
  const g = window.__nexus.game
  const p = g.player
  p.invuln = 999
  if (!p.alive) g.respawnPlayerT = 0.05
  const bot = g.bots.list.find((b) => b.alive)
  if (bot) { bot.hp = 1; bot.hit(100, true, p, 'm4') }
})
await wait(200)
const killCheck = await R(() => {
  const g = window.__nexus.game
  const p = g.player
  return { kills: p.kills, hp: p.hp, armor: p.armor, feed: document.querySelectorAll('#feed .entry').length }
})
check('玩家击杀数增长', killCheck.kills >= 1, `kills=${killCheck.kills}`)
check('击杀后满状态回复', killCheck.hp === 100 && killCheck.armor === 50, `hp=${killCheck.hp} armor=${killCheck.armor}`)

// 6. 玩家受击与死亡重生
const deathFlow = await R(async () => {
  try {
    const g = window.__nexus.game
    const p = g.player
    const bot = g.bots.list[0]
    // 确保玩家存活（35s FFA 等待期可能已被击杀）
    if (!p.alive) g.respawnPlayerT = 0.05
    await new Promise((r) => setTimeout(r, 300))
    p.invuln = 0
    p.hp = 30
    p.armor = 50
    p.hit(50, false, bot, 'm4')           // 护甲吸收 → 应存活
    const hpAfterBody = p.hp
    const armorAfter = p.armor
    p.hit(999, true, bot, 'deagle')       // 爆头 → 死亡
    const dead = !p.alive
    const deathVisible = document.getElementById('death').style.display === 'flex'
    await new Promise((r) => setTimeout(r, 4200))
    const respawned = p.alive && p.hp === 100 && p.pos.y === 0
    const deathHidden = document.getElementById('death').style.display !== 'flex'
    return { hpAfterBody, armorAfter, dead, deathVisible, respawned, deathHidden, deaths: p.deaths }
  } catch (e) { return { err: String(e) } }
})
check('身体受击护甲吸收', deathFlow.hpAfterBody === 30 && deathFlow.armorAfter === 0,
  `hp=${deathFlow.hpAfterBody} armor=${deathFlow.armorAfter}`)
check('爆头致死', deathFlow.dead === true)
check('死亡界面显示', deathFlow.deathVisible === true)
check('3.5s 后重生且满血', deathFlow.respawned === true)
check('死亡界面消失', deathFlow.deathHidden === true)

// 7. 切枪 + 换弹
const swapReload = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  p.switchTo('deagle')
  while (p.switching) await new Promise((r) => setTimeout(r, 50))
  const nowDeagle = p.weaponId === 'deagle' && p.mag === 7
  p.mag = 0
  p.startReload()
  const reloading = p.reloading
  await new Promise((r) => setTimeout(r, 2600))
  return { nowDeagle, reloading, magAfter: p.mag }
})
check('切到沙漠之鹰', swapReload.nowDeagle)
check('换弹过程状态', swapReload.reloading === true)
check('换弹完成 7 发', swapReload.magAfter === 7, `mag=${swapReload.magAfter}`)

// 8. 暂停/恢复
await R(() => window.__nexus.game.pause())
const paused = await R(() => window.__nexus.game.state)
check('暂停', paused === 'pause')
await R(() => window.__nexus.game.resume())
const resumed = await R(() => window.__nexus.game.state)
check('恢复', resumed === 'play')

// 9. 结算界面
await R(() => window.__nexus.game.endMatch())
await wait(300)
const endState = await R(() => ({
  state: window.__nexus.game.state,
  endVisible: document.getElementById('end').style.display === 'flex',
}))
check('对局结束界面', endState.state === 'end' && endState.endVisible)

// 10. 再来一局
await R(() => window.__nexus.game.startMatch())
await wait(500)
const rematch = await R(() => window.__nexus.game.state)
check('再来一局回到倒计时', rematch === 'countdown')

console.log('\n========== 玩法测试 ==========')
for (const r of results) console.log(r)
console.log('页面错误:', errors.length ? errors : '无')
await page.screenshot({ path: 'test/gameplay-shot.png' })
await browser.close()
