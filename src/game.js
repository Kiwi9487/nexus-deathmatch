/* ================= 比赛流程：死斗模式状态机 ================= */
import { CFG, settings } from './config.js'
import { ev } from './events.js'
import { pickSpawn } from './world/map.js'
import { buildTraining } from './training.js'
import * as audio from './audio.js'
import { t } from './i18n.js'

export const game = {
  state: 'menu',          // menu | countdown | play | pause | end
  player: null,
  bots: null,
  ui: null,
  timeLeft: 0,
  killGoal: CFG.match.firstTo,
  countdownT: 0,
  respawnPlayerT: 0,
  firstBlood: false,
  trainT: 0,
  training: null,
  _lastN: null,
  _prev: null,

  init({ player, bots, ui }) {
    this.player = player
    this.bots = bots
    this.ui = ui
    ev.on('entityKilled', (e) => this.onEntityKilled(e))
  },

  /* ---------- 开局 ---------- */
  startMatch() {
    this.exitTraining()
    this.firstBlood = false
    this.timeLeft = CFG.match.timeMinutes * 60
    this.countdownT = CFG.match.countdown
    this.state = 'countdown'
    this._lastN = null

    // 敌人数量设置（设置面板改动后新对局生效）
    if (this.bots.list.length !== this.botCount()) {
      this.bots.rebuild(this.botCount())
    }

    const p = this.player
    p.kills = 0; p.deaths = 0; p.streak = 0; p.bestStreak = 0
    p.stats = { shots: 0, hits: 0, headshots: 0, melee: 0, meleeKills: 0 }
    for (const b of this.bots.list) {
      b.kills = 0; b.deaths = 0; b.streak = 0; b.bestStreak = 0
      b.stats = { shots: 0, hits: 0, hsKills: 0 }
      b.respawnT = 0
      this.bots.respawnBot(b)
    }
    const sp = pickSpawn(this.bots.aliveList)
    p.spawn(sp.x, sp.z)
    p.enabled = false

    this.ui.showHUD()
    this.ui.fade(true)
    setTimeout(() => this.ui.fade(false), 450)
    this.ui.setCountdown(String(CFG.match.countdown))
    audio.countBeep()
  },

  /* ---------- 训练靶场 ---------- */
  startTraining() {
    this.exitTraining()
    this.state = 'train'
    this.trainT = 0
    const p = this.player
    p.kills = 0; p.deaths = 0; p.streak = 0; p.bestStreak = 0
    p.stats = { shots: 0, hits: 0, headshots: 0, melee: 0, meleeKills: 0 }
    p.training = true
    p.refillAmmo()
    p.invuln = 999
    p.hp = CFG.player.hp
    p.armor = CFG.player.armor
    this.training = buildTraining()
    p.targets = this.training.targets
    for (const b of this.bots.list) b.group.visible = false
    const sp = this.training.spawn
    p.spawn(sp.x, sp.z)
    p.enabled = true
    this.ui.showTraining(true)
    this.ui.showHUD()
    this.ui.fade(true)
    setTimeout(() => this.ui.fade(false), 300)
  },

  exitTraining() {
    if (!this.training) return
    this.training.dispose()
    this.training = null
    this.player.training = false
    this.player.targets = this.bots.list
    for (const b of this.bots.list) b.group.visible = true
    if (this.ui) this.ui.showTraining(false)
  },

  update(dt) {
    if (this.state === 'train') {
      this.trainT += dt
      if (this.training) this.training.update(dt)
    } else if (this.state === 'countdown') {
      this.countdownT -= dt
      const n = Math.ceil(this.countdownT)
      if (n !== this._lastN && n > 0) {
        this._lastN = n
        this.ui.setCountdown(String(n))
        audio.countBeep()
      }
      if (this.countdownT <= 0) {
        this._lastN = null
        this.ui.setCountdown(t('fight'), true)
        audio.countBeep(true)
        this.state = 'play'
        this.player.enabled = true
        setTimeout(() => this.ui.setCountdown(null), 850)
      }
    } else if (this.state === 'play') {
      this.timeLeft -= dt

      // 玩家重生
      if (!this.player.alive && this.respawnPlayerT > 0) {
        this.respawnPlayerT -= dt
        this.ui.updateDeathTimer(Math.max(1, Math.ceil(this.respawnPlayerT)))
        if (this.respawnPlayerT <= 0) this.respawnPlayer()
      }
      // 机器人重生
      for (const b of this.bots.list) {
        if (b.respawnT > 0) {
          b.respawnT -= dt
          if (b.respawnT <= 0) this.bots.respawnBot(b)
        }
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0
        this.endMatch()
      }
    }
  },

  /* ---------- 击杀处理 ---------- */
  onEntityKilled({ victim, attacker, head, weaponId }) {
    if (!attacker) return
    const a = attacker, v = victim
    a.kills++
    a.streak++
    if (a.streak > a.bestStreak) a.bestStreak = a.streak
    v.deaths++
    v.streak = 0
    if (head && a.stats) a.stats.hsKills = (a.stats.hsKills || 0) + 1
    if (weaponId === 'knife' && a.stats) a.stats.meleeKills = (a.stats.meleeKills || 0) + 1

    const aName = a.isPlayer ? t('you') : a.name
    const vName = v.isPlayer ? t('you') : v.name
    this.ui.addFeed(aName, vName, head, weaponId, a.isPlayer, v.isPlayer)

    // 击杀者奖励（玩家）：击杀音效连杀递增 + 左下角击杀图标（Valorant 风格）
    if (a.isPlayer) {
      audio.killSting(a.streak)
      this.ui.addKillIcon(a.streak)
      if (a.streak >= 2) this.ui.announceStreak(a.streak)
      if (a.streak >= 5) this.ui.aceFlash()
      if (CFG.match.killHeal) this.player.healFull()
    }

    // 死者重生（无论被谁击杀 —— 修复：玩家击杀的机器人此前永不重生）
    if (v.isPlayer) {
      this.respawnPlayerT = CFG.match.respawn
      this.ui.showDeath(aName, head, weaponId, CFG.match.respawn)
    } else {
      v.respawnT = CFG.match.respawn
    }

    if (a.kills >= this.killGoal) this.endMatch()
  },

  respawnPlayer() {
    const sp = pickSpawn(this.bots.aliveList)
    this.player.spawn(sp.x, sp.z)
    this.ui.hideDeath()
  },

  /** 死亡界面点击立即重生 */
  instantRespawn() {
    this.respawnPlayerT = 0.05
    this.ui.updateDeathTimer(1)
  },

  /* ---------- 结束 ---------- */
  endMatch() {
    if (this.state !== 'play') return
    this.state = 'end'
    this.player.enabled = false
    if (document.pointerLockElement) document.exitPointerLock()
    audio.matchEndSting()

    const rows = this.scoreboardRows()
    const rank = rows.findIndex((r) => r.isPlayer) + 1
    const mvp = rows[0]
    const p = this.player
    const acc = p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) : 0
    this.ui.showEnd({
      won: p.kills >= this.killGoal || (this.timeLeft <= 0 && rank === 1),
      stats: {
        kills: p.kills, deaths: p.deaths,
        headshots: p.stats.headshots, acc,
        bestStreak: p.bestStreak,
        shots: p.stats.shots, hits: p.stats.hits,
        meleeKills: p.stats.meleeKills,
        hsRate: p.kills ? Math.round((p.stats.headshots / p.kills) * 100) : 0,
      },
      rank,
      total: rows.length,
      mvpName: mvp.isPlayer ? t('you') : mvp.name,
      mvpKills: mvp.kills,
    })
  },

  botCount() {
    const n = Math.max(3, Math.min(9, Math.round(settings.bots || 7)))
    return n
  },

  /* ---------- 计分板 ---------- */
  scoreboardRows() {
    const rows = [{
      name: t('you'), isPlayer: true,
      kills: this.player.kills, deaths: this.player.deaths,
      streak: this.player.streak, ping: 0,
      hs: this.player.stats.headshots,
    }]
    let i = 0
    for (const b of this.bots.list) {
      rows.push({
        name: b.name, isPlayer: false,
        kills: b.kills, deaths: b.deaths,
        streak: b.streak, ping: 9 + (i * 7) % 28,
        hs: b.stats.hsKills,
      })
      i++
    }
    rows.sort((x, y) => y.kills - x.kills)
    rows.forEach((r, i) => (r.mvp = i === 0 && r.kills > 0))
    return rows
  },

  /* ---------- 暂停 / 菜单 ---------- */
  pause() {
    if (this.state !== 'play' && this.state !== 'countdown' && this.state !== 'train') return
    this._prev = this.state
    this.state = 'pause'
    this.player.enabled = false
    this.ui.showPause(true)
  },

  resume() {
    if (this.state !== 'pause') return
    this.state = this._prev || 'play'
    this.player.enabled = this.state === 'play' || this.state === 'train'
    this.ui.showPause(false)
    if (this.state === 'countdown') {
      this.ui.setCountdown(String(Math.max(1, Math.ceil(this.countdownT))))
    }
  },

  toMenu() {
    this.exitTraining()
    this.state = 'menu'
    this.player.enabled = false
    this.player.alive = false
    this.ui.showMenu()
  },
}
