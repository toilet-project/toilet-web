export const reviewModerationReasonCodes = ['SPAM', 'ABUSE', 'PERSONAL_INFORMATION', 'IRRELEVANT', 'MANIPULATION'] as const

type Guide = {
  title: string
  draft: string
  effective: string
  purpose: string
  protection: string
  criteria: string
  reasons: Record<typeof reviewModerationReasonCodes[number], [string, string]>
  effects: string
  difference: string
  appeal: string
  contact: string
  retention: string
}

const guides: Record<'ko' | 'en' | 'ja' | 'zh-CN' | 'zh-TW', Guide> = {
  ko: {
    title: '4-1. 리뷰 운영 가이드', draft: '검토용 개정안 · 운영 게시·시행 전', effective: '리뷰 운영 가이드 공지·시행',
    purpose: '급똥 리뷰는 실제 화장실 이용 경험을 나누는 공간입니다. 청결, 시설, 이용 편의에 대한 솔직한 평가를 남겨 주세요.',
    protection: '낮은 별점, 불편 사항, 비판 또는 관리자와 의견이 다르다는 이유만으로 리뷰를 삭제하지 않습니다. 본문 없이 별점만 작성한 리뷰도 같은 기준으로 보호합니다.',
    criteria: '관리자는 리뷰 전체와 구체적인 근거를 확인한 뒤 다음 위반에 해당하는 리뷰를 삭제할 수 있습니다. 자동 탐지 결과나 추측만으로 삭제하지 않으며, 근거가 불분명하면 추가 확인합니다.',
    reasons: {
      SPAM: ['광고·스팸', '화장실 이용 경험보다 상품·서비스 홍보, 구매·가입 유도나 광고 링크 제공이 주된 목적인 내용'],
      ABUSE: ['욕설·혐오·괴롭힘', '개인·집단을 향한 모욕, 혐오, 협박, 성희롱 등 명백한 공격. 시설의 청결이나 이용 불편에 대한 비판은 구분합니다.'],
      PERSONAL_INFORMATION: ['개인정보 노출', '본인 또는 타인의 연락처, 상세 주거지, 계정·신원 식별정보 등 공개할 필요가 없는 개인정보'],
      IRRELEVANT: ['화장실 이용과 무관한 내용', '화장실과 무관한 게시글이나 의미 없는 문자 반복. 글이 짧거나 별점만 있다는 이유는 해당하지 않습니다.'],
      MANIPULATION: ['반복·조작 리뷰', '복제·도배·평점 조작을 구체적인 근거로 확인한 리뷰. 비슷한 평점이나 반복 방문만으로 판단하지 않습니다.'],
    },
    effects: '관리자 삭제 시 작성 내용과 평가가 함께 제거되고 공개 리뷰·내 리뷰 및 관련 집계에서 제외됩니다. 관련 경험치와 배지는 다시 계산되며, 같은 화장실의 24시간 작성 제한은 초기화되지 않습니다. 서비스 안에서 삭제한 리뷰를 복구하는 기능은 없습니다.',
    difference: '관리자 삭제는 ‘작성자 정보 지우기’와 다릅니다. 작성자 정보 지우기는 작성자 연결만 해제하며 내용과 평점을 남깁니다. 서비스 DB에서 삭제해도 과거 백업에서 즉시 제거되는 것은 아닙니다.',
    appeal: '삭제 처리에 이의가 있으면 대상 화장실과 리뷰 작성 시점을 알려 문의해 주세요. 문의 내용에 타인의 개인정보를 다시 포함하지 않도록 주의해 주세요.',
    contact: '리뷰 관련 문의', retention: '리뷰 운영 가이드에 따라 위반 리뷰를 관리자 삭제하는 경우에는 내용과 평가도 제거됩니다.',
  },
  en: {
    title: '4-1. Review guidelines', draft: 'Draft for review · Not yet published or in effect', effective: 'Review guidelines announced and effective',
    purpose: 'Geupddong reviews share real restroom experiences. Please give honest feedback about cleanliness, facilities and ease of use.',
    protection: 'A review is not removed solely for a low rating, a complaint, criticism or disagreement with an administrator. Rating-only reviews receive the same protection.',
    criteria: 'An administrator may remove a review for the violations below after examining the whole review and specific evidence. Automated detection or assumptions alone are insufficient; unclear cases require further checking.',
    reasons: {
      SPAM: ['Advertising and spam', 'Content mainly promoting products or services, encouraging purchases or sign-ups, or providing advertising links instead of sharing a restroom experience.'],
      ABUSE: ['Abuse, hate and harassment', 'Clear attacks on a person or group, including insults, hate, threats or sexual harassment. Criticism of cleanliness or inconvenience is distinguished from such attacks.'],
      PERSONAL_INFORMATION: ['Personal information exposure', 'Your own or another person’s contact details, detailed home address, account or identity identifiers, or other personal information unnecessary for publication.'],
      IRRELEVANT: ['Content unrelated to restroom use', 'Unrelated posts or meaningless repeated characters. Brevity or a rating without text is not a violation.'],
      MANIPULATION: ['Repetitive or manipulated reviews', 'Copying, flooding or rating manipulation confirmed by specific evidence. Similar ratings or repeat visits alone do not establish a violation.'],
    },
    effects: 'Administrator removal deletes the text and ratings together and excludes them from public reviews, My reviews and related aggregates. Related experience points and badges are recalculated. The 24-hour writing restriction for the same restroom is not reset. There is no in-service function to restore a removed review.',
    difference: 'Administrator removal differs from “Remove author information”, which disconnects the author but keeps the content and ratings. Deletion from the service database does not immediately erase historical backups.',
    appeal: 'To dispute a removal, contact us with the restroom and the approximate time you wrote the review. Do not repeat another person’s personal information in your enquiry.',
    contact: 'Review enquiries', retention: 'When an administrator removes a violating review under the review guidelines, its content and ratings are also deleted.',
  },
  ja: {
    title: '4-1. レビュー運営ガイド', draft: '検討用改定案 · 公開・施行前', effective: 'レビュー運営ガイドの告知・施行',
    purpose: 'Geupddong のレビューは実際のトイレ利用体験を共有する場です。清潔さ、設備、使いやすさについて率直に評価してください。',
    protection: '低い評価、不便の指摘、批判、管理者との意見の違いだけを理由に削除しません。本文のない評価のみのレビューも同じ基準で保護します。',
    criteria: '管理者はレビュー全体と具体的な根拠を確認し、以下の違反に該当する場合に削除できます。自動検知や推測だけで削除せず、根拠が不明確な場合は追加確認します。',
    reasons: {
      SPAM: ['広告・スパム', '利用体験より商品・サービスの宣伝、購入・登録の勧誘、広告リンクの掲載を主な目的とする内容。'],
      ABUSE: ['暴言・ヘイト・嫌がらせ', '個人や集団への侮辱、ヘイト、脅迫、性的嫌がらせなどの明確な攻撃。清潔さや利用上の不便への批判とは区別します。'],
      PERSONAL_INFORMATION: ['個人情報の露出', '本人や他人の連絡先、詳細な自宅住所、アカウント・本人識別情報など、公開する必要のない個人情報。'],
      IRRELEVANT: ['トイレ利用と無関係な内容', '無関係な投稿や意味のない文字の繰り返し。短文や本文のない評価だけでは該当しません。'],
      MANIPULATION: ['繰り返し・操作されたレビュー', '複製、大量投稿、評価操作を具体的な根拠で確認したもの。評価が似ていることや再訪だけでは判断しません。'],
    },
    effects: '管理者が削除すると投稿文と評価が一緒に削除され、公開レビュー、マイレビュー、関連集計から除外されます。関連する経験値とバッジは再計算されます。同じトイレへの24時間の投稿制限はリセットされません。サービス内で削除済みレビューを復元する機能はありません。',
    difference: '管理者による削除は「投稿者情報を削除」とは異なります。後者は投稿者との紐付けだけを解除し、内容と評価を残します。サービスDBで削除しても過去のバックアップから直ちに消えるわけではありません。',
    appeal: '削除に異議がある場合は、対象トイレと投稿したおおよその日時を添えてお問い合わせください。他人の個人情報を問い合わせに再掲載しないでください。',
    contact: 'レビューのお問い合わせ', retention: '運営ガイドに基づき違反レビューを管理者が削除する場合、内容と評価も削除します。',
  },
  'zh-CN': {
    title: '4-1. 评价管理指南', draft: '供审阅的修订草案 · 尚未发布或生效', effective: '评价管理指南公告并生效',
    purpose: 'Geupddong 评价用于分享真实的卫生间使用体验。请如实评价清洁、设施和使用便利程度。',
    protection: '不会仅因低分、不满、批评或与管理员意见不同而删除评价。仅评分而没有文字的评价也受到相同保护。',
    criteria: '管理员会检查完整评价和具体证据，确认属于以下违规后方可删除。不会仅凭自动检测或猜测删除；依据不明确时会进一步核实。',
    reasons: {
      SPAM: ['广告与垃圾内容', '主要用于推广产品或服务、诱导购买或注册、提供广告链接，而不是分享卫生间体验的内容。'],
      ABUSE: ['辱骂、仇恨与骚扰', '针对个人或群体的侮辱、仇恨、威胁、性骚扰等明确攻击；与对清洁和使用不便的批评加以区分。'],
      PERSONAL_INFORMATION: ['个人信息暴露', '本人或他人的联系方式、详细住址、账户或身份标识等无需公开的个人信息。'],
      IRRELEVANT: ['与卫生间使用无关的内容', '无关帖子或无意义的重复字符。不能仅因简短或只有评分而认定违规。'],
      MANIPULATION: ['重复或操纵评价', '有具体证据确认的复制、刷屏或评分操纵。相似评分或再次到访本身不足以认定。'],
    },
    effects: '管理员删除时，文字和评分会一并移除，并从公开评价、我的评价及相关统计中排除。相关经验值和徽章会重新计算。同一卫生间的24小时评价限制不会重置。服务内不提供恢复已删除评价的功能。',
    difference: '管理员删除不同于“移除作者信息”；后者只解除作者关联，内容和评分仍保留。从服务数据库删除并不意味着立即从历史备份中清除。',
    appeal: '如对删除有异议，请提供目标卫生间及大致评价时间并联系我们。请勿在咨询中再次包含他人的个人信息。',
    contact: '评价咨询', retention: '管理员按评价管理指南删除违规评价时，内容和评分也会移除。',
  },
  'zh-TW': {
    title: '4-1. 評論管理指南', draft: '供審閱的修訂草案 · 尚未發布或生效', effective: '評論管理指南公告及生效',
    purpose: 'Geupddong 評論用於分享真實的廁所使用體驗。請如實評價清潔、設施及使用便利程度。',
    protection: '不會僅因低分、不滿、批評或與管理員意見不同而刪除評論。只有評分而沒有文字的評論亦受相同保護。',
    criteria: '管理員會檢查完整評論及具體證據，確認屬於以下違規後才可刪除。不會僅憑自動偵測或猜測刪除；依據不明確時會進一步核實。',
    reasons: {
      SPAM: ['廣告與垃圾內容', '主要用於推廣產品或服務、誘導購買或註冊、提供廣告連結，而非分享廁所體驗的內容。'],
      ABUSE: ['辱罵、仇恨與騷擾', '針對個人或群體的侮辱、仇恨、威脅、性騷擾等明確攻擊；與對清潔及使用不便的批評加以區分。'],
      PERSONAL_INFORMATION: ['個人資料外洩', '本人或他人的聯絡方式、詳細住址、帳戶或身分識別資料等無須公開的個人資料。'],
      IRRELEVANT: ['與廁所使用無關的內容', '無關文章或無意義的重複字元。不能僅因簡短或只有評分而認定違規。'],
      MANIPULATION: ['重複或操縱評論', '有具體證據確認的複製、洗版或評分操縱。相似評分或再次到訪本身不足以認定。'],
    },
    effects: '管理員刪除時，文字及評分會一併移除，並從公開評論、我的評論及相關統計中排除。相關經驗值及徽章會重新計算。同一廁所的24小時評論限制不會重設。服務內不提供復原已刪除評論的功能。',
    difference: '管理員刪除不同於「移除作者資料」；後者只解除作者連結，內容及評分仍會保留。從服務資料庫刪除不代表立即從過往備份中清除。',
    appeal: '如對刪除有異議，請提供目標廁所及大約評論時間並聯絡我們。請勿在查詢中再次包含他人的個人資料。',
    contact: '評論查詢', retention: '管理員按評論管理指南刪除違規評論時，內容及評分亦會移除。',
  },
}
// Hong Kong uses the existing Traditional Chinese policy translation.
export const reviewModerationGuide = { ...guides, 'zh-HK': guides['zh-TW'] }
