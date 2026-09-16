/* 训练靶场回归：进入 / 靶子 / 命中 / 无限弹药 / 退出恢复 */
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
await new Promise((r) => setTimeout(r, 2500))
await page.click('#btn-training')
await new Promise((r) => setTimeout(r, 1500))

const R = (fn) => page.evaluate(fn)
const results = []
const check = (name, ok, extra = '') => {
  results.push(`${ok ? '✅' : '❌'} ${name}${extra ? '  — ' + extra : ''}`)
  if (!ok) errors.push('CHECK FAILED: ' + name)
}

const info = await R(() => {
  const nx = window.__nexus
  const g = nx.game
  const p = nx.player
  const out = { state: g.state, targets: g.training ? g.training.targets.length : -1, spawn: g.training ? g.training.spawn : null }
  out.trainStatsVisible = document.getElementById('train-stats').style.display !== 'none'
  const t = g.training.targets[0]
  const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z
  const dist = Math.hypot(dx, dz)
  p.yaw = Math.atan2(-dx, -dz)
  p.pitch = Math.atan2(1.2 - 1.62, dist)
  p.update(0.016, performance.now() / 1000)
  out.magBefore = p.mag
  out.shotsBefore = p.stats.shots
  p.fire()
  out.magAfter = p.mag
  out.hits = p.stats.hits
  out.shotsAfter = p.stats.shots
  for (let i = 0; i < 40; i++) { p.fireCooldown = 0; p.fire() }
  out.magAfter40 = p.mag
  out.botVisible = g.bots.list.some((b) => b.group.visible)
  g.toMenu()
  out.stateAfterExit = g.state
  out.botVisibleAfterExit = g.bots.list.every((b) => b.group.visible)
  out.playerTargetsRestored = p.targets === g.bots.list
  out.trainingFlag = p.training
  out.trainingCleared = g.training === null
  return out
})

check('进入训练靶场', info.state === 'train', `state=${info.state}`)
check('靶子数量 ≥ 5', info.targets >= 5, `count=${info.targets}`)
check('训练 HUD 显示', info.trainStatsVisible)
check('射击命中靶子', info.hits > 0 && info.shotsAfter > info.shotsBefore, JSON.stringify({ hits: info.hits }))
check('无限弹药（40 连发不空仓）', info.magAfter40 > 0, `mag=${info.magAfter40}`)
check('机器人已隐藏', !info.botVisible)
check('退出后恢复主菜单', info.stateAfterExit === 'menu')
check('退出后机器人可见', info.botVisibleAfterExit)
check('退出后目标列表还原', info.playerTargetsRestored)
check('退出后训练标志清除', !info.trainingFlag && info.trainingCleared)

console.log(results.join('\n'))
if (errors.length) console.log('页面错误:', JSON.stringify(errors, null, 2))
await browser.close()
process.exit(errors.length ? 1 : 0)
