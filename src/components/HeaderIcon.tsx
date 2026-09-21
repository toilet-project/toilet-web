export type HeaderIconName = 'map' | 'regions' | 'reviews' | 'reports' | 'account' | 'logout'

export function HeaderIcon({ name }: { name: HeaderIconName }) {
  const shape = name === 'map' ? <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.4" /></>
    : name === 'regions' ? <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /></>
      : name === 'reviews' ? <><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z" /><path d="m12 7 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4Z" /></>
        : name === 'reports' ? <><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 12h7M9 16h5" /></>
          : name === 'logout' ? <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h11" /></>
            : <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>
}
