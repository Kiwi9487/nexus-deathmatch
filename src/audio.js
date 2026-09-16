/* ================= 程序化音效引擎（WebAudio 全合成，零素材） ================= */

import { settings } from './config.js'

let ctx = null
let master = null
let sfx = null
let uiGain = null
let ambientGain = null

// 预生成的噪声缓冲
const noiseBuf = (() => {
  let buf = null
  return () => {
    if (buf) return buf
    const c = getCtx()
    buf = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      // 粉噪声近似（让枪声/风感更有质感）
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      d[i] = white * 0.8 + last * 2.2
    }
    return buf
  }
})()

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    // 动态压缩（防削波）
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 24
    comp.ratio.value = 5
    comp.attack.value = 0.003
    comp.release.value = 0.24
    // 总音量（GainNode，兼容无 compressor.gain 的环境）
    master = ctx.createGain()
    master.gain.value = 1
    comp.connect(master)
    master.connect(ctx.destination)
    sfx = ctx.createGain()
    sfx.gain.value = 0.8
    sfx.connect(comp)
    uiGain = ctx.createGain()
    uiGain.gain.value = 0.7
    uiGain.connect(comp)
    ambientGain = ctx.createGain()
    ambientGain.gain.value = 0.05
    ambientGain.connect(comp)
  }
  return ctx
}

export function initAudio() {
  const c = getCtx()
  if (c.state === 'suspended') c.resume()
  setVolume()
  startAmbience()
}

export function setVolume(v = settings.volume) {
  if (!sfx) return
  master.gain.value = v
  sfx.gain.value = v * settings.volSfx
  if (uiGain) uiGain.gain.value = v * settings.volUI
  if (ambientGain) ambientGain.gain.value = 0.05 * v * settings.volMusic
}

/** 包络：0 → g（5ms 内）→ 指数衰减到 0 */
function env(gainNode, t0, g, dur, attack = 0.005) {
  gainNode.gain.setValueAtTime(0.0001, t0)
  gainNode.gain.linearRampToValueAtTime(g, t0 + attack)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
}

function noise({ dur, g = 0.5, type = 'bandpass', f = 1200, q = 0.8, hp = 0, lp = 0, t0 = 0, to = null }) {
  const c = getCtx()
  const src = c.createBufferSource()
  src.buffer = noiseBuf()
  src.loop = true
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.value = f
  filter.Q.value = q
  let node = filter
  if (hp) {
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; h.Q.value = 0.7
    filter.connect(h); node = h
  }
  if (lp) {
    const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; l.Q.value = 0.7
    node.connect(l); node = l
  }
  const gn = c.createGain()
  node.connect(gn)
  gn.connect(to || sfx)
  env(gn, t0, g, dur)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
  return gn
}

function tone(freq, dur, { g = 0.3, type = 'sine', glide = 0, t0 = 0, attack = 0.004, to = null } = {}) {
  const c = getCtx()
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t0 + dur)
  const gn = c.createGain()
  osc.connect(gn)
  gn.connect(to || sfx)
  env(gn, t0, g, dur, attack)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** 空间音效：根据与摄像机的角度/距离做立体声平移与衰减 */
function spatial(pan = 0, dist = 0) {
  const c = getCtx()
  const p = c.createStereoPanner()
  p.pan.value = clampPan(pan)
  const gn = c.createGain()
  const vol = clamp(1 - dist / 32, 0.05, 1)
  gn.gain.value = vol * vol
  p.connect(gn)
  gn.connect(sfx)
  return { p, vol }
}
function clampPan(v) { return Math.max(-0.85, Math.min(0.85, v)) }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v }

/* ---------------- 音效配方 ---------------- */

