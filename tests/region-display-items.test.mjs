import test from 'node:test'
import assert from 'node:assert/strict'
import { regionDisplayItems } from '../src/lib/regionDisplayItems.ts'

const toilet = {
  id: 177, name: '사직주유소', toiletType: '개방화장실', latitude: 37.57, longitude: 126.98,
  displayGroupId: 3, displayGroupName: '사직 그룹',
  displayGroupTranslations: { en: 'Sajik group', ja: 'サジクグループ' },
  translations: {
    en: { name: 'Sajik gas station', roadAddress: null, jibunAddress: null },
    ja: { name: 'サジク給油所', roadAddress: null, jibunAddress: null },
    'zh-CN': { name: '社稷加油站', roadAddress: null, jibunAddress: null },
  },
}

test('district marker props contain only the selected language and public map fields', () => {
  const [english] = regionDisplayItems([toilet], 'en')
  assert.deepEqual(english, {
    id: 177, name: 'Sajik gas station', toiletType: '개방화장실', latitude: 37.57, longitude: 126.98,
    displayGroupId: 3, displayGroupName: 'Sajik group',
  })
  assert.equal(JSON.stringify(english).includes('サジク'), false)
  assert.equal(JSON.stringify(english).includes('社稷'), false)
  assert.equal(toilet.name, '사직주유소', 'source data is not mutated')
})

test('traditional Chinese display fallback is resolved before serializing marker props', () => {
  const [traditional] = regionDisplayItems([toilet], 'zh-TW')
  assert.equal(traditional.name, '社稷加油站')
  assert.equal(traditional.displayGroupName, 'Sajik group')
  assert.equal('translations' in traditional, false)
  assert.equal('displayGroupTranslations' in traditional, false)
})
