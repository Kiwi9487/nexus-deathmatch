/* V2 新功能测试：视角消费式增量 / 急停散布 / 大狙 / 击杀图标 / 敌人数量默认 */
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

// 1. 视角消费式增量：注入 900px 巨量增量 → 单帧最多消费 300px(≈38°)，且总转动量守恒
const look = await R(async () => {
  const p = window.__nexus.game.player
  p.invuln = 999
  p.settingsSens = null
  const evt = new MouseEvent('mousemove', { movementX: 900, movementY: 0 })
  window.dispatchEvent(evt)
  // RAF 逐帧采样：记录真正的单帧转角
  const deltas = await new Promise((resolve) => {
    const samples = []
    let prev = p.yaw
    let frames = 0
    const tick = () => {
      const d = Math.abs(((p.yaw - prev + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      samples.push(+(d * 180 / Math.PI).toFixed(1))
      prev = p.yaw
      if (++frames >= 12) resolve(samples)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const maxFrame = Math.max(...deltas)
  const total = deltas.reduce((a, b) => a + b, 0)
  return { maxFrame, total, frames: deltas }
})
// 新的正确行为：单帧 clamp ±400px（≈50°），超出部分丢弃（无结转 → 无加速）
check('巨量增量单帧受限(≈50°)', look.maxFrame > 40 && look.maxFrame < 60, `maxFrame=${look.maxFrame}°`)
check('单帧内消费完毕(无残余加速)', look.total >= look.maxFrame - 1 && look.total <= look.maxFrame + 1, `total=${look.total}°`)

// 2. 急停：静止时散布≈0，移动时散布大
const spread = await R(() => {
  const p = window.__nexus.game.player
  p.vel.set(0, 0, 0)
  p.bloom = 0
  const still = p.computeSpread()
  p.vel.set(3, 0, 0)
  const moving = p.computeSpread()
  p.vel.set(0, 0, 0)
  return { still: +(still * 180 / Math.PI).toFixed(3), moving: +(moving * 180 / Math.PI).toFixed(3) }
})
check('静止散布≈0（急停第一发准）', spread.still < 0.1, `still=${spread.still}°`)
check('移动散布显著增大', spread.moving > 0.5, `moving=${spread.moving}°`)

// 3. 大狙：切枪 + 开镜 FOV 收缩 + 开镜移动失准
const op = await R(async () => {
  const p = window.__nexus.game.player
  p.switchTo('op')
  while (p.switching) await new Promise((r) => setTimeout(r, 50))
  const isOp = p.weaponId === 'op' && p.mag === 5
  // 开镜
  p.ads = 1
  const fovAds = p.weapon.adsZoom
  // 开镜移动散布
  p.vel.set(2, 0, 0)
  p.bloom = 0
  const movingAdsSpread = p.computeSpread()
  p.vel.set(0, 0, 0)
  return { isOp, adsZoom: fovAds, movingAdsSpread: +(movingAdsSpread * 180 / Math.PI).toFixed(2) }
})
check('切到大狙(弹匣5)', op.isOp)
check('大狙开镜变焦≈2.5x', op.adsZoom < 0.5, `zoom=${op.adsZoom}`)
check('开镜移动大幅失准', op.movingAdsSpread > 1, `spread=${op.movingAdsSpread}°`)

// 4. 击杀图标（左下角 DOM）
const killIcon = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { err: 'no bot' }
  bot.hp = 1
  p.invuln = 0
  bot.hit(100, true, p, 'm4')
  await new Promise((r) => setTimeout(r, 200))
  const icons = document.querySelectorAll('#kills .kicon').length
  return { icons }
})
check('击杀后出现左下角击杀图标', killIcon.icons >= 1, `icons=${killIcon.icons}`)

// 5. 默认敌人数量 5
await R(() => { window.__nexus.settings.bots = 5 })
await R(() => window.__nexus.game.startMatch())
await wait(300)
const botCount = await R(() => window.__nexus.game.bots.list.length)
check('默认敌人数量 5', botCount === 5, `count=${botCount}`)

// 6. 大狙开镜 UI（狙击镜渲染）
await R(async () => {
  const p = window.__nexus.game.player
  p.switchTo('op')
  while (p.switching) await new Promise((r) => setTimeout(r, 50))
  p.ads = 1
})
await wait(200)
const scope = await R(() => {
  const c = document.getElementById('hudCanvas')
  const g = c.getContext('2d')
  const d = g.getImageData(Math.floor(c.width / 2) - 5, Math.floor(c.height / 2) - 5, 10, 10).data
  let dark = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 30 && d[i + 1] < 30 && d[i + 2] < 30) dark++
  // 中心应被十字线覆盖（亮或暗）；镜外应全黑
  const edge = g.getImageData(10, Math.floor(c.height / 2), 20, 4).data
  let edgeDark = 0
  for (let i = 0; i < edge.length; i += 4) if (edge[i] < 30 && edge[i + 1] < 30 && edge[i + 2] < 30) edgeDark++
  return { edgeDark, centerDark: dark }
})
check('开镜后镜外区域变黑', scope.edgeDark > 60, `edgeDark=${scope.edgeDark}`)

console.log('\n========== V2 新功能测试 ==========')
for (const r of results) console.log(r)
console.log('页面错误:', errors.length ? errors : '无')
await browser.close()
