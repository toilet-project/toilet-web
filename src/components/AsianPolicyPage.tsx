import type { ReactNode } from 'react'
import type { Locale } from '../i18n/locale'
import { koreanPolicySourcePath } from '../i18n/policyReturn'
import { locationSections, pick, policyTitles, t, termsSections, type AsianPolicyKind, type PolicyBlock, type PolicySection, type PolicyText } from '../i18n/asianPolicyData'
import { privacySections } from '../i18n/asianPolicyPrivacy'
import { accountPolicyPublication, policyPublicationAttributes } from '../lib/accountPolicyPublication'
import { reviewPolicyPublication, reviewPolicyPublicationAttributes } from '../lib/reviewPolicyPublication'
import { profilePhotoPolicyPublication, profilePhotoPolicyPublicationAttributes } from '../lib/profilePhotoPolicyPublication'
import { BrandWordmark } from './BrandWordmark'
import { LocalizedPolicyFooter } from './LocalizedPolicyFooter'
import './policy-disclosure.css'

type AsianLocale = Extract<Locale, 'ja' | 'zh-CN' | 'zh-TW' | 'zh-HK'>
const words = {
  eyebrow: t('Geupddong のポリシー', 'Geupddong 政策', 'Geupddong 政策'),
  back: t('地図に戻る', '返回地图', '返回地圖'),
  prior: t('以前のポリシー（韓国語）', '此前政策（韩语）', '先前政策（韓文）'),
  noteTitle: t('翻訳について', '关于译文', '關於譯文'),
  note: t('この翻訳は韓国語の原文を読むための参考です。同意条件、ポリシーの版、施行日は変わりません。', '本译文用于帮助阅读韩语原文，不改变同意条件、政策版本或生效日期。', '本譯文用於協助閱讀韓文原文，不會變更同意條件、政策版本或生效日期。'),
  source: t('韓国語の原文を見る', '查看韩语原文', '查看韓文原文'),
  contact: t('お問い合わせ', '联系信息', '聯絡方式'),
  operator: t('運営者：Geupddong（個人運営サービス）', '运营者：Geupddong（个人运营服务）', '營運者：Geupddong（個人營運服務）'),
  privacy: t('個人情報に関するお問い合わせ：', '隐私咨询：', '私隱查詢：'),
  contents: t('ポリシーの目次', '政策目录', '政策目錄'),
  accountTitle: t('アカウント削除・復旧ポリシーの変更', '账户删除与恢复政策变更', '帳戶刪除與復原政策變更'),
  reviewTitle: t('レビュー機能のポリシー', '评价功能政策', '評論功能政策'),
  photoTitle: t('プロフィール写真の保管ポリシー', '头像存储政策', '頭像儲存政策'),
  draft: t('この草案はまだ施行されていません。会員情報の保存構造、個人情報の複製と再出現防止記録の保管終了手順、告知日程を確認してから確定します。現在施行中のポリシーに代わるものではありません。', '本草案尚未生效。我们会在核实会员信息存储结构、个人信息副本及防重现记录的保留终止程序和公告时间表后定稿；它不取代当前生效政策。', '本草案尚未生效。我們會在核實會員資料儲存結構、個人資料副本及防重現紀錄的保留終止程序和公告時間表後定稿；它不取代目前生效政策。'),
} as const
const accountChange: PolicyText[] = [
  t('以下の改定は表示された施行時刻から適用され、それ以前は従前のポリシーが適用されます。公表のみで会員機能が自動的に有効になったり、復旧用情報の保管に同意したことになったりしません。利用可能な機能はアカウント画面で案内します。', '以下修订自所示生效时间起适用；在此之前仍适用此前政策。仅发布政策不会自动启用账户功能，也不构成同意保留恢复信息。账户页面会说明功能是否可用。', '以下修訂自所示生效時間起適用；在此之前仍適用先前政策。僅發布政策不會自動啟用帳戶功能，也不構成同意保留復原資料。帳戶頁面會說明功能是否可用。'),
  t('削除申請時に別途同意した場合にのみ、復旧用情報を3か月間保管します。', '仅在申请删除账户时另行选择同意，才保留恢复信息3个月。', '只有在申請刪除帳戶時另行選擇同意，才保留復原資料3個月。'),
  t('不同意、消去申請、または保管期間の終了時には会員情報が消去対象になります。個人情報を除いた報告と監査の業務記録は残ります。', '不同意、申请清除或保留期满后，账户信息会进入清除流程。已移除个人信息的反馈与审计工作记录仍会保留。', '不同意、申請清除或保留期滿後，帳戶資料會進入清除程序。已移除個人資料的回報與稽核工作紀錄仍會保留。'),
  t('韓国内で暗号化して保管する、削除済みアカウントの再出現を防ぐ記録の目的と保管終了手順を以下に説明します。', '下文说明在韩国境内加密保存、用于防止已删除账户重新出现的记录之目的及结束保留的程序。', '下文說明在韓國境內加密儲存、用於防止已刪除帳戶重新出現的紀錄之目的及結束保留的程序。'),
]
const reviewChange: PolicyText[] = [
  t('ログインした利用者がトイレの近くでのみレビューを投稿できるよう、位置、精度、測定時刻を一時的に確認します。', '为确保登录用户仅能在卫生间附近评价，会临时检查位置、精度及测量时间。', '為確保已登入使用者只可在廁所附近評論，會暫時檢查位置、準確度及測量時間。'),
  t('投稿者情報を削除すると投稿者との紐付けが解除され、表示名は「匿名」になります。評価と自由入力の投稿文はサービス情報として残ります。', '移除作者信息后，作者关联会解除，显示名称变为“匿名”。评分和自由填写的文字仍作为服务信息保留。', '移除作者資料後，作者連結會解除，顯示名稱變為「匿名」。評分和自行填寫的文字仍作為服務資訊保留。'),
  t('レビュー機能の利用可否はサーバーの別の安全設定で管理します。このポリシーの公表のみでは自動的に有効になりません。', '评价功能是否可用由服务器的单独安全设置控制；发布本政策不会自动启用该功能。', '評論功能是否可用由伺服器的獨立安全設定控制；發布本政策不會自動啟用該功能。'),
]
const photoChange: PolicyText[] = [
  t('登録時に任意で提供された Kakao の写真、または利用者がアップロードした写真は、小さなWebP画像に変換して米国の非公開 Cloudflare R2 に保存します。', '注册时自愿提供的 Kakao 照片或用户自行上传的照片会转换为小型 WebP 图片，并保存在美国的私有 Cloudflare R2。', '註冊時自願提供的 Kakao 照片或使用者自行上載的照片會轉換為小型 WebP 圖片，並儲存在美國的私人 Cloudflare R2。'),
  t('Kakao 写真の提供に同意するか、自分で写真を登録すると、公開レビューの投稿者写真として表示されます。マイページからいつでも公開をオフにできます。', '同意提供 Kakao 照片或自行上传照片后，它会显示为公开评价的作者头像；您可随时在“我的页面”关闭公开。', '同意提供 Kakao 照片或自行上載照片後，它會顯示為公開評論的作者頭像；您可隨時在「我的頁面」關閉公開。'),
  t('公開写真は表示を速くするため Cloudflare CDN に最長5分間一時保存されることがあります。公開停止・交換・削除時は公開アクセスを遮断し、CDNキャッシュの削除を依頼します。', '公开照片可能在 Cloudflare CDN 临时缓存最多5分钟以加快显示。关闭公开、替换或删除时，会阻止公开访问并请求删除 CDN 缓存。', '公開照片可能在 Cloudflare CDN 暫時快取最多5分鐘以加快顯示。關閉公開、替換或刪除時，會阻止公開存取並要求刪除 CDN 快取。'),
  t('写真を提供しなくても標準アバターで会員機能を利用できます。ポリシーの公表のみでは写真機能は自動的に有効になりません。', '不提供照片也可使用默认头像和会员功能；仅发布政策不会自动启用头像功能。', '不提供照片亦可使用預設頭像和會員功能；僅發布政策不會自動啟用頭像功能。'),
]

