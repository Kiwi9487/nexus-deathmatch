/* 冒烟测试：加载游戏 → 点击开始 → 运行数秒 → 收集 JS 错误与状态 */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure()?.errorText || '')))

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 4000))
console.log('TITLE:', await page.$eval('.brand', (el) => el.textContent).catch(() => null))

await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 6000))
console.log('state after start:', await page.evaluate(() => window.__nexus?.game?.state))
console.log('fps:', await page.$eval('#fps', (el) => el.textContent).catch(() => 'n/a'))

await new Promise((r) => setTimeout(r, 6000))
console.log('state later:', await page.evaluate(() => window.__nexus?.game?.state))
console.log('player kills:', await page.evaluate(() => window.__nexus?.game?.player?.kills))
console.log('bots alive:', await page.evaluate(() => window.__nexus?.bots?.list?.filter((b) => b.alive).length))
console.log('player pos:', await page.evaluate(() => {
  const p = window.__nexus?.game?.player
  return p ? [p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1)] : null
}))
console.log('hud ammo:', await page.$eval('#ammo-mag', (el) => el.textContent).catch(() => 'n/a'))

// 截图
await page.screenshot({ path: 'test/test-shot.png' })
console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