export function playShot(wpn, opts = {}) {
  // 分层枪声（Valorant 风格）：瞬态 crack + 主体 boom + 机械 click + 空间回声
  // opts: { pan, dist }
  const s = wpn.sound
  const t0 = ctx ? ctx.currentTime : 0
  const sp = opts.dist ? spatial(opts.pan || 0, opts.dist) : null
  const out = sp ? sp.p : null
  const isSniper = !!wpn.isSniper
  const vol = isSniper ? 1 : s.vol
  const t01 = t0 + 0.001

  // 1. 瞬态 crack（尖锐开头，所有枪声的灵魂）
  noise({ dur: isSniper ? 0.03 : 0.014, g: vol * 0.9, type: 'highpass', f: isSniper ? 2500 : 3600, hp: isSniper ? 1800 : 2800, t0: t01, to: out })
  // 2. 主体 boom（带通噪声 + 低频体）
  noise({ dur: s.dur * (isSniper ? 1.4 : 1.1), g: vol * 0.8, f: s.f, q: 0.75, t0: t01, to: out })
  tone(s.f * 0.85, s.dur * (isSniper ? 1.5 : 1.1), { g: vol * 0.55, type: 'sine', glide: -s.f * 0.55, t0: t01, to: out })
  // 3. 低频胸腔感
  tone(isSniper ? 62 : 96, s.dur * 1.4, { g: vol * 0.5, type: 'sine', glide: -30, t0: t01, to: out })
  // 4. 机械 click（击发组件）
  noise({ dur: 0.018, g: vol * 0.3, type: 'bandpass', f: isSniper ? 1200 : 2400, q: 1.6, t0: t01 + 0.012, to: out })
  // 5. 空间回声（延迟衰减重复 —— 地图/房间感）
  const echoD = isSniper ? 0.12 : 0.055
  const echoG = (isSniper ? 0.4 : 0.22) * (opts.dist ? 0.5 : 1)
  noise({ dur: s.dur * 0.9, g: vol * echoG, f: s.f * 0.8, q: 0.8, t0: t01 + echoD, to: out })
  if (isSniper) {
    // 大狙第二重回声（空旷狙击感）
    noise({ dur: 0.3, g: vol * 0.22, f: 300, q: 0.6, t0: t01 + 0.26, to: out })
  }
}

export function emptyClick() {
  const c = getCtx()
  noise({ dur: 0.03, g: 0.18, type: 'highpass', f: 2500, hp: 1800 })
  tone(420, 0.03, { g: 0.08 })
}

export function reloadSounds(kind) {
  const t0 = ctx ? ctx.currentTime : 0
  if (kind === 'deagle') {
    // 沙鹰：拔匣 → 退弹 → 装弹 → 闭膛
    noise({ dur: 0.04, g: 0.3, type: 'bandpass', f: 1400, q: 1.2, t0: t0 + 0.05 })
    noise({ dur: 0.05, g: 0.28, type: 'highpass', f: 3200, hp: 2600, t0: t0 + 0.16 })   // 弹匣拔出咔哒
    noise({ dur: 0.06, g: 0.32, type: 'bandpass', f: 1600, q: 1.0, t0: t0 + 0.95 })    // 装入
    noise({ dur: 0.05, g: 0.42, type: 'highpass', f: 3000, hp: 2400, t0: t0 + 1.7 })    // 闭膛上膛
    tone(200, 0.06, { g: 0.22, type: 'square', t0: t0 + 0.95 })
    tone(320, 0.04, { g: 0.16, type: 'square', t0: t0 + 1.7 })
  } else if (kind === 'op') {
    // 大狙：拔弹匣 → 装弹 → 拍匣 → 拉栓（慢而重）
    noise({ dur: 0.05, g: 0.34, type: 'bandpass', f: 900, q: 1.1, t0: t0 + 0.1 })
    noise({ dur: 0.06, g: 0.3, type: 'bandpass', f: 1200, q: 1.2, t0: t0 + 1.2 })
    tone(150, 0.08, { g: 0.24, type: 'square', t0: t0 + 1.2 })
    noise({ dur: 0.05, g: 0.4, type: 'bandpass', f: 700, q: 1.0, t0: t0 + 2.4 })       // 拍匣
    noise({ dur: 0.07, g: 0.5, type: 'highpass', f: 2600, hp: 2000, t0: t0 + 3.1 })     // 拉栓
    tone(260, 0.05, { g: 0.2, type: 'square', t0: t0 + 3.1 })
  } else {
    // M4：拔匣 → 装匣 → 拍匣 → 拉栓
    noise({ dur: 0.045, g: 0.32, type: 'bandpass', f: 1100, q: 1.1, t0: t0 + 0.12 })
    noise({ dur: 0.05, g: 0.3, type: 'highpass', f: 3400, hp: 2600, t0: t0 + 0.3 })     // 拔出
    noise({ dur: 0.06, g: 0.34, type: 'bandpass', f: 1500, q: 1.0, t0: t0 + 1.05 })     // 装入
    noise({ dur: 0.05, g: 0.4, type: 'bandpass', f: 900, q: 1.0, t0: t0 + 1.85 })       // 拍匣
    noise({ dur: 0.05, g: 0.46, type: 'highpass', f: 3000, hp: 2400, t0: t0 + 2.3 })     // 拉栓
    tone(190, 0.06, { g: 0.2, type: 'square', t0: t0 + 1.05 })
    tone(300, 0.04, { g: 0.16, type: 'square', t0: t0 + 2.3 })
  }
}

