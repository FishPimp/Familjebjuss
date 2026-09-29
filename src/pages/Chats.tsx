import { Link } from 'react-router'
import { useConversations } from '../lib/queries'
import { listingTitle, timeAgo } from '../lib/format'
import { Photo } from '../components/Photo'
import { EmptyState, ErrorBox, PageSpinner } from '../components/ui'

export function Chats() {
  const q = useConversations()
  return (
    <div>
      <header className="px-4 pb-2 pt-5">
        <h1 className="text-2xl font-extrabold">Chatt</h1>
      </header>
      {q.isLoading ? (
        <PageSpinner />
      ) : q.error ? (
        <ErrorBox error={q.error} className="m-4" />
      ) : !q.data?.length ? (
        <EmptyState emoji="💬" title="Inga samtal än">
          När du frågar om något eller någon vill ha det du bjussar dyker samtalen upp här.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((c) => (
            <li key={c.id}>
              <Link to={`/chatt/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface">
                <Photo path={c.thumb_path} category={c.category} alt="" className="h-14 w-14 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? 'font-extrabold' : 'font-semibold'}`}>{c.other_name}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {c.my_role === 'giver' ? 'Du bjussar' : 'Du vill ha'}: {listingTitle(c)}
                  </div>
                  <div className={`truncate text-sm ${c.unread ? 'font-semibold text-ink' : 'text-muted'}`}>{c.last_message_preview ?? 'Inga meddelanden än'}</div>
                </div>
                {c.unread && <span className="h-3 w-3 shrink-0 rounded-full bg-accent" aria-label="Oläst" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
