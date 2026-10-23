import { acknowledgeAwardNotices, fetchAwardNotices } from '../api/growthAwardNotices'
import { createAwardNoticeStore } from './growthAwardNotices'
export const memberAwardNotices = createAwardNoticeStore({ read: fetchAwardNotices, acknowledge: acknowledgeAwardNotices })
