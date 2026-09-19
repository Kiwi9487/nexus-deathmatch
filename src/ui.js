/* ================= UI：HUD / 菜单 / 设置 / 计分板 / 小地图（多语言） ================= */
import { settings, saveSettings, CFG } from './config.js'
import { camera } from './render.js'
import { input } from './input.js'
import { minimapRects } from './world/map.js'
import { ev } from './events.js'
import * as audio from './audio.js'
import { rayBox } from './utils.js'
import { t, LANGUAGES, setLanguage, weaponName, applyLanguage } from './i18n.js'
import * as THREE from 'three'

const $ = (id) => document.getElementById(id)

export const ui = {
  player: null, bots: null, game: null,
  hitmarks: [],
  indicators: [],
  minimapRects: [],
  announceT: null,
  hintT: 0,
  aceFlashT: 0,

  /* ================ 初始化 ================ */
  init(ctx) {
    Object.assign(this, ctx)
    this.minimapRects = minimapRects()
    this.build()
    ev.on('hitmarker', (d) => this.hitmarks.push({ t: 0.16, kill: d.kill }))
    ev.on('playerHurt', (d) => {
      if (d.from) this.indicators.push({ x: d.from.x, z: d.from.z, t: 0.8 })
      this.flashHurt(d.head)
    })
    window.addEventListener('nexus-language-change', () => this.rebuild())
  },

  /* ================ 静态界面骨架 ================ */
  build() {
    const root = $('ui-root')
    root.innerHTML = `
      <!-- 主菜单 -->
      <div id="menu">
        <div class="brand">NEXUS</div>
        <div class="sub">${t('subtitle')}</div>
        <div class="langs" id="langs">
          ${LANGUAGES.map((l) => `<button class="lang ${settings.lang === l.code ? 'on' : ''}" data-lang="${l.code}">${l.label}</button>`).join('')}
        </div>
        <div class="mobile-hint rotate">${t('rotateHint')}</div>
        <div class="mobile-hint ios">${t('iosHint')}</div>
        <button class="btn primary" id="btn-start">${t('start')}</button>
        <button class="btn" id="btn-training">${t('training')}</button>
        <button class="btn" id="btn-settings">${t('settings')}</button>
        <div class="help">
          <div><b>WASD</b><span>${t('move')}</span></div>
          <div><b>ESPACIO</b><span>${t('jump')}</span></div>
          <div><b>CLIC</b><span>${t('fireAds')}</span></div>
          <div><b>SHIFT / CTRL</b><span>${t('shiftCtrl')}</span></div>
          <div><b>1–4 / Q</b><span>${t('weapons')}</span></div>
          <div><b>R / TAB / M</b><span>${t('reloadTab')}</span></div>
        </div>
        <div class="foot">${t('foot')}</div>
        <div class="credit">${t('credit')}</div>
      </div>

      <!-- 设置 -->
      <div id="settings">
        <div class="panel" id="settings-panel"></div>
      </div>

      <!-- 暂停 -->
      <div id="pause">
        <div class="panel">
          <h2>${t('paused')}</h2>
          <button class="btn" id="btn-resume">${t('resume')}</button>
          <button class="btn" id="btn-pause-settings">${t('settings')}</button>
          <button class="btn danger" id="btn-to-menu">${t('toMenu')}</button>
        </div>
      </div>

      <!-- HUD -->
      <div id="hud">
        <div id="hp">
          <div class="num" id="hp-num">100</div>
          <div class="bars">
            <div class="bar hpbar"><i id="hp-fill" style="width:100%"></i></div>
            <div class="bar armbar"><i id="arm-fill" style="width:100%"></i></div>
          </div>
          <div id="kills"></div>
        </div>
        <div id="ammo">
          <div class="wpn" id="ammo-name">M4A1</div>
          <div class="cnt"><span id="ammo-mag">30</span><small> / ∞</small></div>
          <div class="reload" id="ammo-reload"></div>
        </div>
        <div id="timer">
          <div class="t" id="timer-t">08:00</div>
          <div class="goal" id="timer-goal">${t('target')}</div>
        </div>
        <div id="mini-score" class="panel"></div>
        <div id="feed"></div>
        <div id="announce"></div>
        <div id="countdown"></div>
        <div id="death">
          <div class="who" id="death-who"></div>
          <div class="hs" id="death-hs"></div>
          <div class="timer" id="death-timer"></div>
        </div>
        <div id="scoreboard"></div>
        <div id="end">
          <h1 id="end-title">${t('defeat')}</h1>
          <div class="rank-line" id="end-rank"></div>
          <div class="stat-line" id="end-stats"></div>
          <div class="mvp" id="end-mvp"></div>
          <div class="actions">
            <button class="btn primary" id="btn-rematch">${t('rematch')}</button>
            <button class="btn" id="btn-end-menu">${t('toMenu')}</button>
          </div>
        </div>
        <div id="train-stats" style="display:none"></div>
        <div id="hint">${t('hint')}</div>
        <div id="credit">${t('credit')}</div>
      </div>
      <div id="fps">60</div>
    `

    this.el = {
      menu: $('menu'), settings: $('settings'), pause: $('pause'), hud: $('hud'),
      hpNum: $('hp-num'), hpFill: $('hp-fill'), armFill: $('arm-fill'), kills: $('kills'),
      ammoName: $('ammo-name'), ammoMag: $('ammo-mag'), ammoReload: $('ammo-reload'),
      timerT: $('timer-t'), timerGoal: $('timer-goal'), miniScore: $('mini-score'),
      feed: $('feed'), announce: $('announce'), countdown: $('countdown'),
      death: $('death'), deathWho: $('death-who'), deathHs: $('death-hs'), deathTimer: $('death-timer'),
      scoreboard: $('scoreboard'), end: $('end'), endTitle: $('end-title'),
      endRank: $('end-rank'), endStats: $('end-stats'), endMvp: $('end-mvp'),
      hint: $('hint'), fps: $('fps'), trainStats: $('train-stats'),
    }
    this.hudCanvas = $('hudCanvas')
    this.hudCtx = this.hudCanvas.getContext('2d')
    this.minimapCanvas = $('minimap')
    this.minimapCtx = this.minimapCanvas.getContext('2d')
    this.minimapCanvas.width = 140
    this.minimapCanvas.height = 108

    $('btn-start').addEventListener('click', () => this.onStart())
    $('btn-training').addEventListener('click', () => this.onTraining())
    $('btn-settings').addEventListener('click', () => this.openSettings())
    $('btn-resume').addEventListener('click', () => this.onResume())
    $('btn-pause-settings').addEventListener('click', () => this.openSettings())
    $('btn-to-menu').addEventListener('click', () => this.onToMenu())
    $('btn-rematch').addEventListener('click', () => this.onRematch())
    $('btn-end-menu').addEventListener('click', () => this.onToMenu())
    this.bindQuickRespawn()
    this.bindLanguage()
  },

  rebuild() {
    this.build()
    this.showMenu()
  },

  bindLanguage() {
    document.querySelectorAll('[data-lang]').forEach((el) => {
      el.addEventListener('click', () => setLanguage(el.dataset.lang))
    })
  },

  /* 回调（由 main 注入） */
  onStart: null,
  onTraining: null,
  onResume: null,
  onToMenu: null,
  onRematch: null,

  /* ================ 设置面板 ================ */
  openSettings() {
    this.bindSettings()
    this.el.settings.style.display = 'flex'
    audio.uiClick()
  },
  closeSettings() {
    this.el.settings.style.display = 'none'
    audio.uiClick()
  },

  bindSettings() {
    const panel = $('settings-panel')
    const swatches = [
      ['#ffffff', t('swatchWhite')], ['#7ea2ff', t('swatchCyan')], ['#ff5c6c', t('swatchRed')],
      ['#59d47c', t('swatchGreen')], ['#f5b942', t('swatchYellow')], ['#ff7fd0', t('swatchPink')],
    ]
    const range = (label, key, min, max, step, fmt) => `
      <div class="row"><span>${label}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-key="${key}">
        <span class="val" data-val="${key}">${fmt ? fmt(settings[key]) : settings[key]}</span>
      </div>`
    const seg = (label, key, options) => `
      <div class="row"><span>${label}</span><div class="seg" data-seg="${key}">
        ${options.map(([v, txt]) => `<button data-v="${v}" class="${settings[key] === v || String(settings[key]) === String(v) ? 'on' : ''}">${txt}</button>`).join('')}
      </div></div>`

    panel.innerHTML = `
      <h2>${t('settings')}</h2>
      ${range(t('setSens'), 'sens', 0.1, 4, 0.05, (v) => v.toFixed(2))}
      ${document.body.classList.contains('touch') ? range(t('setTouchSens'), 'touchSens', 0.3, 3, 0.05, (v) => v.toFixed(2)) : ''}
      ${range(t('setFov'), 'fov', 90, 120, 1, (v) => v + '°')}
      ${range(t('setMaster'), 'volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      ${range(t('setSfx'), 'volSfx', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      ${range(t('setUi'), 'volUI', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      ${range(t('setMusic'), 'volMusic', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      <div class="row"><span>${t('setCross')}</span><div class="swatches" data-swatches>
        ${swatches.map(([c, n]) => `<div class="swatch ${settings.crossColor === c ? 'on' : ''}" style="background:${c}" data-c="${c}" title="${n}"></div>`).join('')}
      </div></div>
      ${seg(t('setShowCross'), 'showCross', [[true, t('on')], [false, t('off')]])}
      ${seg(t('setBots'), 'bots', [[3, '3'], [4, '4'], [5, '5'], [7, '7']])}
      ${seg(t('setQuality'), 'quality', [['high', t('qualityHigh')], ['medium', t('qualityMedium')], ['low', t('qualityLow')]])}
      ${seg(t('setResolution'), 'resolution', [[70, '70%'], [85, '85%'], [100, '100%']])}
      ${seg(t('setInvert'), 'invertY', [[false, t('off')], [true, t('on')]])}
      ${seg(t('setFps'), 'showFps', [[true, t('on')], [false, t('off')]])}
      <div class="settings-actions"><button class="btn small" id="btn-settings-close">${t('done')}</button></div>
    `

    panel.querySelectorAll('input[type=range]').forEach((el) => {
      el.addEventListener('input', () => {
        const v = parseFloat(el.value)
        settings[el.dataset.key] = v
        panel.querySelector(`[data-val="${el.dataset.key}"]`).textContent =
          (el.dataset.key === 'sens' || el.dataset.key === 'touchSens') ? v.toFixed(2) : el.dataset.key === 'fov' ? v + '°' : Math.round(v * 100) + '%'
        saveSettings()
        this.onSettingsChange()
      })
    })
    panel.querySelectorAll('[data-seg]').forEach((segEl) => {
      segEl.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          const key = segEl.dataset.seg
          const v = b.dataset.v === 'true' ? true : b.dataset.v === 'false' ? false : b.dataset.v
          settings[key] = v
          segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
          saveSettings()
          this.onSettingsChange()
          audio.uiClick()
        })
      })
    })
    panel.querySelectorAll('[data-swatches] .swatch').forEach((s) => {
      s.addEventListener('click', () => {
        settings.crossColor = s.dataset.c
        panel.querySelectorAll('[data-swatches] .swatch').forEach((x) => x.classList.toggle('on', x === s))
        saveSettings()
      })
    })
    $('btn-settings-close').addEventListener('click', () => this.closeSettings())
  },

  onSettingsChange() {
    if (this.applySettings) this.applySettings()
  },

  /* ================ 菜单 / 状态显示 ================ */
  showMenu() {
    this.el.menu.style.display = 'flex'
    this.el.hud.style.display = 'none'
    this.el.pause.style.display = 'none'
    this.el.end.style.display = 'none'
    this.el.death.style.display = 'none'
    this.el.settings.style.display = 'none'
    this.minimapCanvas.style.display = 'none'
  },

  showHUD() {
    this.el.menu.style.display = 'none'
    this.el.hud.style.display = 'block'
    this.el.pause.style.display = 'none'
    this.el.end.style.display = 'none'
    this.minimapCanvas.style.display = settings.showMinimap ? 'block' : 'none'
    this.hintT = 14
    this.el.hint.style.display = 'block'
  },

  showTraining(show) {
    this.el.trainStats.style.display = show ? 'block' : 'none'
    if (!show) this.el.trainStats.textContent = ''
  },

  setHP(hp, armor) {
    this.el.hpNum.textContent = Math.max(0, Math.ceil(hp))
    this.el.hpFill.style.width = Math.max(0, hp) + '%'
    this.el.armFill.style.width = Math.max(0, armor) + '%'
    this.el.hpNum.style.color = hp > 30 ? '#fff' : '#ff5c6c'
  },

  setAmmo(mag, weaponNameText, reloading, ads, isKnife) {
    if (isKnife) {
      this.el.ammoMag.textContent = '🔪'
      this.el.ammoName.textContent = weaponNameText + ' · ' + t('knifeHint')
      this.el.ammoReload.textContent = ''
    } else {
      this.el.ammoMag.textContent = mag
      this.el.ammoName.textContent = weaponNameText + (ads > 0.5 ? t('ads') : '')
      this.el.ammoReload.textContent = reloading ? t('reloading') : ''
    }
  },

  setTimer(txt, goalTxt) {
    this.el.timerT.textContent = txt
    if (goalTxt) this.el.timerGoal.textContent = goalTxt
  },

  setCountdown(text, go = false) {
    const el = this.el.countdown
    if (text === null) { el.style.display = 'none'; return }
    el.style.display = 'flex'
    el.textContent = text
    el.classList.toggle('go', go)
  },

  announce(text, gold = false, cls = '', dur = 1900) {
    const el = this.el.announce
    clearTimeout(this.announceT)
    el.innerHTML = `<div class="big ${gold ? 'gold' : ''} ${cls}">${text}</div>`
    this.announceT = setTimeout(() => { el.innerHTML = '' }, dur)
  },

  announceStreak(streak) {
    if (streak < 2) return
    const label = streak >= 5 ? t('streak5') : streak === 4 ? t('streak4') : streak === 3 ? t('streak3') : t('streak2')
    if (streak >= 5) this.announce(label, true, 'ace', 2600)
    else if (streak >= 3) this.announce(label, true, 'streak', 1900)
    else this.announce(label, false, 'streak', 1500)
  },

  aceFlash() {
    this.aceFlashT = 0.55
  },

  addKillIcon(streak) {
    const el = this.el.kills
    if (streak === 1) el.innerHTML = ''
    const icon = document.createElement('div')
    icon.className = 'kicon' + (streak >= 3 ? ' gold' : '')
    if (streak >= 5) icon.classList.add('hot')
    el.appendChild(icon)
    this.killFlash = 0.16
    clearTimeout(this._killIconT)
    this._killIconT = setTimeout(() => {
      el.classList.add('out')
      setTimeout(() => { el.innerHTML = ''; el.classList.remove('out') }, 400)
    }, 9000)
  },

  addFeed(killer, victim, head, weaponId, killerMe, victimMe) {
    const el = this.el.feed
    const g = weaponId === 'deagle' ? 'dg' : weaponId === 'op' ? 'op' : weaponId === 'knife' ? 'knife' : 'm4'
    const gn = weaponName(weaponId)
    const div = document.createElement('div')
    div.className = 'entry' + (killerMe || victimMe ? ' me' : '')
    div.innerHTML = `
      <span class="killer">${killer}</span>
      <span class="gun ${g}">${gn}</span>
      <span class="victim">${victim}</span>
      ${head ? `<span class="hs">${t('headshot')} ☠</span>` : ''}`
    el.prepend(div)
    while (el.children.length > 6) el.lastChild.remove()
    setTimeout(() => {
      div.classList.add('out')
      setTimeout(() => div.remove(), 280)
    }, 4200)
  },

  showDeath(killer, head, weaponId, secs) {
    this.el.deathWho.innerHTML = t('deathBy', { killer: `<b>${killer}</b>` })
    this.el.deathHs.textContent = head ? t('headshot') : weaponName(weaponId)
    this.el.deathTimer.textContent = secs
    this.el.death.style.display = 'flex'
  },

  updateDeathTimer(secs) {
    this.el.deathTimer.textContent = secs
  },

  hideDeath() {
    this.el.death.style.display = 'none'
  },

  bindQuickRespawn() {
    this.el.death.addEventListener('click', () => {
      if (this.game.state === 'play' && !this.game.player.alive) {
        this.game.instantRespawn()
      }
    })
  },

  showPause(show) {
    this.el.pause.style.display = show ? 'flex' : 'none'
  },

  showEnd(data) {
    const st = data.stats
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0
    this.el.endTitle.textContent = data.won ? t('victory') : t('defeat')
    this.el.endTitle.style.color = data.won ? '#f5b942' : '#7ea2ff'
    this.el.endRank.textContent = t('yourRank', { rank: data.rank, total: data.total })
    this.el.endStats.innerHTML = `
      <div class="stat"><div class="v">${st.kills}</div><div class="l">${t('statKills')}</div></div>
      <div class="stat"><div class="v">${st.deaths}</div><div class="l">${t('statDeaths')}</div></div>
      <div class="stat"><div class="v">${st.deaths ? (st.kills / st.deaths).toFixed(2) : '∞'}</div><div class="l">${t('statKd')}</div></div>
      <div class="stat"><div class="v">${st.headshots}</div><div class="l">${t('statHs')}</div></div>
      <div class="stat"><div class="v">${acc}%</div><div class="l">${t('statAcc')}</div></div>
      <div class="stat"><div class="v">${st.bestStreak}</div><div class="l">${t('statStreak')}</div></div>
      <div class="stat"><div class="v">${st.hsRate}%</div><div class="l">${t('statHsRate')}</div></div>
      <div class="stat"><div class="v">${st.meleeKills}</div><div class="l">${t('statMelee')}</div></div>`
    this.el.endMvp.textContent = t('mvpLine', { name: data.mvpName, kills: data.mvpKills })
    this.el.end.style.display = 'flex'
    this.minimapCanvas.style.display = 'none'
  },

  /* ================ 计分板 ================ */
  renderMiniScore(rows, playerRank) {
    if (!rows.length) return
    const top = rows.slice(0, 3)
    this.el.miniScore.innerHTML = `<div class="rank">${t('rank', { rank: playerRank })}</div>` +
      top.map((r, i) => `<div class="row ${r.isPlayer ? 'me' : ''}">
        <span>${i + 1}. ${r.name}</span><span class="k">${r.kills}</span></div>`).join('')
  },

  renderScoreboard(rows) {
    if (!rows.length) return
    const sb = this.el.scoreboard
    sb.innerHTML = `
      <div class="panel" style="min-width:520px;padding:24px 30px;text-align:center">
        <h2 style="letter-spacing:8px;color:#7ea2ff;margin-bottom:14px">${t('scoreboard')}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="color:#8b95a8;font-size:11px;letter-spacing:2px">
            <td style="padding:4px 0">#</td><td>${t('sbPlayer')}</td><td>${t('sbKills')}</td><td>${t('sbDeaths')}</td><td>K/D</td><td>${t('sbHead')}</td><td>${t('sbStreak')}</td><td>${t('sbPing')}</td>
          </tr>
          ${rows.map((r, i) => `<tr style="${r.isPlayer ? 'color:#fff;font-weight:700' : 'color:#c8cdd8'}">
            <td style="padding:5px 0">${i + 1}</td>
            <td>${r.name}${r.mvp ? ` <span style="color:#f5b942">★</span>` : ''}</td>
            <td style="color:#7ea2ff;font-family:Consolas,monospace">${r.kills}</td>
            <td style="font-family:Consolas,monospace">${r.deaths}</td>
            <td style="font-family:Consolas,monospace">${r.deaths ? (r.kills / r.deaths).toFixed(2) : '—'}</td>
            <td style="font-family:Consolas,monospace">${r.hs ?? 0}</td>
            <td>${r.streak > 1 ? r.streak + ' ' + t('sbStreak').toLowerCase() : '—'}</td>
            <td style="font-family:Consolas,monospace;color:#8b95a8">${r.ping}ms</td>
          </tr>`).join('')}
        </table>
      </div>`
    sb.style.display = 'flex'
  },

  hideScoreboard() {
    this.el.scoreboard.style.display = 'none'
  },

  flashHurt(head) {
    this.hurtFlash = { t: 0.5, head: !!head }
  },

  /* ================ 每帧更新 ================ */
  update(ctx, dt, time) {
    const { player, game } = ctx
    const now = performance.now()

    if (game.state === 'play') {
      this.setHP(player.hp, player.armor)
      this.setAmmo(player.mag, weaponName(player.weaponId), player.reloading, player.ads, player.weaponId === 'knife')
      const secs = Math.max(0, game.timeLeft)
      this.setTimer(`${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}`,
        `${t('target')} · ${t('you')} ${player.kills}`)
    } else if (game.state === 'train') {
      this.setHP(player.hp, player.armor)
      this.setAmmo('∞', weaponName(player.weaponId), player.reloading, player.ads, player.weaponId === 'knife')
      const st = player.stats
      const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0
      this.setTimer(`${String(Math.floor(game.trainT / 60)).padStart(2, '0')}:${String(Math.floor(game.trainT % 60)).padStart(2, '0')}`, t('trainTimer'))
      this.el.trainStats.textContent = t('trainStats', { hits: st.hits, headshots: st.headshots, acc })
    }

    if (this.hintT > 0) {
      this.hintT -= dt
      if (this.hintT <= 0) this.el.hint.style.display = 'none'
    }

    if (input.down['KeyM']) {
      settings.showMinimap = !settings.showMinimap
      saveSettings()
      this.minimapCanvas.style.display = settings.showMinimap && game.state !== 'menu' && game.state !== 'end' ? 'block' : 'none'
    }
    this.drawMinimap(ctx)
    this.drawHudCanvas(ctx, dt)

    if (now - (this._scoreT || 0) > 400 && game.state === 'play') {
      this._scoreT = now
      const rows = game.scoreboardRows()
      this.renderMiniScore(rows, rows.findIndex((r) => r.isPlayer) + 1)
    }

    if (settings.showFps) {
      this._fpsT = (this._fpsT || 0) + dt
      this._fpsC = (this._fpsC || 0) + 1
      if (this._fpsT >= 0.5) {
        this.el.fps.textContent = Math.round(this._fpsC / this._fpsT)
        this.el.fps.style.display = 'block'
        this._fpsT = 0
        this._fpsC = 0
      }
    } else this.el.fps.style.display = 'none'

    if (input.held['Tab'] && game.state === 'play') {
      if (!this._sbOpen) { this.renderScoreboard(game.scoreboardRows()); this._sbOpen = true }
    } else if (this._sbOpen) {
      this.hideScoreboard()
      this._sbOpen = false
    }
  },

  drawMinimap(ctx) {
    const { player, bots, game } = ctx
    const g = this.minimapCtx
    const S = 2.4
    const ox = 70, oy = 54
    g.clearRect(0, 0, 140, 108)
    g.fillStyle = 'rgba(10,14,20,0.35)'
    g.fillRect(0, 0, 140, 108)
    for (const r of this.minimapRects) {
      g.fillStyle = r.type === 'oneWay' ? 'rgba(140,150,170,0.35)' : 'rgba(96,106,128,0.8)'
      g.fillRect(ox + r.x * S - (r.w * S) / 2, oy + r.z * S - (r.d * S) / 2, r.w * S, r.d * S)
    }
    g.fillStyle = 'rgba(245,185,66,0.5)'
    for (const s of CFG.spawns) {
      g.beginPath()
      g.arc(ox + s[0] * S, oy + s[1] * S, 1.6, 0, Math.PI * 2)
      g.fill()
    }
    const now = performance.now()
    if (game.state !== 'train' && now - (this._minimapScan || 0) > 350) {
      this._minimapScan = now
      const vis = new Set()
      for (const b of bots.list) {
        if (!b.alive) continue
        const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z
        const d = Math.hypot(dx, dz)
        if (d > 40) continue
        const dir = [dx / d, (1.2 - 1.62) / d, dz / d]
        let blocked = false
        for (const box of this.minimapRects) {
          if (rayBox([player.pos.x, 1.62, player.pos.z], dir, { min: [box.x - box.w / 2, 0, box.z - box.d / 2], max: [box.x + box.w / 2, 5.5, box.z + box.d / 2] }) !== -1) {
            blocked = true
            break
          }
        }
        if (!blocked) vis.add(b)
      }
      this._minimapVis = vis
    }
    if (game.state !== 'train') {
      g.fillStyle = '#ff5c6c'
      for (const b of this._minimapVis || []) {
        g.beginPath()
        g.arc(ox + b.pos.x * S, oy + b.pos.z * S, 2.4, 0, Math.PI * 2)
        g.fill()
      }
    }
    if (game.state === 'train' && game.training) {
      g.fillStyle = '#59d47c'
      for (const tgt of game.training.targets) {
        g.beginPath()
        g.arc(ox + tgt.pos.x * S, oy + tgt.pos.z * S, 2.2, 0, Math.PI * 2)
        g.fill()
      }
    }
    if (player.alive) {
      g.save()
      g.translate(ox + player.pos.x * S, oy + player.pos.z * S)
      g.rotate(player.yaw)
      g.fillStyle = '#7ea2ff'
      g.beginPath()
      g.moveTo(0, -5)
      g.lineTo(3.4, 3.4)
      g.lineTo(-3.4, 3.4)
      g.closePath()
      g.fill()
      g.restore()
    }
  },

  drawHudCanvas(ctx, dt) {
    const { player, game } = ctx
    const g = this.hudCtx
    const w = window.innerWidth
    const h = window.innerHeight
    if (this.hudCanvas.width !== w) this.hudCanvas.width = w
    if (this.hudCanvas.height !== h) this.hudCanvas.height = h
    g.clearRect(0, 0, w, h)
    if (!settings.showCross || game.state !== 'play' || !player.alive) return

    const cx = w / 2, cy = h / 2

    if (player.weaponId === 'op' && player.ads > 0.8) {
      this.drawScope(g, cx, cy, Math.min(w, h) * 0.3, player.ads)
      return
    }

    if (this.hurtFlash) {
      this.hurtFlash.t -= dt
      const a = Math.min(0.55, this.hurtFlash.t / 0.5)
      const rad = Math.max(w, h) * 0.62
      const grd = g.createRadialGradient(cx, cy, rad * 0.42, cx, cy, rad)
      grd.addColorStop(0, 'rgba(255,40,50,0)')
      grd.addColorStop(1, `rgba(255,40,50,${a})`)
      g.fillStyle = grd
      g.fillRect(0, 0, w, h)
      if (this.hurtFlash.t <= 0) this.hurtFlash = null
    }

    if (this.aceFlashT > 0) {
      this.aceFlashT -= dt
      const a = Math.min(0.5, this.aceFlashT / 0.5)
      const rad = Math.max(w, h) * 0.7
      const grd = g.createRadialGradient(cx, cy, rad * 0.3, cx, cy, rad)
      grd.addColorStop(0, 'rgba(255,60,60,0)')
      grd.addColorStop(1, `rgba(255,80,56,${a * 0.5})`)
      g.fillStyle = grd
      g.fillRect(0, 0, w, h)
    }

    if (player.invuln > 0 && player.alive) {
      if (Math.floor(player.invuln * 6) % 2 === 0) {
        g.fillStyle = 'rgba(255,255,255,0.10)'
        g.fillRect(0, 0, w, h)
      }
    }

    if (this.killFlash > 0) {
      this.killFlash -= dt
      g.fillStyle = `rgba(255,255,255,${Math.min(0.12, this.killFlash)})`
      g.fillRect(0, 0, w, h)
    }

    const spreadRad = player.computeSpread()
    const fovV = 2 * Math.atan(Math.tan((settings.fov * Math.PI / 180) / 2) / camera.aspect)
    const spreadPx = Math.tan(spreadRad) * h / (2 * Math.tan(fovV / 2)) * 2.2
    const gap = 5 + Math.min(26, spreadPx)
    const len = 8
    g.strokeStyle = settings.crossColor
    g.lineWidth = 2.2
    g.lineCap = 'round'
    g.globalAlpha = 0.92
    g.beginPath()
    g.moveTo(cx - gap - len, cy); g.lineTo(cx - gap, cy)
    g.moveTo(cx + gap, cy); g.lineTo(cx + gap + len, cy)
    g.moveTo(cx, cy - gap - len); g.lineTo(cx, cy - gap)
    g.moveTo(cx, cy + gap); g.lineTo(cx, cy + gap + len)
    g.stroke()
    g.globalAlpha = 0.55
    g.fillStyle = settings.crossColor
    g.fillRect(cx - 1.2, cy - 1.2, 2.4, 2.4)
    g.globalAlpha = 1

    this.hitmarks = this.hitmarks.filter((m) => m.t > 0)
    for (const m of this.hitmarks) {
      m.t -= dt
      const k = m.t / 0.16
      const s = 4 + (1 - k) * 5
      g.strokeStyle = m.kill ? '#ff5c6c' : '#ffffff'
      g.lineWidth = 2.4
      g.globalAlpha = Math.min(1, k * 2.5)
      g.beginPath()
      const ang = Math.PI / 4
      for (const dir of [1, -1]) {
        g.moveTo(cx + Math.cos(ang) * s * dir - Math.sin(ang) * s * dir, cy + Math.sin(ang) * s * dir + Math.cos(ang) * s * dir)
        g.lineTo(cx + Math.cos(ang) * (s + 9) * dir - Math.sin(ang) * (s + 9) * dir, cy + Math.sin(ang) * (s + 9) * dir + Math.cos(ang) * (s + 9) * dir)
        g.moveTo(cx + Math.cos(-ang) * s * dir - Math.sin(-ang) * s * dir, cy + Math.sin(-ang) * s * dir + Math.cos(-ang) * s * dir)
        g.lineTo(cx + Math.cos(-ang) * (s + 9) * dir - Math.sin(-ang) * (s + 9) * dir, cy + Math.sin(-ang) * (s + 9) * dir + Math.cos(-ang) * (s + 9) * dir)
      }
      g.stroke()
      g.globalAlpha = 1
    }

    const camQ = camera.quaternion
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQ)
    this.indicators = this.indicators.filter((i) => i.t > 0)
    for (const i of this.indicators) {
      i.t -= dt
      const dx = i.x - player.pos.x, dz = i.z - player.pos.z
      const dl = Math.hypot(dx, dz) || 1
      const lx = (dx / dl) * right.x + (dz / dl) * right.z
      const ly = (dx / dl) * up.x + (dz / dl) * up.z
      const ang = Math.atan2(lx, -ly)
      const R = Math.min(w, h) * 0.3
      const k = i.t / 0.8
      g.strokeStyle = `rgba(255,80,90,${0.75 * k})`
      g.lineWidth = 6
      g.beginPath()
      g.arc(cx, cy, R, ang - 0.5, ang + 0.5)
      g.stroke()
    }
  },

  drawScope(g, cx, cy, R, blend) {
    const w = this.hudCanvas.width, h = this.hudCanvas.height
    g.fillStyle = `rgba(0,0,0,${0.88 * blend})`
    g.beginPath()
    g.rect(0, 0, w, h)
    g.arc(cx, cy, R, 0, Math.PI * 2, true)
    g.fill('evenodd')
    g.strokeStyle = `rgba(0,0,0,${0.95 * blend})`
    g.lineWidth = 4
    g.beginPath()
    g.arc(cx, cy, R + 1, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = `rgba(0,0,0,${0.9 * blend})`
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, cy); g.lineTo(w, cy)
    g.moveTo(cx, 0); g.lineTo(cx, h)
    g.stroke()
    g.strokeStyle = `rgba(255,255,255,${0.85 * blend})`
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(cx - R, cy); g.lineTo(cx + R, cy)
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R)
    g.stroke()
    g.strokeStyle = `rgba(255,255,255,${0.7 * blend})`
    g.lineWidth = 2
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const x1 = cx + Math.cos(a) * (R - 14)
      const y1 = cy + Math.sin(a) * (R - 14)
      const x2 = cx + Math.cos(a) * (R - 5)
      const y2 = cy + Math.sin(a) * (R - 5)
      g.beginPath()
      g.moveTo(x1, y1); g.lineTo(x2, y2)
      g.stroke()
    }
    g.fillStyle = `rgba(255,255,255,${0.9 * blend})`
    g.fillRect(cx - 1, cy - 1, 2, 2)
  },

  fade(show) {
    $('fade').style.opacity = show ? '1' : '0'
  },
}

applyLanguage()