export function shellTick() {
  noise({ dur: 0.03, g: 0.1, type: 'highpass', f: 5200, hp: 4200 })
}

export function hitBody() {
  noise({ dur: 0.05, g: 0.35, type: 'lowpass', f: 600 })
  tone(230, 0.06, { g: 0.22, glide: -90 })
}

export function hitHead() {
  noise({ dur: 0.045, g: 0.45, type: 'bandpass', f: 2600, q: 1.2 })
  tone(920, 0.05, { g: 0.18, type: 'square' })
}

export function playerHurt() {
  noise({ dur: 0.12, g: 0.4, type: 'lowpass', f: 380 })
  tone(130, 0.16, { g: 0.35, glide: -70, type: 'sawtooth' })
}

/** 击杀音效（Valorant 风格连杀分层）：
 *  1杀 清脆单叮 / 2杀 双音连击 / 3杀 三连升+回响 / 4杀 四连+低音冲击 / 5杀 ACE 华彩收尾
 */
export function killSting(streak = 1) {
  const t0 = ctx ? ctx.currentTime : 0
  const step = Math.min(streak, 5)
  // 每连杀 +10% 音调（Valorant 逐级升高的"叮"）
  const base = 660 * Math.pow(1.1, step - 1)
  const g = 0.3 + step * 0.02

  // 基础层：主"叮"（清脆方波 + 泛音），每杀都有
  tone(base, 0.11, { g, type: 'square' })
  tone(base * 1.5, 0.16, { g: g * 0.85, type: 'square', t0: t0 + 0.06 })
  tone(base * 2, 0.2, { g: g * 0.4, type: 'triangle', t0: t0 + 0.1 })

  if (step === 2) {
    // 双杀：第二颗主音 + 高八度亮尾
    tone(base * 1.26, 0.12, { g: g * 1.05, type: 'square', t0: t0 + 0.09 })
    tone(base * 2.2, 0.24, { g: 0.14, type: 'triangle', t0: t0 + 0.16 })
  } else if (step === 3) {
    // 三杀：三连升音 + 金属回响层
    tone(base * 1.26, 0.1, { g: g * 1.05, type: 'square', t0: t0 + 0.08 })
    tone(base * 1.587, 0.12, { g: g * 1.05, type: 'square', t0: t0 + 0.15 })
    tone(base * 1.6, 0.36, { g: 0.14, type: 'triangle', t0: t0 + 0.2 })
    noise({ dur: 0.13, g: 0.1, type: 'highpass', f: 5400, hp: 4000, t0: t0 + 0.18 })
  } else if (step === 4) {
    // 四杀：四连升音 + 低音冲击 + 长尾
    tone(base * 1.26, 0.09, { g: g * 1.05, type: 'square', t0: t0 + 0.07 })
    tone(base * 1.587, 0.1, { g: g * 1.05, type: 'square', t0: t0 + 0.13 })
    tone(base * 2, 0.12, { g: g * 1.05, type: 'square', t0: t0 + 0.19 })
    tone(88, 0.34, { g: 0.3, glide: -25, t0: t0 + 0.16 })
    tone(base * 2.2, 0.42, { g: 0.13, type: 'triangle', t0: t0 + 0.22 })
    noise({ dur: 0.16, g: 0.12, type: 'highpass', f: 5400, hp: 4000, t0: t0 + 0.24 })
  } else if (step >= 5) {
    // 五杀 ACE：加速五连升 → 大三和弦 + 低频轰鸣 + 长滑音收尾（电影感）
    const seq = [1, 1.19, 1.414, 1.68, 2]
    seq.forEach((m, i) => {
      tone(base * m, 0.1, { g: 0.26, type: 'square', t0: t0 + 0.05 + i * 0.05 })
      tone(base * m * 2, 0.08, { g: 0.08, type: 'sine', t0: t0 + 0.05 + i * 0.05 })
    })
    tone(70, 0.6, { g: 0.36, glide: -20, t0: t0 + 0.28 })
    tone(base * 2, 0.5, { g: 0.2, type: 'triangle', t0: t0 + 0.3 })
    tone(base * 2.5, 0.55, { g: 0.16, type: 'triangle', t0: t0 + 0.32 })
    tone(base * 3, 0.6, { g: 0.12, type: 'sine', t0: t0 + 0.34 })
    tone(base * 2, 0.72, { g: 0.17, type: 'sine', glide: base * 0.5, t0: t0 + 0.4 })
    noise({ dur: 0.3, g: 0.14, type: 'highpass', f: 5600, hp: 4200, t0: t0 + 0.3 })
  }
}

