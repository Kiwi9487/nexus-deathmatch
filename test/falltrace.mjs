/* 追踪玩家 y 坐标随时间变化，找出下坠起点 */
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

for (let i = 0; i < 16; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  const s = await page.evaluate(() => {
    const p = window.__nexus.game.player
    const g = window.__nexus.game
    return {
      t: g.state,
      y: +p.pos.y.toFixed(2),
      vy: +p.vel.y.toFixed(2),
      ground: p.onGround,
      enabled: p.enabled,
      alive: p.alive,
    }
  })
  console.log(`t=${i + 1}s`, JSON.stringify(s))
}
console.log('ERRORS:', errors)
await browser.close()
