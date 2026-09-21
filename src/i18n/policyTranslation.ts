// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '2486a4728895dcd1ab9ae6adb8c8c86636ff64f8b29130a54aaa297013b90e4c'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
