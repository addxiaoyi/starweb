export function createRetryOpsTaskHandler(deps) {
  const { requireDevAdmin, jsonErr, getStore, scheduleSave, markKvDirty, createId } = deps

  return async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const store = getStore()
    const id = String(req.params.id || '').trim()
    const tasks = Array.isArray(store.asyncTasks) ? store.asyncTasks : []
    const row = tasks.find((t) => String(t?.id || '') === id)
    if (!row) return jsonErr(res, 404, '任务不存在', 'not_found')

    row.status = 'pending'
    row.attempts = Number(row.attempts || 0)
    row.lastError = ''
    row.updatedAt = new Date().toISOString()
    row.retryToken = createId?.() || row.retryToken
    markKvDirty?.('async_tasks')
    scheduleSave?.()
    return res.json({ ok: true, success: true, item: row })
  }
}
