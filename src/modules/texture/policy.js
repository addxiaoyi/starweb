import { hasCapability } from '../../auth/capabilities.js'

export function textureSubmissionStatus(user, reviewEnabled) {
  if (!reviewEnabled || hasCapability(user, 'canSkipSkinReview')) return 'approved'
  return 'pending'
}
