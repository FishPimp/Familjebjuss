import { useMe } from '../lib/auth'
import { useFeed } from '../lib/queries'
import { ListingCard } from '../components/ListingCard'
import { EmptyState, ErrorBox, LinkButton, PageSpinner } from '../components/ui'

export function Feed() {
  const me = useMe()
  const feed = useFeed()
  const area = me.data?.profile?.area_name

  return (
    <div>
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Bjuss</h1>
          <p className="text-sm text-muted">Nära dig{area ? ` i ${area}` : ''}</p>
        </div>
        <button
          onClick={() => feed.refetch()}
          className="rounded-full border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand"
          aria-label="Uppdatera"
        >
          ↻
        </button>
      </header>

      {feed.isLoading ? (
        <PageSpinner />
      ) : feed.error ? (
        <ErrorBox error={feed.error} className="m-4" />
      ) : !feed.data?.length ? (
        <EmptyState emoji="🌱" title="Inget att hämta just nu">
          <p className="mb-5">Inga grannar har bjussat något i närheten än. Bli först – det tar under en minut!</p>
          <LinkButton to="/bjussa">Bjussa något</LinkButton>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-2">
          {feed.data.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  )
}
