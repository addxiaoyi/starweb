import { flushPlayerStateToPg } from './playerStateSync.js'
import { flushUserProfilesToPg } from './siteUserProfileSync.js'
import { flushSubmissionsToPg } from './submissionSync.js'
import { flushStoreKvToPg } from './storeKvSync.js'

export async function flushAllPgDirty(store) {
  await flushPlayerStateToPg(store)
  await flushUserProfilesToPg(store)
  await flushSubmissionsToPg(store)
  await flushStoreKvToPg(store)
}