export function footstep(vol) {
  noise({ dur: 0.05, g: vol, type: 'lowpass', f: 320 })
}

/** 空间化脚步（敌人脚步声：带立体声方位） */
export function footstepPan(pan, vol) {
  const c = getCtx()
  const t0 = c.currentTime
  const p = c.createStereoPanner()
  p.pan.value = clampPan(pan)
  const gn = c.createGain()
  gn.gain.value = vol
  p.connect(gn)
  gn.connect(sfx)
  const src = c.createBufferSource()
  src.buffer = noiseBuf()
  src.loop = true
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 320
  src.connect(lp)
  lp.connect(p)
  env(gn, t0, vol, 0.055)
  src.start(t0)
  src.stop(t0 + 0.08)
}

export function landThud() {
  noise({ dur: 0.09, g: 0.3, type: 'lowpass', f: 240 })
}

export function countBeep(final = false) {
  tone(final ? 1040 : 480, final ? 0.35 : 0.09, { g: 0.3, type: 'square', to: uiGain })
}

export function matchEndSting() {
  const t0 = ctx ? ctx.currentTime : 0
  ;[660, 520, 390].forEach((f, i) => tone(f, 0.28, { g: 0.22, type: 'triangle', t0: t0 + i * 0.16, to: uiGain }))
}

export function uiClick() {
  tone(1300, 0.03, { g: 0.1, type: 'square', to: uiGain })
}

/** 靶场命中提示音（Valorant 靶场风格金属叮声） */
export function targetDing(head) {
  const base = head ? 2400 : 1700
  tone(base, 0.14, { g: 0.22, type: 'square', glide: base * 0.4 })
  tone(base * 1.5, 0.2, { g: 0.1, type: 'sine', glide: base * 0.3, t0: 0.02 })
}

/* ---------- 近战（匕首） ---------- */
export function meleeSwing(heavy) {
  const t0 = ctx ? ctx.currentTime : 0
  // 挥砍破风声：带通频率快速扫频
  const c = getCtx()
  const src = c.createBufferSource()
  src.buffer = noiseBuf()
  src.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2.2
  bp.frequency.setValueAtTime(600, t0)
  bp.frequency.exponentialRampToValueAtTime(heavy ? 2600 : 1900, t0 + (heavy ? 0.24 : 0.15))
  const gn = c.createGain()
  bp.connect(gn)
  gn.connect(sfx)
  env(gn, t0, heavy ? 0.4 : 0.3, heavy ? 0.26 : 0.16)
  src.connect(bp)
  src.start(t0)
  src.stop(t0 + 0.3)

  // 刀锋金属振鸣（挥出瞬间的"噌"声）
  const shingT = heavy ? 0.13 : 0.08
  tone(1850 + Math.random() * 400, 0.07, { g: 0.11, type: 'square', t0: t0 + shingT })
  tone(3700 + Math.random() * 600, 0.05, { g: 0.06, type: 'sine', t0: t0 + shingT })
}

