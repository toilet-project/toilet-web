// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '61c6221de9d615238ac092c1a39b8ec4f2c85afeec4107453e8b81a53e711dc4'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
