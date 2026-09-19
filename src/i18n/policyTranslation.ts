// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '78b7ca2b9c488b7c3296d5f39e2d4e69cfe397b7361a8a494a0faa9fc7287684'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