function date(value: string, locale: AsianLocale) {
  return new Date(value).toLocaleString(locale, { timeZone: 'Asia/Seoul' })
}
function publication(locale: AsianLocale) {
  if (accountPolicyPublication.status === 'draft') return pick(t('検討用改定案 · 施行日未定', '供审阅的修订草案 · 生效日期未定', '供審閱的修訂草案 · 生效日期未定'), locale)
  const announced = date(accountPolicyPublication.announcedAt!, locale), effective = date(accountPolicyPublication.effectiveAt!, locale)
  return locale === 'ja' ? `改定ポリシー · 告知：${announced} · 施行：${effective}（韓国時間）`
    : locale === 'zh-CN' ? `修订政策 · 公告：${announced} · 生效：${effective}（韩国时间）`
      : `修訂政策 · 公告：${announced} · 生效：${effective}（韓國時間）`
}
function effectiveNotice(kind: 'review' | 'photo', locale: AsianLocale) {
  const policy = kind === 'review' ? reviewPolicyPublication : profilePhotoPolicyPublication
  if (policy.status !== 'published') return pick(t('草案 · 施行日未定', '草案 · 生效日期未定', '草案 · 生效日期未定'), locale)
  const day = date(policy.effectiveAt!, locale)
  return locale === 'ja' ? `告知・施行：${day}（韓国時間）`
    : locale === 'zh-CN' ? `公告并生效：${day}（韩国时间）` : `公告及生效：${day}（韓國時間）`
}
function renderBlock(block: PolicyBlock, locale: AsianLocale, index: number): ReactNode {
  if (block.type === 'p') return <p key={index}>{pick(block.text, locale)}</p>
  if (block.type === 'ul') return <ul key={index}>{block.items.map((item, i) => <li key={i}>{pick(item, locale)}</li>)}</ul>
  return <dl key={index} className="policy-storage-facts">{block.items.map(([term, detail], i) => <div key={i}><dt>{pick(term, locale)}</dt><dd>{pick(detail, locale)}</dd></div>)}</dl>
}
function renderSection(section: PolicySection, locale: AsianLocale, embedded: boolean, index: number) {
  const Heading = embedded ? 'h3' : 'h2'
  return <section id={section.id} key={index}>
    <Heading>{pick(section.title, locale)}</Heading>
    {section.id === 'profile-photo-overseas' && <p>{effectiveNotice('photo', locale)}</p>}
    {section.blocks.map((block, i) => renderBlock(block, locale, i))}
  </section>
}
function PolicyLayout({ kind, locale, embedded, children }: { kind: AsianPolicyKind; locale: AsianLocale; embedded?: boolean; children: ReactNode }) {
  const title = pick(policyTitles[kind], locale)
  if (embedded) return <section className="policy-combined-section"><header className="policy-combined-header"><h2>{title}</h2></header><div className="policy-combined-body">{children}</div></section>
  const home = locale === 'ja' ? '/ja' : locale === 'zh-CN' ? '/zh-cn' : locale === 'zh-TW' ? '/zh-tw' : '/zh-hk'
  return <main className="policy-page" lang={locale}>
    <header className="policy-header"><a href={home} className="policy-brand" aria-label="Geupddong"><BrandWordmark locale={locale} /></a><a href={home} className="policy-home-link">{pick(words.back, locale)}</a></header>
    <article className="policy-document" data-translation-status="preview" data-translation-source="ko"
      {...policyPublicationAttributes(accountPolicyPublication)} {...reviewPolicyPublicationAttributes(reviewPolicyPublication)} {...profilePhotoPolicyPublicationAttributes(profilePhotoPolicyPublication)}>
      <header className="policy-document-header"><p className="policy-eyebrow">{pick(words.eyebrow, locale)}</p><h1>{title}</h1><p className="policy-effective">{publication(locale)}</p>
        <a className="policy-history-link" href={`/policy-history/2026-09-01.html?return=${encodeURIComponent(locale)}`}>{pick(words.prior, locale)} <span>2026-09-01</span></a></header>
      <aside className="policy-translation-note" aria-label={pick(words.noteTitle, locale)}><p>{pick(words.note, locale)}</p><a href={koreanPolicySourcePath(`/policies/${kind}`, locale)} lang="ko">{pick(words.source, locale)}</a></aside>
      {accountPolicyPublication.status === 'published' && <section className="policy-change-notice" aria-label={pick(words.accountTitle, locale)}><h2>{pick(words.accountTitle, locale)}</h2><p>{pick(accountChange[0], locale)}</p><ul>{accountChange.slice(1).map((item, i) => <li key={i}>{pick(item, locale)}</li>)}</ul></section>}
      {reviewPolicyPublication.status === 'published' && <section className="policy-change-notice" aria-label={pick(words.reviewTitle, locale)}><h2>{pick(words.reviewTitle, locale)}</h2><p>{effectiveNotice('review', locale)}</p><ul>{reviewChange.map((item, i) => <li key={i}>{pick(item, locale)}</li>)}</ul></section>}
      {profilePhotoPolicyPublication.status === 'published' && <section className="policy-change-notice" aria-label={pick(words.photoTitle, locale)}><h2>{pick(words.photoTitle, locale)}</h2><p>{effectiveNotice('photo', locale)}</p><ul>{photoChange.map((item, i) => <li key={i}>{pick(item, locale)}</li>)}</ul></section>}
      {accountPolicyPublication.status === 'draft' && <p className="policy-draft-notice">{pick(words.draft, locale)}</p>}
      {children}
      <section className="policy-contact"><h2>{pick(words.contact, locale)}</h2><p>{pick(words.operator, locale)}</p><p>{pick(words.privacy, locale)} <a href="mailto:privacy@geupddong.com">privacy@geupddong.com</a></p></section>
    </article><LocalizedPolicyFooter />
  </main>
}

export function AsianPolicyPage({ kind, locale, embedded = false }: { kind: AsianPolicyKind; locale: AsianLocale; embedded?: boolean }) {
  if (kind === 'all') return <PolicyLayout kind={kind} locale={locale}>
    <nav className="policy-section-links" aria-label={pick(words.contents, locale)}><a href="#terms">{pick(policyTitles.terms, locale)}</a><a href="#privacy">{pick(policyTitles.privacy, locale)}</a><a href="#location">{pick(policyTitles.location, locale)}</a></nav>
    <div id="terms"><AsianPolicyPage kind="terms" locale={locale} embedded /></div><div id="privacy"><AsianPolicyPage kind="privacy" locale={locale} embedded /></div><div id="location"><AsianPolicyPage kind="location" locale={locale} embedded /></div>
  </PolicyLayout>
  const sections = kind === 'terms' ? termsSections : kind === 'privacy' ? privacySections : locationSections
  return <PolicyLayout kind={kind} locale={locale} embedded={embedded}>{sections.map((section, i) => renderSection(section, locale, embedded, i))}</PolicyLayout>
}
