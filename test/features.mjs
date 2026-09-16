/* 新功能测试：跳跃 / 机器人重生 / 匕首近战 / 切枪动画 / 模型可见性 */
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
await new Promise((r) => setTimeout(r, 4500))

const R = (fn) => page.evaluate(fn)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) errors.push('CHECK FAILED: ' + name)
}

// 1. 跳跃功能（无敌防干扰）
const jump = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  // 确保玩家存活（FFA 中可能已阵亡，尸体不参与物理）
  if (!p.alive) g.respawnPlayerT = 0.05
  while (!p.alive) await new Promise((r) => setTimeout(r, 50))
  p.invuln = 999
  p.pos.set(-26.5, 0, -19)
  p.vel.set(0, 0, 0)
  // 每帧补充跳跃缓冲直到落地（传送后可能在空中残留，保证起跳）
  const juice = setInterval(() => { if (p.onGround) p.jumpBuffer = 0.12 }, 16)
  let maxY = 0
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      maxY = Math.max(maxY, p.pos.y)
      if (p.onGround && maxY > 0.5) {
        clearInterval(iv)
        clearInterval(juice)   // 停止补充缓冲，防止落地后再次起跳
        resolve()
      }
    }, 16)
    setTimeout(() => { clearInterval(iv); clearInterval(juice); resolve() }, 2000)
  })
  // 等待玩家真正落地稳定（clearInterval 竞态可能导致二次起跳）
  await new Promise((resolve) => {
    const iv2 = setInterval(() => {
      if (p.onGround && p.pos.y < 0.01) { clearInterval(iv2); resolve() }
    }, 16)
    setTimeout(() => { clearInterval(iv2); resolve() }, 2000)
  })
  return { maxY: +maxY.toFixed(2), grounded: p.onGround, y: +p.pos.y.toFixed(2) }
})
check('跳跃离地高度', jump.maxY > 0.8, `maxY=${jump.maxY}`)
check('跳跃后落地', jump.grounded && jump.y === 0, `y=${jump.y}`)

// 2. 机器人模型可见性（不再埋地）
const botVisual = await R(() => {
  const b = window.__nexus.bots.list.find((x) => x.alive)
  if (!b) return null
  return {
    groupY: +b.group.position.y.toFixed(2),
    headWorldY: +(b.group.position.y + 1.62).toFixed(2),
    visible: b.group.visible,
    bodyMeshCount: b.group.children.length,
  }
})
check('机器人模型在世界坐标(头在1.6m上方)', botVisual && botVisual.headWorldY > 1.5, JSON.stringify(botVisual))

// 3. 玩家击杀机器人 → 机器人重生（此前永不重生的 bug）
const respawnTest = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  const bots = g.bots
  // 打点 respawnBot 调用次数（重生后可能立即被 FFA 战斗波及）
  window.__respawnCount = 0
  const orig = bots.respawnBot.bind(bots)
  bots.respawnBot = (b) => { window.__respawnCount++; return orig(b) }
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { err: 'no bot' }
  p.invuln = 0
  bot.respawnT = 0
  bot.hp = 1
  bot.hit(100, true, p, 'm4')
  const dead = !bot.alive
  const respawnScheduled = bot.respawnT > 0
  await new Promise((r) => setTimeout(r, 3500))
  return { dead, respawnScheduled, respawnCalls: window.__respawnCount }
})
check('玩家击杀机器人', respawnTest.dead)
check('重生已排程', respawnTest.respawnScheduled)
check('3.5s 内重生发生', respawnTest.respawnCalls >= 1, `respawnCalls=${respawnTest.respawnCalls}`)

// 4. 匕首近战（同步确定性：冷却结束后传送+立即攻击，同帧结算）
const melee = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  // 切到刀
  p.switchTo('knife')
  while (p.switching) await new Promise((r) => setTimeout(r, 50))
  const hasKnife = p.weaponId === 'knife'
  // 等冷却结束
  while (p.meleeT < 1) await new Promise((r) => setTimeout(r, 30))
  // 选目标并隔离：其他机器人全部移出地图（FFA 混战中会挡近战射线）
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { hasKnife, err: 'no bot' }
  for (const b of g.bots.list) {
    if (b !== bot) { b.pos.set(0, 0, -40); b.respawnT = 0 }
  }
  // 传送到机器人面前（同帧传送+攻击，bot 无机会移动）
  const cam = window.__nexus.camera
  p.pos.set(bot.pos.x, 0, bot.pos.z + 1.5)
  cam.position.set(bot.pos.x, 1.62, bot.pos.z + 1.5)
  p.yaw = 0                      // yaw=0 面向 -z，bot 在 -z 方向 1.5m
  cam.rotation.set(0, 0, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)
  const hpBefore = bot.hp
  p.meleeAttack(false)
  const hpAfter = bot.hp
  return { hasKnife, hpBefore, hpAfter, dmg: hpBefore - hpAfter, meleeT: p.meleeT }
})
check('切到匕首', melee.hasKnife)
check('轻击造成伤害', melee.dmg > 0, `dmg=${melee.dmg}`)

