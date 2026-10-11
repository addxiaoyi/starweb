const CATALOG_SUFFIX_LENGTH = 4

function isPlayerSubmission(item) {
  return item?.source === 'submission'
    || Boolean(item?.submissionId)
    || String(item?.id || '').startsWith('sub_')
}

export function hasVerifiedSkinName(item) {
  return isPlayerSubmission(item) || item?.source === 'plugin-archive' || item?.nameVerified === true
}

export function resolvePublicSkinName(item) {
  const name = String(item?.name || '').trim()
  if ((hasVerifiedSkinName(item) || item?.nameSource === 'ai') && name) return name

  const id = String(item?.id || '').trim()
  const suffix = id.slice(-CATALOG_SUFFIX_LENGTH) || '未命名'
  return `目录皮肤 · ${suffix}`
}
