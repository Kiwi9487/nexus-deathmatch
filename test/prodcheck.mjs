/* 生产构建验证：加载 4173 → 开始 → 运行 → 状态/无报错 */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()))

await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))
console.log('title:', await page.$eval('.brand', (el) => el.textContent).catch(() => null))

await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 6000))
console.log('state:', await page.evaluate(() => window.__nexus?.game?.state))
console.log('fps:', await page.$eval('#fps', (el) => el.textContent).catch(() => 'n/a'))
console.log('weapons:', await page.evaluate(() => Object.keys(window.__nexus?.game?.player?.viewModels || {}).join(',')))

// 简单玩法探测：切刀右键重击（确认生产版核心功能）
const rmb = await page.evaluate(`(async () => {
  const p = window.__nexus.game.player
  p.invuln = 999
  p.alive = true
  p.switchTo('knife')
  await new Promise((r) => setTimeout(r, 900))
  const before = p.stats.melee
  window.__nexus.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }))
  return { melee: p.stats.melee - before, heavy: p.meleeHeavy }
})()`)
console.log('rmb heavy attack:', JSON.stringify(rmb))
console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
