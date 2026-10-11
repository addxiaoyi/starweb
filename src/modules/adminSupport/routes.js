const TICKET_STATES = new Set(['open', 'in_progress', 'resolved', 'closed'])

export function registerAdminSupportRoutes(app, deps) {
  const {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    pushUserNotification,
    appendAuditLog,
  } = deps

  app.get('/api/admin/support/tickets', requireUser, requireAdmin, (req, res) => {
    const store = getStore()
    const status = String(req.query?.status || '').trim().toLowerCase()
    const query = String(req.query?.q || '').trim().toLowerCase()
    let items = Array.isArray(store.supportTickets) ? store.supportTickets.slice() : []
    if (status) items = items.filter((ticket) => String(ticket.status || 'open').toLowerCase() === status)
    if (query) {
      items = items.filter((ticket) => [ticket.subject, ticket.message, ticket.userId, ticket.category]
        .some((value) => String(value || '').toLowerCase().includes(query)))
    }
    items.sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)))
    return jsonOk(res, { items, total: items.length })
  })

  app.patch('/api/admin/support/tickets/:id', requireUser, requireAdmin, (req, res) => {
    const store = getStore()
    const ticket = (Array.isArray(store.supportTickets) ? store.supportTickets : [])
      .find((row) => String(row.id) === String(req.params.id || ''))
    if (!ticket) return jsonErr(res, 404, '工单不存在', 'not_found')

    const status = String(req.body?.status || ticket.status || 'open').trim().toLowerCase()
    const reply = String(req.body?.reply || '').trim()
    if (!TICKET_STATES.has(status)) return jsonErr(res, 400, '工单状态无效', 'validation_error', { field: 'status' })
    if (reply.length > 2000) return jsonErr(res, 400, '回复不能超过 2000 个字符', 'validation_error', { field: 'reply' })
    if (!reply && status === String(ticket.status || 'open')) return jsonErr(res, 400, '请填写回复或修改状态', 'validation_error')

    ticket.status = status
    ticket.updatedAt = new Date().toISOString()
    ticket.adminReply = reply || ticket.adminReply || ''
    ticket.repliedBy = req.user.id
    if (reply) {
      pushUserNotification(store, ticket.userId, {
        type: 'support_reply',
        title: `工单回复：${ticket.subject}`,
        message: reply,
        metadata: { ticketId: ticket.id, status },
      })
    }
    appendAuditLog('support_ticket_updated', { ticketId: ticket.id, status, replied: Boolean(reply) }, req)
    scheduleSave()
    return jsonOk(res, { ticket })
  })

  app.get('/api/admin/community/messages', requireUser, requireAdmin, (req, res) => {
    const store = getStore()
    const items = Array.isArray(store.shoutbox) ? store.shoutbox.slice() : []
    return jsonOk(res, { items, total: items.length })
  })

  app.delete('/api/admin/community/messages/:id', requireUser, requireAdmin, (req, res) => {
    const store = getStore()
    const items = Array.isArray(store.shoutbox) ? store.shoutbox : []
    const index = items.findIndex((row) => String(row.id) === String(req.params.id || ''))
    if (index < 0) return jsonErr(res, 404, '留言不存在', 'not_found')
    const [removed] = items.splice(index, 1)
    appendAuditLog('community_message_deleted', { messageId: removed.id, authorId: removed.userId }, req)
    scheduleSave()
    return jsonOk(res, { deleted: removed.id })
  })
}
