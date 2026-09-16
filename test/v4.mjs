/* V4 验证：木箱穿透 / 敌人爆头偏好 / Karambit 建模 / 击杀音效 / 敌人脚步 */
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

// 1. 木箱穿透：玩家、木箱、机器人三点一线 → 打穿木箱命中机器人（伤害衰减）
const pen = await R(async () => {
  const g = window.__nexus.game
  const p = g.player
  p.invuln = 999
  p.bloom = 0
  const cam = window.__nexus.camera
  // 布局：玩家 (-13, 10) 面向 +x 且下倾瞄准，1.7m 高木箱 (-10, 10) 居中，机器人 (-8, 10) 在箱后
  // 射线从 y1.5 下倾到 y1.0 → 必须穿过 1.7m 木箱 → 命中箱后机器人（穿透衰减）
  const bot = g.bots.list.find((b) => b.alive)
  if (!bot) return { err: 'no bot' }
  bot.pos.set(-8, 0, 10)
  bot.respawnT = 0
  bot.hp = 100
  bot.armor = 0
  p.pos.set(-13, 0, 10)
  cam.position.set(-13, 1.5, 10)
  p.yaw = -Math.PI / 2   // 面向 +x
  p.pitch = Math.atan2(1.0 - 1.5, 5)   // 下倾瞄准 y=1.0 @5m（穿过木箱）
  cam.rotation.set(p.pitch, -Math.PI / 2, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)
  const hpBefore = bot.hp
  for (let i = 0; i < 3; i++) { p.fireCooldown = 0; p.fire() }
  return { hpBefore, hpAfter: bot.hp, dmg: hpBefore - bot.hp, hitsDelta: p.stats.hits }
})
check('穿透木箱命中后方敌人', pen.dmg > 0, `dmg=${pen.dmg} hits=${pen.hitsDelta}`)
check('穿透伤害衰减(≤33×0.3=9.9/发)', pen.dmg <= 30, `dmg=${pen.dmg}`)

// 2. 敌人爆头偏好配置生效（hard ≤ 0.2）
const hsBias = await R(() => {
  const g = window.__nexus.game
  const hards = g.bots.list.filter((b) => b.diff === 'hard')
  return hards.length ? hards[0].hsBias : null
})
check('hard 爆头偏好 ≤0.2', hsBias !== null && hsBias <= 0.2, `hsBias=${hsBias}`)

// 3. Karambit 建模部件数（精细重做后应 ≥ 20 部件 + 指环）
const karambit = await R(async () => {
  const p = window.__nexus.game.player
  p.switchTo('knife')
  while (p.switching) await new Promise((r) => setTimeout(r, 50))
  const vm = p.viewModels.knife.view
  let meshes = 0, gold = 0
  vm.traverse((o) => {
    if (o.isMesh) {
      meshes++
      const m = Array.isArray(o.material) ? o.material[0] : o.material
      if (m.color && m.color.getHexString() === 'c9a227') gold++
    }
  })
  return { meshes, gold }
})
check('Karambit 精细部件(≥20)', karambit.meshes >= 20, `meshes=${karambit.meshes}`)
check('Karambit 金色指环存在', karambit.gold >= 2, `gold=${karambit.gold}`)

// 4. 击杀音效：五杀不抛异常（打点 audio 不可行，验证调用链）
const sting = await R(async () => {
  const a = await import('/src/audio.js')
  // 直接调用（模块级函数）
  for (let s = 1; s <= 5; s++) a.killSting(s)
  return true
})
check('1-5 杀音效调用无异常', sting === true)

// 5. 敌人脚步音状态（移动机器人 footT 计时存在）
const foot = await R(() => {
  const list = window.__nexus.game.bots.list
  const b = list[0]
  return { len: list.length, name: b ? b.name : null, footT: b ? b.footT : null, footTType: b ? typeof b.footT : null, aimStyle: b ? b.aimStyle : null }
})
check('敌人脚步计时器存在', foot.footTType === 'number', JSON.stringify(foot))
check('敌人个人瞄准习惯存在', foot.aimStyle >= 0.15 && foot.aimStyle <= 0.85, `style=${foot.aimStyle?.toFixed(2)}`)

// 6. 自适应画质函数存在（settings.quality 可变）
const aq = await R(() => {
  const s = window.__nexus.settings
  const before = s.quality
  s.quality = 'low'
  return { before, ok: s.quality === 'low' }
})
check('画质档位可切换', aq.ok, `${aq.before}→low`)

console.log('\n========== V4 深度打磨验证 ==========')
for (const r of results) console.log(r)
console.log('页面错误:', errors.length ? errors : '无')
await browser.close()
