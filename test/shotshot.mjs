/* 截图 → 第二页加载 → 像素分析（真实合成画面） */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))

// 菜单截图
await page.screenshot({ path: 'test/ver-menu.png' })
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 6000))
// 出生点（玩家可能已死，等重生）
await page.evaluate(() => {
  const g = window.__nexus.game
  g.respawnPlayerT = 0.1
})
await new Promise((r) => setTimeout(r, 1500))
// 传送到喷泉附近保证存活并拍几张
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.invuln = 999
  p.pos.set(10, 0, 12)
  p.yaw = Math.atan2(-10, -12) + Math.PI
})
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: 'test/ver-play.png' })
// 喷泉近景
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(3.2, 0, 2.5)
  p.yaw = Math.PI * 1.25
})
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: 'test/ver-fountain.png' })
// 天桥
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(16.5, 2.1, -5.5)
  p.yaw = Math.PI
})
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: 'test/ver-catwalk.png' })

// 分析截图（base64 注入）
import fs from 'node:fs'
const page2 = await browser.newPage()
await page2.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 1000))
const results = {}
for (const name of ['menu', 'play', 'fountain', 'catwalk']) {
  const b64 = fs.readFileSync(`test/ver-${name}.png`).toString('base64')
  results[name] = await page2.evaluate(async (b64img) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64img
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 320; c.height = 180
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, 320, 180)
    const d = g.getImageData(0, 0, 320, 180).data
    let sumR = 0, sumG = 0, sumB = 0, dark = 0, cnt = 0
    let top = [0, 0, 0], bot = [0, 0, 0]
    for (let y = 0; y < 180; y++) {
      for (let x = 0; x < 320; x++) {
        const i = (y * 320 + x) * 4
        const r = d[i], gg = d[i + 1], b = d[i + 2]
        sumR += r; sumG += gg; sumB += b; cnt++
        if (r + gg + b < 36) dark++
        if (y < 36) { top[0] += r; top[1] += gg; top[2] += b }
        if (y > 144) { bot[0] += r; bot[1] += gg; bot[2] += b }
      }
    }
    const t = 36 * 320, bt = 36 * 320
    return {
      avg: [Math.round(sumR / cnt), Math.round(sumG / cnt), Math.round(sumB / cnt)],
      top: top.map((v) => Math.round(v / t)),
      bot: bot.map((v) => Math.round(v / bt)),
      darkPct: +(dark / cnt * 100).toFixed(1),
    }
  }, b64)
}
console.log(JSON.stringify(results, null, 1))
await browser.close()
