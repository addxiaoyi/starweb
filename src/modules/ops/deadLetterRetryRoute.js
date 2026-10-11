export function createRetryDeadLetterHandler(deps) {
  const {
    requireDevAdmin,
    jsonErr,
    getStore,
    scheduleSave,
    markKvDirty,
    ensureDeadLetterQueue,
    ensureSecurityCenter,
    appendAsyncTask,
    createId,
  } = deps

  return async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const store = getStore()
    const id = String(req.params.id || '').trim()
    const queue = ensureDeadLetterQueue(store)
    const row = queue.find((item) => String(item?.id || '') === id)
    if (!row) return jsonErr(res, 404, '死信不存在', 'not_found')
    if (row.resolvedAt) {
      return jsonErr(res, 409, '死信已处理', 'already_resolved')
    }

    if (String(row.type || '') === 'security_webhook') {
      const sc = ensureSecurityCenter(store)
      const sourceId = String(row.sourceId || '')
      const item = sc.webhookQueue.find((q) => String(q?.id || '') === sourceId)
      if (item) {
        item.status = 'pending'
        item.attempts = 0
        item.lastError = ''
        item.nextRetryAt = new Date().toISOString()
      }
    } else if (typeof appendAsyncTask === 'function') {
      appendAsyncTask(store, {
        id: createId?.(),
        type: String(row.type || 'dead_letter_retry'),
        status: 'pending',
        payload: row.payload || {},
        sourceDeadLetterId: row.id,
      })
    }

    row.resolvedAt = new Date().toISOString()
    row.retryCount = Number(row.retryCount || 0) + 1
    markKvDirty?.('dead_letter_queue')
    markKvDirty?.('security_center_state')
    scheduleSave?.()
    return res.json({ ok: true, success: true, id: row.id, resolvedAt: row.resolvedAt })
  }
}
