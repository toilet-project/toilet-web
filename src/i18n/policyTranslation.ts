// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '6927bb3a6cab78ca5799ca962686187cf71628b1040e0c0fea9f891ffaec3aa4'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
