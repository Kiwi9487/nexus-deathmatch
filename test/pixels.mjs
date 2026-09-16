/* 像素级渲染验证：统计帧的颜色分布（天空/地面/亮度/HUD） */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3500))

const analyze = () => page.evaluate(() => {
  // 通过 drawImage 获取合成后的真实画面（readPixels 读的是后缓冲）
  const { renderer } = window.__nexus
  const src = renderer.domElement
  const c2 = document.createElement('canvas')
  c2.width = src.width; c2.height = src.height
  const g2 = c2.getContext('2d')
  g2.drawImage(src, 0, 0)
  const w = c2.width, h = c2.height
  const d = g2.getImageData(0, 0, w, h)
  const px = d.data
  // 统计
  let sumR = 0, sumG = 0, sumB = 0, dark = 0, bright = 0, warm = 0, cool = 0, n = 0
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    sumR += r; sumG += g; sumB += b; n++
    const lum = 0.3 * r + 0.6 * g + 0.1 * b
    if (lum < 12) dark++
    if (lum > 200) bright++
    if (r > b + 25) warm++
    if (b > r + 25) cool++
  }
  // 顶部 20% 与底部 20% 的平均色
  const top = { r: 0, g: 0, b: 0 }, bot = { r: 0, g: 0, b: 0 }
  const tn = Math.floor(w * h * 0.2)
  for (let y = 0; y < h * 0.2; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      top.r += px[i]; top.g += px[i + 1]; top.b += px[i + 2]
    }
  }
  for (let y = h * 0.8; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      bot.r += px[i]; bot.g += px[i + 1]; bot.b += px[i + 2]
    }
  }
  const k = (o) => [Math.round(o.r / tn), Math.round(o.g / tn), Math.round(o.b / tn)]
  return {
    avg: [Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n)],
    topAvg: k(top), botAvg: k(bot),
    darkPct: +(dark / n * 100).toFixed(1),
    brightPct: +(bright / n * 100).toFixed(1),
    warmPct: +(warm / n * 100).toFixed(1),
    coolPct: +(cool / n * 100).toFixed(1),
    state: window.__nexus.game.state,
  }
})

console.log('菜单状态:', JSON.stringify(await analyze()))
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 6000))
console.log('出生点:', JSON.stringify(await analyze()))
// 面向喷泉
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(8, 0, 10)
  p.yaw = Math.atan2(0 - 8, 0 - 10) + Math.PI
})
await new Promise((r) => setTimeout(r, 800))
console.log('喷泉:', JSON.stringify(await analyze()))
// 检查 HUD 准星画布
const hud = await page.evaluate(() => {
  const c = document.getElementById('hudCanvas')
  const g = c.getContext('2d')
  const d = g.getImageData(Math.floor(c.width / 2) - 20, Math.floor(c.height / 2) - 20, 40, 40).data
  let nonTransparent = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonTransparent++
  return { nonTransparentPx: nonTransparent }
})
console.log('HUD准星像素:', JSON.stringify(hud))
console.log('ERRORS:', errors.length ? errors : '无')
await browser.close()
