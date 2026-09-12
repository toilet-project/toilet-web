// Select using only the custom calendar's public controls, never React state injection.
exports.selectCalendarDate = async (scope, field, value) => {
  const [year, month, day] = value.split('-').map(Number)
  await scope.getByRole('button', { name: field, exact: true }).click()
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = (await scope.locator('.history-calendar-toolbar strong').innerText()).match(/(\d+)년 (\d+)월/)
    const difference = year * 12 + month - Number(current[1]) * 12 - Number(current[2])
    if (!difference) {
      await scope.getByRole('button', { name: `${year}년 ${month}월 ${day}일`, exact: true }).click()
      return
    }
    await scope.getByRole('button', { name: difference < 0 ? '이전 달' : '다음 달', exact: true }).click()
  }
  throw new Error('Calendar month navigation exceeded the bounded test range')
}
