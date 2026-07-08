import { queueSyncDirtyPlayerStatesToPg, syncDirtyPlayerStatesToPg } from './playerStateSync.js'
import { queueSyncUserProfilesToPg, syncDirtyUserProfilesToPg } from './siteUserProfileSync.js'
import { queueSyncSubmissionsToPg, syncDirtySubmissionsToPg } from './submissionSync.js'
import { queueSyncStoreKvToPg, syncDirtyKvToPg } from './storeKvSync.js'

/** store.json 落盘成功后，异步刷新各 PG 脏集 */
export function queuePgAfterJsonSave(store) {
  queueSyncDirtyPlayerStatesToPg(store)
  queueSyncUserProfilesToPg(store)
  queueSyncSubmissionsToPg(store)
  queueSyncStoreKvToPg(store)
}

/** 优雅退出：顺序等待各表同步完成 */
export async function awaitAllPgSync(store) {
  await syncDirtyPlayerStatesToPg(store)
  await syncDirtyUserProfilesToPg(store)
  await syncDirtySubmissionsToPg(store)
  await syncDirtyKvToPg(store)
}
