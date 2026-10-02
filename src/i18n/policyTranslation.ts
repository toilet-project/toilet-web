// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '6b785d9bc6e13d7da1836d58b2f2b68298f61bad4663a9d1768e4301aba94ef1'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
