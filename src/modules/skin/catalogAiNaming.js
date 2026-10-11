const MAX_NAME_LENGTH = 24

function isPlayerSubmission(item) {
  return item?.source === 'submission'
    || Boolean(item?.submissionId)
    || String(item?.id || '').startsWith('sub_')
}

function shouldName(item) {
  return !isPlayerSubmission(item)
    && item?.nameVerified !== true
    && String(item?.nameSource || '').trim() !== 'ai'
}

function cleanName(value) {
  const name = String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/["“”]/g, '')
    .trim()
  if (!name || name.length > MAX_NAME_LENGTH) return null
  return name
}

export async function runCatalogAiNamingJob({ store, limit, recognize, now = () => new Date().toISOString(), onProgress = () => {} }) {
  const candidates = (Array.isArray(store.catalog) ? store.catalog : []).filter(shouldName).slice(0, limit)
  const job = { status: 'running', total: candidates.length, completed: 0, named: 0, failed: 0 }
  onProgress(job)

  for (const item of candidates) {
    try {
      const name = cleanName(await recognize(item))
      if (!name) throw new Error('AI did not return a usable name')
      item.name = name
      item.nameSource = 'ai'
      item.aiNamedAt = now()
      job.named += 1
    } catch {
      job.failed += 1
    }
    job.completed += 1
    onProgress(job)
  }

  job.status = 'completed'
  onProgress(job)
  return job
}

export function countAiNamingCandidates(store) {
  return (Array.isArray(store.catalog) ? store.catalog : []).filter(shouldName).length
}
