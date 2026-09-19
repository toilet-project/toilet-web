// UI copy only; never apply these replacements to user-authored content.
const pairs = {
  "common.back": [
    "뒤로가기",
    "Back"
  ],
  "common.required": [
    "필수",
    "Required"
  ],
  "common.optional": [
    "선택",
    "Optional"
  ],
  "common.saving": [
    "저장 중…",
    "Saving…"
  ],
  "common.processing": [
    "처리 중…",
    "Processing…"
  ],
  "common.all": [
    "전체",
    "All"
  ],
  "common.edit": [
    "수정하기",
    "Edit"
  ],
  "common.more": [
    "더 보기",
    "Show more"
  ],
  "common.noInfo": [
    "입력 정보 없음",
    "Not provided"
  ],
  "auth.intro": [
    "구글·카카오로 간편하게 로그인하세요.",
    "Continue with Google or Kakao."
  ],
  "auth.consentNote": [
    "첫 가입 시 필수 약관 동의가 필요해요.",
    "You’ll need to accept the required terms when you sign up."
  ],
  "auth.logout": [
    "로그아웃",
    "Log out"
  ],
  "auth.checking": [
    "로그인 상태를 확인하고 있어요.",
    "Checking your login…"
  ],
  "auth.expired": [
    "로그인이 만료됐어요. 다시 로그인해 주세요.",
    "Your session expired. Please log in again."
  ],
  "auth.required": [
    "로그인이 필요합니다.",
    "Please log in to continue."
  ],
  "account.profile": [
    "내 프로필",
    "My profile"
  ],
  "account.defaultPhoto": [
    "기본 프로필 이미지",
    "Default profile picture"
  ],
  "account.defaultName": [
    "급똥 사용자",
    "Geupddong user"
  ],
  "account.editProfile": [
    "프로필 수정",
    "Edit profile"
  ],
  "account.nickname": [
    "닉네임",
    "Nickname"
  ],
  "account.nicknameHelp": [
    "2~30자 · 다른 사용자와 같은 닉네임도 사용할 수 있어요.",
    "2–30 characters. Nicknames don’t need to be unique."
  ],
  "account.nicknameSaved": [
    "닉네임을 변경했어요.",
    "Nickname updated."
  ],
  "account.nicknameFailed": [
    "닉네임을 저장하지 못했어요.",
    "Could not save your nickname. Please try again."
  ],
  "account.settings": [
    "계정 관리 · 동의 내역",
    "Account & consent"
  ],
  "account.photoLoading": [
    "사진 설정을 불러오는 중…",
    "Loading photo settings…"
  ],
  "policy.links": [
    "서비스 안내",
    "Service information"
  ],
  "policy.terms": [
    "이용약관",
    "Terms (Korean)"
  ],
  "policy.contact": [
    "문의",
    "Contact"
  ],
  "history.close": [
    "{title} 닫기",
    "Close {title}"
  ],
  "history.range": [
    "조회 기간",
    "Date range"
  ],
  "history.allTime": [
    "전체 기간",
    "All time"
  ],
  "history.lastDays": [
    "최근 {days}일",
    "Last {days} days"
  ],
  "history.custom": [
    "날짜 직접 선택",
    "Choose dates"
  ],
  "history.closeDates": [
    "날짜 선택 닫기",
    "Close date picker"
  ],
  "history.count": [
    "{count}개 · 최신순",
    "{count} · Newest first"
  ],
  "history.loaded": [
    "{count}개 불러옴 · 최신순",
    "{count} loaded · Newest first"
  ],
  "history.atLeast": [
    "{count}개 이상 · 최신순",
    "{count}+ · Newest first"
  ],
  "history.end": [
    "모든 내역을 확인했어요",
    "You’re all caught up"
  ],
  "history.from": [
    "시작일",
    "Start date"
  ],
  "history.to": [
    "종료일",
    "End date"
  ],
  "history.previousMonth": [
    "이전 달",
    "Previous month"
  ],
  "history.nextMonth": [
    "다음 달",
    "Next month"
  ],
  "history.chooseFrom": [
    "시작일을 선택해 주세요",
    "Choose a start date"
  ],
  "history.chooseTo": [
    "종료일을 선택한 뒤 적용해 주세요",
    "Choose an end date, then apply"
  ],
  "history.missingDates": [
    "시작일과 종료일을 선택해 주세요.",
    "Choose a start and end date."
  ],
  "history.invalidOrder": [
    "종료일은 시작일 이후로 선택해 주세요.",
    "The end date must be on or after the start date."
  ],
  "history.future": [
    "오늘까지의 날짜를 선택할 수 있어요.",
    "Choose today or an earlier date."
  ],
  "review.satisfaction": [
    "만족도",
    "Satisfaction"
  ],
  "review.cleanliness": [
    "청결도",
    "Cleanliness"
  ],
  "review.starLabel": [
    "{label} {score}점",
    "{label}: {score} out of 5"
  ],
  "review.paper": [
    "화장지",
    "Toilet paper"
  ],
  "review.paperQuestion": [
    "화장지가 있었나요?",
    "Was toilet paper available?"
  ],
  "review.paperYes": [
    "있었어요",
    "Available"
  ],
  "review.paperNo": [
    "없었어요",
    "Not available"
  ],
  "review.paperShortYes": [
    "휴지 있음",
    "Paper available"
  ],
  "review.paperShortNo": [
    "휴지 없음",
    "No paper"
  ],
  "review.wait": [
    "대기시간",
    "Wait time"
  ],
  "review.defaultWait": [
    "기본 0분",
    "Default: 0 min"
  ],
  "review.waitQuestion": [
    "얼마나 기다렸나요?",
    "How long did you wait?"
  ],
  "review.minutes": [
    "{minutes}분",
    "{minutes} min"
  ],
  "review.hourPlus": [
    "1시간 이상",
    "1 hour or more"
  ],
  "review.commentLabel": [
    "한 줄 더 남겨주세요",
    "Anything to add?"
  ],
  "review.commentExample": [
    "예: 깨끗하고 휴지도 넉넉했어요.",
    "For example: Clean, with plenty of toilet paper."
  ],
  "review.personalInfoHint": [
    "이름·연락처 등 개인정보는 적지 말아 주세요.",
    "Please don’t include names, contact details or other personal information."
  ],
  "review.retentionHint": [
    "작성 후 7일 동안 수정할 수 있어요. 작성자 정보를 지워도 리뷰 내용과 평가는 남아요.",
    "You can edit for 7 days. Removing your author details keeps the review text and ratings."
  ],
  "review.edit": [
    "리뷰 수정",
    "Edit review"
  ],
  "review.discardTitle": [
    "작성을 그만둘까요?",
    "Discard your changes?"
  ],
  "review.continue": [
    "계속 작성",
    "Keep writing"
  ],
  "review.discard": [
    "그만두기",
    "Discard"
  ],
  "review.discardHint": [
    "아직 저장하지 않은 내용은 사라져요.",
    "Your unsaved changes will be lost."
  ],
  "review.refreshLocation": [
    "위치 새로고침",
    "Refresh location"
  ],
  "review.footerHint": [
    "별점 두 개와 화장지 유무만 선택하면 돼요",
    "Just two ratings and toilet paper availability"
  ],
  "review.saveEdit": [
    "수정한 내용 저장",
    "Save changes"
  ],
  "review.submit": [
    "리뷰 남기기",
    "Post review"
  ],
  "review.target": [
    "이용한 화장실",
    "Restroom visited"
  ],
  "review.invalidRatings": [
    "만족도와 청결도를 별점으로 선택해 주세요.",
    "Rate both satisfaction and cleanliness."
  ],
  "review.invalidPaper": [
    "화장지 유무를 선택해 주세요.",
    "Select whether toilet paper was available."
  ],
  "review.invalidWait": [
    "대기시간은 0~60분에서 10분 단위로 선택해 주세요.",
    "Choose 0–60 minutes in 10-minute steps."
  ],
  "review.invalidComment": [
    "내용은 200자 이내로 입력해 주세요.",
    "Keep your review within 200 characters."
  ],
  "review.saveFailed": [
    "저장하지 못했어요. 입력 내용은 유지되니 다시 시도해 주세요.",
    "Could not save. Your draft is still here. Please try again."
  ],
  "review.list": [
    "내 리뷰 목록",
    "My review history"
  ],
  "review.loading": [
    "리뷰를 불러오고 있어요.",
    "Loading reviews…"
  ],
  "review.loadingMore": [
    "리뷰를 더 불러오고 있어요.",
    "Loading more reviews…"
  ],
  "review.more": [
    "리뷰 더 보기",
    "More reviews"
  ],
  "review.empty": [
    "이 기간에 남긴 리뷰가 없어요",
    "No reviews in this period"
  ],
  "review.emptyHint": [
    "기간을 바꾸거나 지도에서 리뷰를 남겨보세요.",
    "Choose another period or write a review from the map."
  ],
  "review.average": [
    "만족도·청결도 평균",
    "Average of satisfaction and cleanliness"
  ],
  "review.noCommentSummary": [
    "별점과 선택 항목으로 남긴 리뷰예요.",
    "Ratings and selections only."
  ],
  "review.noComment": [
    "작성한 내용이 없어요.",
    "No written comment."
  ],
  "review.editable": [
    "수정 가능",
    "Editable"
  ],
  "review.expiredShort": [
    "7일 경과",
    "7 days elapsed"
  ],
  "review.deadline": [
    "수정 가능 기한: {date} · 최초 작성 기준",
    "Editable until {date} (Korea time), based on the original posting time"
  ],
  "review.expired": [
    "작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.",
    "The 7-day window for editing or removing author details has ended."
  ],
  "review.detach": [
    "작성자 정보 지우기",
    "Remove author details"
  ],
  "review.detachConfirm": [
    "정보 지우기",
    "Remove details"
  ],
  "review.detachTitle": [
    "리뷰는 그대로 남아요",
    "Your review will remain"
  ],
  "review.detachDetails": [
    "별점·화장지 유무·대기시간과 작성한 글은 삭제되지 않아요. 이 리뷰의 작성자 이름만 ‘익명’으로 바뀝니다.",
    "Your ratings, toilet paper selection, wait time and written text will not be deleted. The author name becomes “Anonymous”."
  ],
  "review.detachWarning": [
    "내 리뷰에서 사라지고 다시 수정하거나 연결을 복구할 수 없어요. 급똥 회원 탈퇴는 아닙니다.",
    "It will disappear from My reviews and cannot be edited or linked back to you. This does not delete your Geupddong account."
  ],
  "review.detachFailed": [
    "작성자 정보를 지우지 못했어요. 다시 확인해 주세요.",
    "Could not remove your author details. Please try again."
  ],
  "review.detached": [
    "작성자 정보만 지웠어요. 글과 평가는 남고, 내 리뷰에서는 제외됐어요.",
    "Author details removed. Your text and ratings remain, but the review is no longer in My reviews."
  ],
  "review.existingHint": [
    "작성한 리뷰 내역이 있습니다. 기존 리뷰를 확인하거나 수정해 주세요.",
    "You already have a review. You can view or edit it here."
  ],
  "review.existingTitle": [
    "작성한 리뷰가 있어요",
    "You already have a review"
  ],
  "review.existingQuestion": [
    "이 화장실에 오늘 작성한 리뷰가 있어요. 기존 리뷰를 확인할까요?",
    "You reviewed this restroom within the last 24 hours. Would you like to see that review?"
  ],
  "review.viewMine": [
    "내 리뷰 보기",
    "View my reviews"
  ],
  "review.saved": [
    "리뷰를 저장했어요",
    "Review saved"
  ],
  "review.savedTitle": [
    "이용 경험을 남겼어요",
    "Thanks for sharing your experience"
  ],
  "review.savedHint": [
    "저장한 리뷰는 내 리뷰에서 다시 확인할 수 있어요.",
    "You can find it in My reviews."
  ],
  "review.backList": [
    "목록으로 돌아가기",
    "Back to list"
  ],
  "review.checkingLocation": [
    "현재 위치를 확인하고 있어요.",
    "Checking your location…"
  ],
  "review.checkingAccess": [
    "작성한 리뷰·로그인 확인 중",
    "Checking login and recent reviews…"
  ],
  "review.testOnly": [
    "테스트 화장실에는 실제 리뷰를 저장하지 않아요.",
    "Real reviews cannot be saved for test restrooms."
  ],
  "review.loadFailed": [
    "리뷰를 불러오지 못했어요. 다시 확인해 주세요.",
    "Could not load reviews. Please try again."
  ],
  "report.statusFilter": [
    "제보 상태 필터",
    "Report status"
  ],
  "report.pending": [
    "대기",
    "Pending"
  ],
  "report.pendingReview": [
    "검토 대기",
    "Pending review"
  ],
  "report.approved": [
    "승인",
    "Approved"
  ],
  "report.rejected": [
    "반려",
    "Rejected"
  ],
  "report.cancelled": [
    "취소",
    "Cancelled"
  ],
  "report.location": [
    "위치 제보",
    "Location report"
  ],
  "report.hours": [
    "개방시간 제보",
    "Opening-hours report"
  ],
  "report.loading": [
    "내 제보를 불러오는 중…",
    "Loading your reports…"
  ],
  "report.empty": [
    "이 기간에 표시할 제보가 없어요",
    "No reports in this period"
  ],
  "report.emptyHint": [
    "기간이나 상태를 바꾸어 확인해 보세요.",
    "Try another date range or status."
  ],
  "report.toilet": [
    "화장실 #{id}",
    "Restroom #{id}"
  ],
  "report.address": [
    "제보 주소",
    "Reported address"
  ],
  "report.openTime": [
    "제보 개방시간",
    "Reported opening hours"
  ],
  "report.reason": [
    "제보 사유",
    "Reason"
  ],
  "report.reviewedAt": [
    "처리 일시",
    "Reviewed at"
  ],
  "report.reviewing": [
    "관리자가 내용을 확인하고 있습니다.",
    "An administrator is reviewing your report."
  ],
  "report.note": [
    "관리자 메모",
    "Administrator’s note"
  ],
  "report.noNote": [
    "별도 메모가 없습니다.",
    "No additional note."
  ],
  "report.networkError": [
    "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 불러와 주세요.",
    "Could not connect. Check your internet connection and try again."
  ],
  "report.loadFailed": [
    "내 제보를 불러오지 못했어요. 잠시 후 다시 불러와 주세요.",
    "Could not load your reports. Please try again shortly."
  ],
  "notification.list": [
    "받은 알림 목록",
    "Notification history"
  ],
  "notification.received": [
    "받은 알림",
    "Received notifications"
  ],
  "notification.readAll": [
    "모두 읽음",
    "Mark all read"
  ],
  "notification.readAllHint": [
    "선택 기간과 관계없이 모든 알림을 읽음 처리",
    "Mark all notifications as read, regardless of date range"
  ],
  "notification.readFailed": [
    "읽음 처리하지 못했어요. 알림을 다시 선택해 주세요.",
    "Could not mark as read. Please select the notification again."
  ],
  "notification.readAllFailed": [
    "모두 읽음 처리하지 못했어요. 다시 시도해 주세요.",
    "Could not mark all as read. Please try again."
  ],
  "notification.loadFailed": [
    "알림을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.",
    "Could not load notifications. Check your connection and try again."
  ],
  "notification.empty": [
    "이 기간에 받은 알림이 없어요",
    "No notifications in this period"
  ],
  "notification.emptyHint": [
    "제보 처리 결과가 생기면 이곳에서 알려드릴게요.",
    "Updates to your reports will appear here."
  ],
  "notification.unread": [
    "읽지 않음",
    "Unread"
  ],
  "notification.loading": [
    "알림을 불러오는 중…",
    "Loading notifications…"
  ],
  "notification.more": [
    "알림 더 보기",
    "More notifications"
  ],
  "notification.approved": [
    "제보가 승인되었습니다",
    "Report approved"
  ],
  "notification.rejected": [
    "제보가 반려되었습니다",
    "Report rejected"
  ],
  "auth.reportLogin": [
    "제보는 로그인 후 이용할 수 있어요.",
    "Log in to send a report."
  ],
  "auth.reportsLogin": [
    "내 제보는 로그인 후 확인할 수 있어요.",
    "Log in to view your reports."
  ],
  "auth.close": [
    "로그인 창 닫기",
    "Close login"
  ],
  "auth.ageNote": [
    "첫 가입 시 만 14세 이상 확인·필수 약관 동의가 필요해요.",
    "To sign up, confirm you are 14 or older and accept the required terms."
  ],
  "policy.privacy": [
    "개인정보 처리방침",
    "Privacy policy (Korean)"
  ],
  "report.reasonRequired": [
    "제보 사유를 입력해 주세요.",
    "Enter a reason for your report."
  ],
  "report.checkAddress": [
    "표시된 주소를 확인해 주세요.",
    "Please check the displayed address."
  ],
  "report.hoursRequired": [
    "변경할 개방 시간을 입력해 주세요.",
    "Enter the updated opening hours."
  ],
  "report.submitFailed": [
    "제보를 접수하지 못했습니다.",
    "Could not send your report. Please try again."
  ],
  "report.title": [
    "정보 제보",
    "Report information"
  ],
  "report.confirmLocation": [
    "위치 제보 확인",
    "Confirm location report"
  ],
  "report.received": [
    "접수 완료",
    "Report received"
  ],
  "report.close": [
    "제보 닫기",
    "Close report"
  ],
  "report.question": [
    "어떤 정보를 알려주실 건가요?",
    "What would you like to report?"
  ],
  "report.target": [
    "제보 대상",
    "Restroom"
  ],
  "report.reviewHint": [
    "관리자가 확인한 뒤 서비스 정보에 반영합니다.",
    "An administrator will review your report before updating the information."
  ],
  "report.locationHint": [
    "지도에서 실제 위치를 지정하고 주소를 확인해요.",
    "Pin the actual location and check its address."
  ],
  "report.hoursHint": [
    "변경된 운영 시간을 알려주세요.",
    "Tell us the updated opening hours."
  ],
  "report.moveMap": [
    "지도를 움직여 핀을 맞춰 주세요",
    "Move the map to place the pin"
  ],
  "report.proposedLocation": [
    "제안 위치",
    "Proposed location"
  ],
  "report.zoomHint": [
    "정확한 위치는 지도를 조금 더 확대해 맞춰 주세요",
    "Zoom in to place the pin accurately"
  ],
  "report.addressLoading": [
    "주소를 확인하는 중…",
    "Checking address…"
  ],
  "report.noAddress": [
    "주소를 찾지 못했습니다.",
    "Address not found."
  ],
  "report.locationExample": [
    "예: 실제 화장실은 건물 동쪽 출입구 옆에 있습니다.",
    "For example: The restroom is beside the east entrance."
  ],
  "report.submitLocation": [
    "위치 제보 접수",
    "Review location report"
  ],
  "report.confirmQuestion": [
    "이 위치와 주소가 맞습니까?",
    "Is this location and address correct?"
  ],
  "report.confirmHint": [
    "핀을 맞춘 위치를 마지막으로 확인해 주세요.",
    "Check the pin location before sending your report."
  ],
  "report.submitting": [
    "접수 중…",
    "Sending…"
  ],
  "report.confirmSubmit": [
    "맞아요, 접수하기",
    "Confirm and send"
  ],
  "report.hoursHeading": [
    "변경된 개방 시간을 알려주세요",
    "What are the updated opening hours?"
  ],
  "report.currentHours": [
    "현재 등록된 시간:",
    "Current hours:"
  ],
  "report.updatedHours": [
    "변경할 개방 시간",
    "Updated opening hours"
  ],
  "report.hoursExample": [
    "예: 09:00 ~ 18:00",
    "For example: 09:00–18:00"
  ],
  "report.reasonExample": [
    "예: 현장 안내문 기준으로 변경되었습니다.",
    "For example: Updated according to the sign on site."
  ],
  "report.submitHours": [
    "개방 시간 제보 접수",
    "Send opening-hours report"
  ],
  "report.complete": [
    "제보를 접수했어요",
    "Report received"
  ],
  "report.completeHint": [
    "처리 상태는 내 제보에서 언제든 확인할 수 있어요.",
    "You can check its status in My reports."
  ],
  "report.viewMine": [
    "내 제보 보기",
    "View my reports"
  ],
  "review.previewSaved": [
    "선택한 화장실 카드에 체험 평가가 반영됐어요.",
    "The restroom card now shows your preview ratings."
  ],
  "review.previewMemory": [
    "프리뷰 메모리 저장 · 실제 DB에 저장되지 않아요.",
    "Preview memory only. Not saved to the live database."
  ]
} as const

type Key = keyof typeof pairs
const dictionary = (index: 0 | 1) => Object.fromEntries(Object.entries(pairs).map(([key, value]) => [key, value[index]])) as Record<Key, string>
export const activityKo = dictionary(0)
export const activityEn = dictionary(1)
