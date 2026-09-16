/* ================= 轻量事件总线 ================= */
export const ev = {
  _m: new Map(),
  on(e, fn) {
    if (!this._m.has(e)) this._m.set(e, [])
    this._m.get(e).push(fn)
  },
  emit(e, d) {
    const l = this._m.get(e)
    if (l) for (const fn of [...l]) fn(d)
  },
  clear(e) { this._m.delete(e) },
}
