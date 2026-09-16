/* ================= 全局配置（单一数据源） ================= */

export const CFG = {
  match: {
    firstTo: 40,          // 先到 40 杀结束
    timeMinutes: 8,       // 或 8 分钟结束
    respawn: 3,           // 死亡重生秒数
    countdown: 3,         // 开局倒计时
    invuln: 2.5,          // 重生无敌秒数
    killHeal: true,       // 击杀后回复满状态（死斗规则）
  },

  player: {
    height: 1.8,          // 站姿身高
    crouchHeight: 1.35,   // 蹲姿身高
    radius: 0.32,
    eyeStand: 1.62,
    eyeCrouch: 1.2,
    hp: 100,
    armor: 50,
    walkSpeed: 5.6,       // 基础移速（沙漠之鹰更快）
    walkShift: 2.0,       // Shift 静步（Valorant 静步更慢）
    accelGround: 42,      // 地面加速度（急停手感）
    accelAir: 7,
    gravity: 17.5,
    jumpV: 6.1,           // 跳跃初速度 → 高度约 1.06m
    airSpeedFactor: 0.58, // 空中最大水平速度比例
    stepH: 0.36,          // 可自动迈上的台阶高度
    fovH: 103,            // 水平视野（Valorant 默认）
    headBobFreq: 2.1,
    headBobAmp: 0.032,
    crouchSpeed: 0.45,    // 蹲姿移速系数
    jumpCrouchPenalty: 3.2,
  },

  weapons: {
    m4: {
      id: 'm4', name: 'M4A1', key: '1',
      auto: true,
      rpm: 660,            // 射击间隔 = 60/rpm
      mag: 30,
      dmg: 33,             // 身体伤害（3 发 99 —— 和 Valorant 步枪一样的三枪感）
      headMult: 4,         // 爆头无视护甲，一枪击杀
      reload: 2.4,
      speed: 5.4,          // 持枪移速
      kick: 0.42,          // 单发视角上跳（度）
      bloomPerShot: 0.22,
      bloomMax: 4,
      movePen: 1.8,        // 移动扩散（度）
      airPen: 3.5,
      crouchMult: 0.45,
      adsMult: 0.28,
      baseSpread: 0.06,
      adsSpread: 0.02,
      adsZoom: 0.72,       // ADS 视野倍率
      patternLen: 30,
      sound: { vol: 0.5, dur: 0.085, f: 1300 },
      tracer: 0x9fd4ff,
    },
    deagle: {
      id: 'deagle', name: '沙漠之鹰', key: '2',
      auto: false,
      rpm: 260,
      mag: 7,
      dmg: 55,
      headMult: 4,
      reload: 2.1,
      speed: 5.6,
      kick: 1.55,
      bloomPerShot: 0.9,
      bloomMax: 5,
      movePen: 3.0,
      airPen: 4.8,
      crouchMult: 0.5,
      adsMult: 0.32,
      baseSpread: 0.15,
      adsSpread: 0.05,
      adsZoom: 0.78,
      patternLen: 0,
      sound: { vol: 0.8, dur: 0.16, f: 620 },
      tracer: 0xffd58a,
    },
    knife: {
      id: 'knife', name: '战术匕首', key: '3',
      auto: false,
      rpm: 48,
      mag: 0,
      dmg: 55,          // 轻击伤害
      heavyDmg: 100,    // 重击伤害（右键）
      headMult: 1.5,    // 刀爆头加成
      range: 2.6,       // 轻击距离
      heavyRange: 3.0,  // 重击距离
      reload: 0,
      speed: 6.2,       // 持刀移速（Valorant：持刀明显加速）
      kick: 0,
      bloomPerShot: 0,
      bloomMax: 0,
      movePen: 0,
      airPen: 0,
      crouchMult: 1,
      adsMult: 1,
      baseSpread: 0,
      adsSpread: 0,
      adsZoom: 0,
      patternLen: 0,
      sound: { vol: 0.5, dur: 0.1, f: 900 },
      tracer: 0xffffff,
    },
    op: {
      id: 'op', name: '离子大狙', key: '4',
      auto: false,
      rpm: 42,          // 约 1.4s 一枪
      mag: 5,
      dmg: 150,         // 身体一枪击杀
      headMult: 1.5,    // 爆头 225（护甲也挡不住）
      reload: 3.6,
      speed: 4.7,       // 持枪移速较慢
      kick: 2.4,        // 大后坐
      bloomPerShot: 2.2,
      bloomMax: 4,
      movePen: 3.6,
      airPen: 5.5,
      crouchMult: 0.4,
      adsMult: 0.04,    // 开镜几乎无散布
      baseSpread: 0.4,  // 腰射不准
      adsSpread: 0.005,
      adsZoom: 0.4,     // 约 2.5x 变焦
      patternLen: 0,
      sound: { vol: 1.0, dur: 0.32, f: 380 },
      tracer: 0x9fe8ff,
      isSniper: true,
    },
  },

  bots: {
    count: 4,
    spawnProtect: 1.2,    // 重生后不主动开火的保护时间（防背后偷袭）
    names: ['SABLE', 'REVEN', 'KAIROS', 'OBSIDIAN', 'VANTA', 'LUXE', 'HAVOC',
            'MIRA', 'ZENITH', 'EMBER', 'NOX', 'RHEA', 'ORION', 'VEGA', 'TITAN'],
    // 难度 0..1：hard .88-.96 / normal .62-.75 / easy .38-.5
    roster: ['hard', 'normal', 'normal', 'easy', 'hard', 'normal', 'easy'],
    visionRange: 26,
    thinkInterval: 0.12,
    headshotBias: { hard: 0.2, normal: 0.12, easy: 0.04 },
    armor: { hard: 50, normal: 40, easy: 30 },
    m4Chance: 0.62,
  },

  spawns: [
    [-24, -18], [24, -17], [-24, 17], [24, 17],
    [0, -19], [0, 17], [20, 9], [-23, 11], [-13, -14], [19, -13],
  ],

  quality: { high: { shadow: 2048, dpr: 1.75 }, medium: { shadow: 1024, dpr: 1.5 }, low: { shadow: 0, dpr: 1.25 } },

  sniper: {
    moveAdsSpeedFactor: 0.42,   // 开镜移速系数
    scopeFov: 0.4,              // 镜内视野倍率
    scopeInTime: 0.28,          // 开镜时长
  },
}

export const settings = {
  lang: 'es',
  sens: 1.0,
  fov: 103,
  volume: 0.8,
  volSfx: 1.0,
  volUI: 0.85,
  volMusic: 0.5,
  resolution: 100,
  crossColor: '#ffffff',
  showCross: true,
  bots: 4,
  showMinimap: true,
  quality: 'high',
  invertY: false,
  showFps: true,
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem('nexus-dm-settings')
    if (raw) Object.assign(settings, JSON.parse(raw))
  } catch (e) { /* ignore */ }
  // 兜底：旧存档缺少新增字段时恢复默认值
  if (!['es', 'en', 'zh'].includes(settings.lang)) settings.lang = 'es'
  if (typeof settings.volSfx !== 'number') settings.volSfx = 1.0
  if (typeof settings.volUI !== 'number') settings.volUI = 0.85
  if (typeof settings.volMusic !== 'number') settings.volMusic = 0.5
  if (typeof settings.resolution !== 'number' && typeof settings.resolution !== 'string') settings.resolution = 100
}

export function saveSettings() {
  try { localStorage.setItem('nexus-dm-settings', JSON.stringify(settings)) } catch (e) { /* ignore */ }
}
