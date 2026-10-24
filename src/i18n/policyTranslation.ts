// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '85387d39429c8e51acc46510167ba9c34a59a3c7a755c3792f0779aef5c1684b'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