// 5. 重击（同步确定性）
const heavy = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  // 先选目标并隔离（防止等待冷却期间目标被 FFA 打死）
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { err: 'no bot' }
  for (const b of g.bots.list) {
    if (b !== bot) { b.pos.set(0, 0, -40); b.respawnT = 0 }
  }
  while (p.meleeT < 1) await new Promise((r) => setTimeout(r, 30))
  const cam = window.__nexus.camera
  p.pos.set(bot.pos.x, 0, bot.pos.z + 1.5)
  cam.position.set(bot.pos.x, 1.62, bot.pos.z + 1.5)
  p.yaw = 0
  cam.rotation.set(0, 0, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)
  // 回满目标血量，重击应打掉 50 血（护甲吸收 50）
  bot.hp = 100
  bot.armor = 50
  bot.respawnT = 0
  const hpBefore = bot.hp
  p.meleeAttack(true)
  return { dmg: hpBefore - bot.hp, dead: !bot.alive, hpAfter: bot.hp }
})
check('重击造成重大伤害(可一刀击杀)', heavy.dmg >= 50, `dmg=${heavy.dmg} hpAfter=${heavy.hpAfter}`)

// 6. 切枪动画三段完成
const switchAnim = await R(async () => {
  const p = window.__nexus.game.player
  while (p.meleeT < 1) await new Promise((r) => setTimeout(r, 50))
  p.switchTo('m4')
  await new Promise((r) => setTimeout(r, 800))
  return { weapon: p.weaponId, switching: p.switching, mag: p.mag }
})
check('切回 M4 动画完成', switchAnim.weapon === 'm4' && !switchAnim.switching && switchAnim.mag === 30, `mag=${switchAnim.mag}`)

// 7. 相机已挂载武器模型（场景图包含相机子物体）
const viewmodel = await R(() => {
  const { scene, camera } = window.__nexus
  const inScene = scene.children.includes(camera)
  const vms = camera.children.filter((c) => c.isGroup && c.children.length > 0).length
  return { inScene, viewmodelGroups: vms }
})
check('相机已加入场景图', viewmodel.inScene)
check('武器模型挂载在相机上', viewmodel.viewmodelGroups >= 3, `groups=${viewmodel.viewmodelGroups}`)

// 8. 机器人数量设置生效
const botCount = await R(async () => {
  const g = window.__nexus.game
  window.__nexus.settings.bots = 5
  g.startMatch()
  await new Promise((r) => setTimeout(r, 300))
  return { count: g.bots.list.length, state: g.state }
})
check('敌人数量设置生效(5)', botCount.count === 5, `count=${botCount.count}`)
// 9. 换弹中开火：打断换弹直接射击（Valorant 规则）
const reloadBreak = await R(async () => {
  const p = window.__nexus.game.player
  p.switchTo('m4')
  while (p.switching) await new Promise((r) => setTimeout(r, 60))
  p.mag = 10
  p.startReload()
  const reloadingBefore = p.reloading
  p.fireCooldown = 0
  p.fire()
  await new Promise((r) => setTimeout(r, 120))
  return { reloadingBefore, reloadingAfter: p.reloading, magAfter: p.mag, shots: p.stats.shots }
})
check('换弹中开火打断换弹并射击', reloadBreak.reloadingBefore && !reloadBreak.reloadingAfter && reloadBreak.magAfter === 9, JSON.stringify(reloadBreak))

// 10. 切枪弹药独立保留（切走再切回不免费满弹）
const magPersist = await R(async () => {
  const p = window.__nexus.game.player
  p.switchTo('m4')
  while (p.switching) await new Promise((r) => setTimeout(r, 60))
  p.mag = 7
  p.switchTo('deagle')
  while (p.switching) await new Promise((r) => setTimeout(r, 60))
  const deagleMag = p.mag
  p.switchTo('m4')
  while (p.switching) await new Promise((r) => setTimeout(r, 60))
  return { deagleMag, m4MagAfter: p.mag }
})
check('切枪弹药独立保留', magPersist.deagleMag === 7 && magPersist.m4MagAfter === 7, JSON.stringify(magPersist))

// 12. 导航可达天桥（AI 可上高台）
const bridgeNav = await R(() => {
  const w = window.__nexus.world
  return {
    up: w.findPath(16.75, -13.5, 16.5, -8).length > 0,
    down: w.findPath(16.5, -8, 0, 0).length > 0,
    bridgeToGround: w.findPath(14.5, -5, 24, 9).length > 0,
  }
})
check('导航可达天桥(上/下/回地面)', bridgeNav.up && bridgeNav.down && bridgeNav.bridgeToGround, JSON.stringify(bridgeNav))

// 11. F 键检视动画触发并播放
const inspect = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  // 确保处于 play 状态且玩家存活（前序测试可能停留在倒计时/死亡）
  if (g.state !== 'play') {
    g.startMatch()
    while (g.state !== 'play') await new Promise((r) => setTimeout(r, 100))
  }
  if (!p.alive) g.respawnPlayerT = 0.05
  while (!p.alive) await new Promise((r) => setTimeout(r, 50))
  p.invuln = 999
  p.ads = 0
  p.switchTo('m4')
  while (p.switching) await new Promise((r) => setTimeout(r, 60))
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }))
  await new Promise((r) => setTimeout(r, 120))
  const started = p.inspectT > 0
  await new Promise((r) => setTimeout(r, 400))
  return { started, mid: p.inspectT > 0 && p.inspectT < 1 }
})
check('F 键检视动画触发并播放', inspect.started && inspect.mid, JSON.stringify(inspect))

// 恢复
await R(() => { window.__nexus.settings.bots = 7 })

console.log('\n========== 新功能测试 ==========')
for (const r of results) console.log(r)
console.log('页面错误:', errors.length ? errors : '无')
await browser.close()
