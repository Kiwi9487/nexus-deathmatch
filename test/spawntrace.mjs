/* 分时段追踪出生位置：倒计时期间与开局后 */
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

const dump = async (label) => {
  const d = await page.evaluate(() => {
    const g = window.__nexus.game
    const p = g.player
    return {
      state: g.state,
      player: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)],
      bots: g.bots.list.map((b) => [b.pos.x.toFixed(1), b.pos.z.toFixed(1)]),
    }
  })
  console.log(label, 'state=' + d.state, 'player=' + d.player, 'bots=' + JSON.stringify(d.bots))
}

await new Promise((r) => setTimeout(r, 1200))
await dump('t=1.2s')
await new Promise((r) => setTimeout(r, 1200))
await dump('t=2.4s')
await new Promise((r) => setTimeout(r, 1200))
await dump('t=3.6s')
await new Promise((r) => setTimeout(r, 2500))
await dump('t=6.1s')
console.log('ERRORS:', errors)
await browser.close()
