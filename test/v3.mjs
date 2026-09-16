/* V3 修复验证：视角线性无加速 / Tab 不弹设置 / 大狙开镜不挡 / 击杀无文字 / 敌人数量 / 重生保护 */
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

// 1. 视角线性：注入 200px → 总转动 ≈25°（无加速：转动量不放大、无延迟积累）
const look = await R(async () => {
  const p = window.__nexus.game.player
  p.invuln = 999
  // headless 指针锁定可能抖动（60ms 保护窗口会分段消费）→ 等待锁定稳定后注入
  await new Promise((r) => setTimeout(r, 800))
  window.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: 0 }))
  const deltas = await new Promise((resolve) => {
    const samples = []
    let prev = p.yaw
    let frames = 0
    const tick = () => {
      const d = Math.abs(((p.yaw - prev + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      samples.push(+(d * 180 / Math.PI).toFixed(2))
      prev = p.yaw
      if (++frames >= 6) resolve(samples)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const total = deltas.reduce((a, b) => a + b, 0)
  return { deltas, total }
})
// 200px @ sens1 @103fov = 25.2°：总量精确、单帧峰值受保护上限约束（无加速无跳变）
check('200px 总转动量≈25°(无加速)', look.total > 20 && look.total < 32, `total=${look.total}°`)
check('单帧峰值受限(≤40°)', Math.max(...look.deltas) <= 40, `max=${Math.max(...look.deltas)}°`)

// 2. Tab 键：不弹设置、不暂停，只显示计分板
await R(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true }))
})
await wait(50)
const tabCheck = await R(() => ({
  settingsVisible: document.getElementById('settings').style.display === 'flex',
  paused: window.__nexus.game.state === 'pause',
  scoreboard: document.getElementById('scoreboard').style.display === 'flex',
}))
await R(() => {
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab', key: 'Tab', bubbles: true }))
})
check('Tab 不弹设置', !tabCheck.settingsVisible)
check('Tab 不触发暂停', !tabCheck.paused)

// 3. 大狙开镜隐藏武器模型（按住右键真实开镜，轮询等待 ads 爬升）
const scopeHide = await R(async () => {
  const p = window.__nexus.game.player
  p.switchTo('op')
  while (p.switching) await new Promise((r) => setTimeout(r, 50))
  const canvas = document.getElementById('c3d')
  // 按住右键，轮询直到 ads > 0.9（headless 事件可能丢失，重发）
  let ads = 0
  for (let i = 0; i < 20 && ads < 0.9; i++) {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }))
    await new Promise((r) => setTimeout(r, 120))
    ads = p.ads
  }
  const hidden = !p.view.view.visible && ads > 0.9
  // 松开右键 → 收镜恢复
  window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }))
  await new Promise((r) => setTimeout(r, 600))
  const shown = p.view.view.visible && p.ads < 0.7
  return { hidden, shown, ads: +ads.toFixed(2) }
})
check('大狙开镜隐藏武器模型', scopeHide.hidden)
check('收镜后恢复显示', scopeHide.shown)

// 4. 击杀反馈：图标存在 + 无文字播报
const killFeedback = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  p.invuln = 0
  if (!p.alive) g.respawnPlayerT = 0.05
  await new Promise((r) => setTimeout(r, 300))
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { err: 'no bot' }
  bot.hp = 1
  bot.hit(100, true, p, 'm4')
  await new Promise((r) => setTimeout(r, 250))
  return {
    icons: document.querySelectorAll('#kills .kicon').length,
    announceText: document.getElementById('announce').textContent.trim(),
  }
})
check('击杀图标出现', killFeedback.icons >= 1, `icons=${killFeedback.icons}`)
check('无文字播报', killFeedback.announceText === '', `text="${killFeedback.announceText}"`)

// 5. 默认敌人数量 4
const botCount = await R(() => window.__nexus.game.bots.list.length)
check('默认敌人数量 4', botCount === 4, `count=${botCount}`)

// 6. 机器人重生保护：重生后 1.2s 内不主动开火
const spawnProtect = await R(async () => {
  const g = window.__nexus.game
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { err: 'no bot' }
  bot.respawn(bot.pos.x, bot.pos.z)
  const protect = bot.spawnProtect > 0
  await new Promise((r) => setTimeout(r, 200))
  return { protect, stillProtecting: bot.spawnProtect > 0 }
})
check('重生获得保护期', spawnProtect.protect)
check('保护期计时中', spawnProtect.stillProtecting)

// 7. 小地图 M 键切换
const miniToggle = await R(async () => {
  const s = window.__nexus.settings
  const before = s.showMinimap
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }))
  await new Promise((r) => setTimeout(r, 100))
  return { before, after: s.showMinimap, display: document.getElementById('minimap').style.display }
})
check('M 键切换小地图', miniToggle.before !== miniToggle.after, `${miniToggle.before}→${miniToggle.after}`)

console.log('\n========== V3 修复验证 ==========')
for (const r of results) console.log(r)
console.log('页面错误:', errors.length ? errors : '无')
await browser.close()