export function meleeHit(head) {
  // 入肉闷响 + 切割声 + 爆头金属尖鸣
  noise({ dur: 0.1, g: 0.55, type: 'lowpass', f: 380 })
  tone(110, 0.1, { g: 0.5, glide: -45, type: 'sawtooth' })
  noise({ dur: 0.045, g: 0.35, type: 'highpass', f: 2400, hp: 1800, t0: 0.012 })
  if (head) {
    tone(1500, 0.07, { g: 0.24, type: 'square' })
    tone(2350, 0.1, { g: 0.12, type: 'sine', t0: 0.03 })
  }
}

export function meleeWhiff() {
  noise({ dur: 0.05, g: 0.16, type: 'highpass', f: 2600, hp: 1900 })
  tone(1500, 0.04, { g: 0.06, type: 'sine', glide: 500 })
}

export function meleeImpact(mat) {
  if (mat === 'metal') {
    noise({ dur: 0.05, g: 0.3, type: 'highpass', f: 3600, hp: 2800 })
    tone(3000, 0.04, { g: 0.14, type: 'square' })
  } else {
    noise({ dur: 0.05, g: 0.22, type: 'bandpass', f: 900, q: 1.2 })
    tone(160, 0.05, { g: 0.2 })
  }
}

/* ---------- 切枪 ---------- */
export function switchReady(weaponId) {
  const t0 = ctx ? ctx.currentTime : 0
  if (weaponId === 'knife') {
    // 小刀出鞘：刀柄握紧 + 出鞘金属刮擦
    noise({ dur: 0.05, g: 0.2, type: 'bandpass', f: 900, q: 1.4, t0: t0 + 0.05 })
    noise({ dur: 0.08, g: 0.28, type: 'highpass', f: 3400, hp: 2500, t0: t0 + 0.12 })
    tone(1500, 0.06, { g: 0.1, type: 'square', t0: t0 + 0.12 })
    tone(2600, 0.08, { g: 0.08, type: 'sine', glide: 900, t0: t0 + 0.16 })
  } else if (weaponId === 'deagle') {
    // 拉套筒
    noise({ dur: 0.05, g: 0.3, type: 'bandpass', f: 1800, q: 1.2, t0: t0 + 0.08 })
    noise({ dur: 0.04, g: 0.35, type: 'highpass', f: 3000, hp: 2400, t0: t0 + 0.16 })
    tone(300, 0.04, { g: 0.2, type: 'square', t0: t0 + 0.08 })
  } else {
    // M4 拉栓
    noise({ dur: 0.05, g: 0.3, type: 'bandpass', f: 1500, q: 1.2, t0: t0 + 0.08 })
    noise({ dur: 0.05, g: 0.4, type: 'highpass', f: 2800, hp: 2200, t0: t0 + 0.2 })
    tone(280, 0.05, { g: 0.2, type: 'square', t0: t0 + 0.08 })
  }
}

export function impactSound(mat) {
  switch (mat) {
    case 'metal': noise({ dur: 0.05, g: 0.22, type: 'highpass', f: 3400, hp: 2600 }); break
    case 'wood': noise({ dur: 0.05, g: 0.2, type: 'bandpass', f: 1400, q: 1.4 }); tone(180, 0.04, { g: 0.12 }); break
    case 'plant': noise({ dur: 0.04, g: 0.14, type: 'lowpass', f: 500 }); break
    default: noise({ dur: 0.05, g: 0.2, type: 'bandpass', f: 850, q: 0.9 })
  }
}

/** 风与环境底噪 */
function startAmbience() {
  if (ambientGain.gain.value > 0.01) return
  const c = getCtx()
  const src = c.createBufferSource()
  src.buffer = noiseBuf()
  src.loop = true
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 320
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.07
  const lfoG = c.createGain()
  lfoG.gain.value = 140
  lfo.connect(lfoG)
  lfoG.connect(lp.frequency)
  src.connect(lp)
  lp.connect(ambientGain)
  src.start()
  lfo.start()
}
