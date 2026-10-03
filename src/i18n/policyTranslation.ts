// Update only after comparing the translation against every changed Korean clause.
export const policyTranslationSourceSha256 = '025f31432c02c0fea84149cf628553d20fdc862dbe05eb3dde33a3a0cceacc3c'
export const englishPolicyTitles = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', location: 'Location Information Notice', all: 'Terms and Service Policies',
} as const
export type EnglishPolicyKind = keyof typeof englishPolicyTitles
