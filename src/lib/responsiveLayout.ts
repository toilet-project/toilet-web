// Keep these complementary queries in sync with App.css (covered by tests).
// Short, touch-first screens retain the mobile layout when rotated.
export const MOBILE_LAYOUT_QUERY = '(max-width: 640px), (max-width: 1024px) and (max-height: 500px) and (pointer: coarse)'
export const DESKTOP_LAYOUT_QUERY = '(min-width: 641px) and (pointer: fine), (min-width: 641px) and (pointer: none), (min-width: 641px) and (min-height: 501px), (min-width: 1025px)'
