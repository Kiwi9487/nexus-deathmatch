/* 运行时探测：检查 groundYUnder 与地面碰撞 */
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
await new Promise((r) => setTimeout(r, 3500))
const probe = await page.evaluate(() => {
  const w = window.__nexus.world
  return {
    standBoxes: w.standBoxes.length,
    floorInStand: w.standBoxes.some((b) => b.type === 'floor'),
    gyAtSpawn: w.groundYUnder(-24, -18, 0.0, -1),
    gyBelow: w.groundYUnder(-24, -18, -0.05, -1),
    gyFarBelow: w.groundYUnder(-24, -18, -5, -1),
    gyCrate: w.groundYUnder(-20.5, -8.5, 1.71, -1),
    rayBoxes: w.rayBoxes.length,
  }
})
console.log('PROBE:', JSON.stringify(probe, null, 1))
console.log('ERRORS:', errors)
await browser.close()
