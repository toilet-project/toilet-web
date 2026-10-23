import type { ReactNode } from 'react'

export function ReviewIcon({ name, size = 22, className }: { name: 'star' | 'review' | 'siren' | 'paper' | 'people' | 'close' | 'back' | 'check' | 'refresh' | 'trash'; size?: number; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    review: <><path d="M14 4H5a2 2 0 0 0-2 2v15l4-3h11a2 2 0 0 0 2-2v-5" /><path d="m13 12-4 1 1-4 7-7 3 3-7 7Z" /></>,
    siren: <><path d="M6 17v-6a6 6 0 0 1 12 0v6M4 17h16v4H4zM12 1v1M3 4l2 2M21 4l-2 2M1 11h2M21 11h2" /><path d="M12 8a3 3 0 0 1 3 3v3" /></>,
    paper: <><ellipse cx="6" cy="9" rx="3" ry="6" /><path d="M6 3h10c2.8 0 5 2.7 5 6v12H9V9M6 15h3M6 8v2M12 16h1m3 0h1" /></>,
    people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />, back: <path d="m14 5-7 7 7 7" />, check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></>,
    trash: <><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></>,
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'star' ? '1.8' : '1.7'} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
