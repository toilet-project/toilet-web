import type { Locale } from './locale'
const ko = {
  guestCalculator: '0 XP 기준으로 계산', guestCalculatorNote: '회원 경험치와 별개로 목표 레벨을 미리 계산해요.', moreLevels: '더 높은 레벨 보기', selectGoal: '목표 레벨을 선택해 주세요.',
  home: '마이페이지', homeIntro: '나의 프로필과 성장을 한눈에 확인해요.', profile: '나의 프로필', editProfile: '프로필 수정',
  ranks: ['흰색 휴지', '초록 휴지', '노랑 휴지', '파랑 휴지', '빨강 휴지', '핑크 휴지', '검정 휴지'],
  rankGuide: '등급별 휴지', levelGuide: '레벨별 경험치 · 레벨업 방법', nextRank: '다음에 만날 휴지는?', earnGuide: '경험치 모으는 방법 알아보기',
  nextLevel: '다음 레벨까지', totalXp: '지금까지 모은 경험치', progress: '다음 레벨을 향해 차곡차곡', growthMessage: '도움 되는 화장실 리뷰 하나, 나의 성장도 한 걸음.',
  preparing: '레벨·경험치 기능을 준비하고 있어요.', loading: '나의 성장 기록을 확인하고 있어요.', error: '성장 기록을 불러오지 못했어요.', retry: '다시 시도', expired: '로그인 상태를 다시 확인해 주세요.', login: '로그인', checkInError: '오늘의 접속 경험치를 확인하지 못했어요.',
  collection: '나의 배지', collected: '획득한 배지', emptyBadges: '아직 획득한 배지가 없어요. 화장실 리뷰로 첫 배지를 모아보세요.', regions: '지역별 리뷰 기록', facilities: '화장실', districts: '동네 배지',
  collectionTitle: '나의 다음 휴지는?', choose: '휴지를 누르면 자세히 볼 수 있어요', selected: '선택한 휴지', cumulative: '누적', from: 'XP부터', after40: 'Lv.40 이후에도 경험치와 레벨은 계속 쌓여요.', example: '표시 예시', exampleHeading: '닉네임 옆에, 나의 성장 기록', exampleName: '휴지챙긴고양이', exampleReview: '입구는 건물 오른쪽에 있어요.\n칸 안에 휴지도 충분히 준비되어 있었어요.',
  methodTitle: '경험치를 모으는 방법', methodNote: '작은 기록부터, 차곡차곡', reviewOnce: '화장실별 최초 1회', reviewTitle: '이용한 화장실에 리뷰 남기기', reviewDescription: '현장에서 확인한 화장실 상태를 남겨주세요.', reviewNote: '같은 화장실의 수정·재작성은 중복 지급하지 않아요.', daily: '매일 1회', visitTitle: '오늘도 급똥에 들르기', visitDescription: '로그인한 상태로 하루 한 번 접속해요.', badgeOnce: '배지·메달별 최초 1회', badgeTitle: '새로운 배지와 메달 모으기', badgeDescription: '리뷰로 획득 조건을 채우면 경험치도 받아요.', badgeNote: '배지는 지역별 리뷰의 기록, 휴지 등급은 전체 경험치의 기록이에요.', district: '동네 배지', bronze: '지역 동 메달', silver: '지역 은 메달', gold: '지역 금 메달',
  goalTitle: '목표 레벨까지 얼마나 남았을까요?', memberXp: '내 누적 경험치', targetLevel: '목표 레벨', remaining: '목표까지 더 모을 경험치', loginForGoal: '로그인하면 내 경험치로 계산할 수 있어요.', rangeTitle: '등급 구간별 누적 경험치', rangeNote: '지금까지 모은 전체 XP 기준', rank: '휴지 등급', levels: '레벨 구간', xp: '누적 XP', current: '현재', goal: '목표', rangeFooter: '경험치는 계속 누적돼요. Lv.40 이후에도 레벨은 계속 올라요.',
  growthGuide: '성장 가이드', backMap: '화장실 찾으러 가기', support: '도움 되는 기록이 모여, 모두의 급한 순간을 구해요.', photoSaved: '프로필 사진을 저장했어요.',
} as const
const en = {
  guestCalculator: 'Calculate from 0 XP', guestCalculatorNote: 'Explore a goal without using member experience.', moreLevels: 'Show higher levels', selectGoal: 'Choose a goal level.',
  home: 'My page', homeIntro: 'Your profile and growth, together.', profile: 'My profile', editProfile: 'Edit profile', ranks: ['White roll', 'Green roll', 'Yellow roll', 'Blue roll', 'Red roll', 'Pink roll', 'Black roll'],
  rankGuide: 'Rank collection', levelGuide: 'Experience & leveling up', nextRank: 'Which roll comes next?', earnGuide: 'How to earn experience', nextLevel: 'To the next level', totalXp: 'Total experience', progress: 'One step closer to your next level', growthMessage: 'Each helpful restroom review adds to your story.', preparing: 'Levels and experience are coming soon.', loading: 'Loading your growth record…', error: 'Could not load your growth record.', retry: 'Try again', expired: 'Please check your sign-in status.', login: 'Sign in', checkInError: 'We could not confirm today’s visit experience.', collection: 'My badges', collected: 'Earned badges', emptyBadges: 'No badges yet. Write restroom reviews to earn your first one.', regions: 'Regional review record', facilities: 'restrooms', districts: 'district badges', collectionTitle: 'Which roll comes next?', choose: 'Choose a roll to see its details', selected: 'Selected roll', cumulative: 'Total', from: 'XP required', after40: 'Experience and levels keep growing after Lv.40.', example: 'Display example', exampleHeading: 'A growth record beside your name', exampleName: 'PreparedCat', exampleReview: 'The entrance is on the right of the building.\nThere was plenty of toilet paper in the stall.', methodTitle: 'How to earn experience', methodNote: 'Build your record, step by step', reviewOnce: 'Once per restroom', reviewTitle: 'Review a restroom you used', reviewDescription: 'Share the restroom conditions you checked on site.', reviewNote: 'Editing or rewriting the same restroom review does not earn XP again.', daily: 'Once a day', visitTitle: 'Visit Geupddong today', visitDescription: 'Visit once a day while signed in.', badgeOnce: 'Once per badge or medal', badgeTitle: 'Collect new badges and medals', badgeDescription: 'Meet the review requirements and earn experience too.', badgeNote: 'Badges record local reviews; roll ranks record your total experience.', district: 'District badge', bronze: 'Bronze medal', silver: 'Silver medal', gold: 'Gold medal', goalTitle: 'How far to your goal level?', memberXp: 'My total XP', targetLevel: 'Goal level', remaining: 'Experience still needed', loginForGoal: 'Sign in to calculate using your experience.', rangeTitle: 'Cumulative XP by rank', rangeNote: 'Based on your total experience', rank: 'Roll rank', levels: 'Level range', xp: 'Total XP', current: 'Current', goal: 'Goal', rangeFooter: 'Your experience accumulates. Levels continue after Lv.40.', growthGuide: 'Growth guide', backMap: 'Find a restroom', support: 'Helpful reviews make urgent moments easier for everyone.', photoSaved: 'Profile photo saved.',
}
type GrowthText = Record<Exclude<keyof typeof ko, 'ranks'>, string> & { ranks: readonly string[] }
const ja: GrowthText = {
  guestCalculator: '0 XPから計算', guestCalculatorNote: '会員の経験値とは別に、目標レベルを試算します。', moreLevels: 'さらに高いレベルを表示', selectGoal: '目標レベルを選んでください。',
  home: 'マイページ', homeIntro: 'プロフィールと成長をひと目で確認。', profile: 'マイプロフィール', editProfile: 'プロフィールを編集',
  ranks: ['白いロール', '緑のロール', '黄色いロール', '青いロール', '赤いロール', 'ピンクのロール', '黒いロール'],
  rankGuide: 'ランク別ロール', levelGuide: '経験値・レベルアップ', nextRank: '次に出会うロールは？', earnGuide: '経験値の集め方を見る', nextLevel: '次のレベルまで', totalXp: 'これまでの経験値', progress: '少しずつ、次のレベルへ', growthMessage: '役立つトイレのレビューで、自分も一歩成長。',
  preparing: 'レベル・経験値機能を準備しています。', loading: '成長記録を確認しています。', error: '成長記録を読み込めませんでした。', retry: '再試行', expired: 'ログイン状態を確認してください。', login: 'ログイン', checkInError: '今日のアクセス経験値を確認できませんでした。',
  collection: 'マイバッジ', collected: '獲得したバッジ', emptyBadges: 'まだバッジはありません。トイレのレビューで最初のバッジを集めましょう。', regions: '地域別レビュー記録', facilities: 'トイレ', districts: '地域バッジ',
  collectionTitle: '次のロールはどれ？', choose: 'ロールを選ぶと詳細を確認できます', selected: '選択中のロール', cumulative: '累計', from: 'XPから', after40: 'Lv.40以降も経験値とレベルは上がり続けます。', example: '表示例', exampleHeading: 'ニックネームの横に、成長の記録', exampleName: '紙を持ったねこ', exampleReview: '入口は建物の右側にあります。\n個室にはトイレットペーパーも十分ありました。',
  methodTitle: '経験値の集め方', methodNote: '小さな記録を少しずつ', reviewOnce: 'トイレごとに初回のみ', reviewTitle: '利用したトイレにレビューを書く', reviewDescription: '現地で確認したトイレの状態を教えてください。', reviewNote: '同じトイレのレビューの修正・書き直しでは再付与されません。', daily: '1日1回', visitTitle: '今日もGeupddongへ', visitDescription: 'ログインした状態で1日1回アクセス。', badgeOnce: '各バッジ・メダルにつき初回のみ', badgeTitle: '新しいバッジとメダルを集める', badgeDescription: 'レビューで条件を満たすと経験値も獲得。', badgeNote: 'バッジは地域のレビュー記録、ロールのランクは合計経験値の記録です。', district: '地域バッジ', bronze: '銅メダル', silver: '銀メダル', gold: '金メダル',
  goalTitle: '目標レベルまであとどれくらい？', memberXp: '自分の累計経験値', targetLevel: '目標レベル', remaining: '目標までに必要な経験値', loginForGoal: 'ログインすると自分の経験値で計算できます。', rangeTitle: 'ランク別の累計経験値', rangeNote: 'これまでに集めた合計XPが基準', rank: 'ロールのランク', levels: 'レベル範囲', xp: '累計XP', current: '現在', goal: '目標', rangeFooter: '経験値は累積され、Lv.40以降もレベルが上がります。',
  growthGuide: '成長ガイド', backMap: 'トイレを探す', support: '役立つ記録が集まって、みんなの急なピンチを助けます。', photoSaved: 'プロフィール写真を保存しました。',
}
const zhCn: GrowthText = {
  guestCalculator: '从0 XP开始计算', guestCalculatorNote: '独立于会员经验值，预先计算目标等级。', moreLevels: '查看更高等级', selectGoal: '请选择目标等级。',
  home: '我的页面', homeIntro: '一览个人资料与成长记录。', profile: '我的资料', editProfile: '编辑资料',
  ranks: ['白色纸卷', '绿色纸卷', '黄色纸卷', '蓝色纸卷', '红色纸卷', '粉色纸卷', '黑色纸卷'],
  rankGuide: '纸卷等级', levelGuide: '经验值与升级', nextRank: '下一个纸卷是什么？', earnGuide: '了解如何获得经验值', nextLevel: '距离下一级', totalXp: '累计经验值', progress: '一点一滴迈向下一级', growthMessage: '每一条实用的厕所评价，都是成长的一步。',
  preparing: '等级与经验值功能正在准备中。', loading: '正在查看成长记录。', error: '无法加载成长记录。', retry: '重试', expired: '请确认登录状态。', login: '登录', checkInError: '无法确认今天的访问经验值。',
  collection: '我的徽章', collected: '已获得的徽章', emptyBadges: '暂时还没有徽章。留下厕所评价，收集第一枚徽章吧。', regions: '各地区评价记录', facilities: '厕所', districts: '街区徽章',
  collectionTitle: '我的下一个纸卷', choose: '点击纸卷查看详情', selected: '已选纸卷', cumulative: '累计', from: 'XP起', after40: '达到Lv.40后，经验值和等级仍会继续增长。', example: '展示示例', exampleHeading: '昵称旁的成长记录', exampleName: '带纸的小猫', exampleReview: '入口在建筑物右侧。\n隔间里的卫生纸也很充足。',
  methodTitle: '如何获得经验值', methodNote: '从小小的记录开始积累', reviewOnce: '每个厕所首次一次', reviewTitle: '评价使用过的厕所', reviewDescription: '分享在现场确认的厕所状况。', reviewNote: '修改或重新发表同一厕所的评价不会重复获得经验值。', daily: '每天一次', visitTitle: '今天也来Geupddong看看', visitDescription: '登录后每天访问一次。', badgeOnce: '每枚徽章或奖章首次一次', badgeTitle: '收集新的徽章与奖章', badgeDescription: '通过评价满足条件，还可获得经验值。', badgeNote: '徽章记录各地的评价，纸卷等级记录总经验值。', district: '街区徽章', bronze: '地区铜牌', silver: '地区银牌', gold: '地区金牌',
  goalTitle: '距离目标等级还有多远？', memberXp: '我的累计经验值', targetLevel: '目标等级', remaining: '还需获得的经验值', loginForGoal: '登录后可根据自己的经验值计算。', rangeTitle: '各等级区间的累计经验值', rangeNote: '以累计获得的总XP为准', rank: '纸卷等级', levels: '等级区间', xp: '累计XP', current: '当前', goal: '目标', rangeFooter: '经验值持续累积，达到Lv.40后仍可继续升级。',
  growthGuide: '成长指南', backMap: '寻找厕所', support: '汇集实用的记录，帮助每个人应对急需的时刻。', photoSaved: '头像已保存。',
}
const zhTw: GrowthText = {
  guestCalculator: '從0 XP開始計算', guestCalculatorNote: '獨立於會員經驗值，預先計算目標等級。', moreLevels: '查看更高等級', selectGoal: '請選擇目標等級。',
  home: '我的頁面', homeIntro: '一覽個人資料與成長紀錄。', profile: '我的資料', editProfile: '編輯資料',
  ranks: ['白色紙捲', '綠色紙捲', '黃色紙捲', '藍色紙捲', '紅色紙捲', '粉色紙捲', '黑色紙捲'],
  rankGuide: '紙捲等級', levelGuide: '經驗值與升級', nextRank: '下一個紙捲是什麼？', earnGuide: '了解如何獲得經驗值', nextLevel: '距離下一級', totalXp: '累計經驗值', progress: '一點一滴邁向下一級', growthMessage: '每一則實用的廁所評論，都是成長的一步。',
  preparing: '等級與經驗值功能正在準備中。', loading: '正在查看成長紀錄。', error: '無法載入成長紀錄。', retry: '重試', expired: '請確認登入狀態。', login: '登入', checkInError: '無法確認今天的造訪經驗值。',
  collection: '我的徽章', collected: '已獲得的徽章', emptyBadges: '暫時還沒有徽章。留下廁所評論，收集第一枚徽章吧。', regions: '各地區評論紀錄', facilities: '廁所', districts: '街區徽章',
  collectionTitle: '我的下一個紙捲', choose: '點選紙捲查看詳細資訊', selected: '已選紙捲', cumulative: '累計', from: 'XP起', after40: '達到Lv.40後，經驗值和等級仍會繼續成長。', example: '顯示範例', exampleHeading: '暱稱旁的成長紀錄', exampleName: '帶紙的小貓', exampleReview: '入口在建築物右側。\n隔間裡的衛生紙也很充足。',
  methodTitle: '如何獲得經驗值', methodNote: '從小小的紀錄開始累積', reviewOnce: '每間廁所首次一次', reviewTitle: '評論使用過的廁所', reviewDescription: '分享在現場確認的廁所狀況。', reviewNote: '修改或重新發表同一間廁所的評論不會重複獲得經驗值。', daily: '每天一次', visitTitle: '今天也來Geupddong看看', visitDescription: '登入後每天造訪一次。', badgeOnce: '每枚徽章或獎章首次一次', badgeTitle: '收集新的徽章與獎章', badgeDescription: '透過評論滿足條件，還可獲得經驗值。', badgeNote: '徽章記錄各地的評論，紙捲等級記錄總經驗值。', district: '街區徽章', bronze: '地區銅牌', silver: '地區銀牌', gold: '地區金牌',
  goalTitle: '距離目標等級還有多遠？', memberXp: '我的累計經驗值', targetLevel: '目標等級', remaining: '還需獲得的經驗值', loginForGoal: '登入後可根據自己的經驗值計算。', rangeTitle: '各等級區間的累計經驗值', rangeNote: '以累計獲得的總XP為準', rank: '紙捲等級', levels: '等級區間', xp: '累計XP', current: '目前', goal: '目標', rangeFooter: '經驗值持續累積，達到Lv.40後仍可繼續升級。',
  growthGuide: '成長指南', backMap: '尋找廁所', support: '匯集實用的紀錄，幫助每個人應對急需的時刻。', photoSaved: '大頭貼已儲存。',
}
export function growthText(locale: Locale): GrowthText {
  if (locale === 'ko') return ko
  if (locale === 'ja') return ja
  if (locale === 'zh-CN') return zhCn
  if (locale.startsWith('zh')) return zhTw
  return en
}
