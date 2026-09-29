import { NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useUserId } from '../lib/auth'

export function useUnreadCount() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['unread', uid],
    enabled: !!uid,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('unread_count')
      if (error) throw error
      return (data as number) ?? 0
    },
  })
}

const items = [
  { to: '/', label: 'Flöde', icon: '🏡', end: true },
  { to: '/mina', label: 'Mina', icon: '📦' },
  { to: '/bjussa', label: 'Bjussa', icon: '＋', primary: true },
  { to: '/chatt', label: 'Chatt', icon: '💬', badge: true },
  { to: '/profil', label: 'Profil', icon: '🙂' },
]

export function BottomNav() {
  const { data: unread = 0 } = useUnreadCount()
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2">
        {items.map((it) => (
          <li key={it.to} className="flex-1">
            <NavLink
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-brand' : 'text-muted'}`
              }
            >
              {it.primary ? (
                <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl text-white shadow-lg">
                  {it.icon}
                </span>
              ) : (
                <span className="relative text-xl" aria-hidden>
                  {it.icon}
                  {it.badge && unread > 0 && (
                    <span className="absolute -right-2.5 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] font-bold leading-5 text-ink">
                      {unread}
                    </span>
                  )}
                </span>
              )}
              <span>{it.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
