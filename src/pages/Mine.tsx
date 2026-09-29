import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAction, useListingRequests, useMyListings, useMyRequests } from '../lib/queries'
import type { ListingRequest, MyListing, MyRequest, RequestStatus } from '../lib/types'
import { formatDateTime, listingSize, listingTitle, timeAgo } from '../lib/format'
import { Photo } from '../components/Photo'
import { PickupCard } from '../components/PickupCard'
import { Badge, Button, Card, EmptyState, ErrorBox, LinkButton, Notice, PageSpinner } from '../components/ui'
import { UserStatsLine } from '../components/UserStatsLine'

const listingStatusText = {
  available: { label: 'Ledig', tone: 'brand' },
  reserved: { label: 'Reserverad', tone: 'accent' },
  picked_up: { label: 'Hämtad', tone: 'neutral' },
  removed: { label: 'Borttagen', tone: 'neutral' },
} as const

const requestStatusText: Record<RequestStatus, { label: string; tone: 'neutral' | 'brand' | 'accent' | 'danger' }> = {
  pending: { label: 'I kö', tone: 'accent' },
  approved: { label: 'Godkänd – hämta!', tone: 'brand' },
  picked_up: { label: 'Hämtad', tone: 'neutral' },
  declined: { label: 'Inte denna gång', tone: 'neutral' },
  cancelled: { label: 'Ångrad', tone: 'neutral' },
  expired: { label: 'Inte hämtad i tid', tone: 'danger' },
}

export function Mine() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('flik') === 'hamtningar' ? 'taking' : 'giving'
  return (
    <div>
      <header className="px-4 pb-2 pt-5">
        <h1 className="text-2xl font-extrabold">Mina</h1>
      </header>
      <div className="mx-4 mb-3 grid grid-cols-2 rounded-2xl bg-surface p-1 text-sm font-semibold shadow-sm">
        <button className={`rounded-xl py-2.5 ${tab === 'giving' ? 'bg-brand text-white' : 'text-muted'}`} onClick={() => setParams({})}>
          Jag bjussar
        </button>
        <button
          className={`rounded-xl py-2.5 ${tab === 'taking' ? 'bg-brand text-white' : 'text-muted'}`}
          onClick={() => setParams({ flik: 'hamtningar' })}
        >
          Jag hämtar
        </button>
      </div>
      {tab === 'giving' ? <Giving /> : <Taking />}
    </div>
  )
}

function Giving() {
  const q = useMyListings()
  if (q.isLoading) return <PageSpinner />
  if (q.error) return <ErrorBox error={q.error} className="m-4" />
  if (!q.data?.length)
    return (
      <EmptyState emoji="🛍️" title="Du har inte bjussat något än">
        <p className="mb-5">Fota en hög med utväxta kläder – det tar under en minut.</p>
        <LinkButton to="/bjussa">Bjussa något</LinkButton>
      </EmptyState>
    )
  return (
    <div className="space-y-3 px-4">
      {q.data.map((l) => (
        <MyListingCard key={l.id} listing={l} />
      ))}
    </div>
  )
}

function MyListingCard({ listing: l }: { listing: MyListing }) {
  const active = l.status === 'available' || l.status === 'reserved'
  const [open, setOpen] = useState(active && (l.pending_count > 0 || !!l.approved_request_id))
  const st = listingStatusText[l.status]
  return (
    <Card className="p-3">
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        <Photo path={l.thumb_path} category={l.category} alt="" className="h-16 w-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{listingTitle(l)}</div>
          <div className="text-sm text-muted">{listingSize(l) || timeAgo(l.created_at)}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={st.tone}>{st.label}</Badge>
            {l.status === 'available' && l.pending_count > 0 && <Badge tone="accent">{l.pending_count} i kö</Badge>}
          </div>
        </div>
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && <RequestQueue listingId={l.id} />}
    </Card>
  )
}

function RequestQueue({ listingId }: { listingId: string }) {
  const q = useListingRequests(listingId)
  const approve = useAction<{ p_request_id: string }>('approve_request')
  const decline = useAction<{ p_request_id: string }>('decline_request')
  const picked = useAction<{ p_request_id: string }>('mark_picked_up')
  const error = approve.error ?? decline.error ?? picked.error

  if (q.isLoading) return <div className="p-3 text-sm text-muted">Laddar…</div>
  const rows = q.data ?? []
  const active = rows.filter((r) => r.status === 'pending' || r.status === 'approved')
  const hasApproved = rows.some((r) => r.status === 'approved')
  if (!rows.length) return <p className="mt-3 text-sm text-muted">Ingen har frågat än.</p>

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      {active.length === 0 && <p className="text-sm text-muted">Inga aktiva förfrågningar.</p>}
      {active.map((r, i) => (
        <RequestRow
          key={r.id}
          r={r}
          position={r.status === 'pending' ? i + (hasApproved ? 0 : 1) : null}
          canApprove={!hasApproved}
          onApprove={() => approve.mutate({ p_request_id: r.id })}
          onDecline={() => {
            const text = r.status === 'approved' ? `Ångra godkännandet av ${r.taker_name}?` : `Tacka nej till ${r.taker_name}?`
            if (confirm(text)) decline.mutate({ p_request_id: r.id })
          }}
          onPicked={() => picked.mutate({ p_request_id: r.id })}
          busy={approve.isPending || decline.isPending || picked.isPending}
        />
      ))}
      <ErrorBox error={error} />
    </div>
  )
}

function RequestRow({
  r,
  position,
  canApprove,
  onApprove,
  onDecline,
  onPicked,
  busy,
}: {
  r: ListingRequest
  position: number | null
  canApprove: boolean
  onApprove: () => void
  onDecline: () => void
  onPicked: () => void
  busy: boolean
}) {
  return (
    <div className="rounded-2xl bg-bg p-3" data-testid="request-row">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold">
            {position ? <span className="mr-1 text-muted">{position}.</span> : null}
            {r.taker_name}
          </div>
          <div className="text-xs text-muted">
            {r.status === 'approved' ? `Godkänd · hämtas senast ${formatDateTime(r.pickup_deadline)}` : `Frågade ${timeAgo(r.created_at)}`}
          </div>
          <UserStatsLine given={r.taker_given} received={r.taker_received} noShows={r.taker_no_shows} reliability={r.taker_reliability_pct} />
        </div>
        {r.conversation_id && (
          <Link to={`/chatt/${r.conversation_id}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
            💬 Chatt
          </Link>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {r.status === 'pending' && (
          <>
            <Button className="flex-1 !min-h-10 !py-2 text-sm" disabled={!canApprove} loading={busy} onClick={onApprove}>
              Godkänn
            </Button>
            <Button variant="secondary" className="!min-h-10 !py-2 text-sm" disabled={busy} onClick={onDecline}>
              Neka
            </Button>
          </>
        )}
        {r.status === 'approved' && (
          <>
            <Button className="flex-1 !min-h-10 !py-2 text-sm" loading={busy} onClick={onPicked}>
              Markera som hämtad
            </Button>
            <Button variant="secondary" className="!min-h-10 !py-2 text-sm" disabled={busy} onClick={onDecline}>
              Ångra
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Taking() {
  const q = useMyRequests()
  if (q.isLoading) return <PageSpinner />
  if (q.error) return <ErrorBox error={q.error} className="m-4" />
  if (!q.data?.length)
    return (
      <EmptyState emoji="🧺" title="Inga hämtningar än">
        <p className="mb-5">Hittar du något i flödet trycker du "Vill ha".</p>
        <LinkButton to="/">Till flödet</LinkButton>
      </EmptyState>
    )
  return (
    <div className="space-y-3 px-4">
      {q.data.map((r) => (
        <MyRequestCard key={r.id} r={r} />
      ))}
    </div>
  )
}

function MyRequestCard({ r }: { r: MyRequest }) {
  const cancel = useAction<{ p_request_id: string }>('cancel_request')
  const picked = useAction<{ p_request_id: string }>('mark_picked_up')
  const rate = useAction<{ p_request_id: string; p_rating: string }>('rate_pickup')
  const st = requestStatusText[r.status]
  return (
    <Card className="space-y-3 p-3">
      <Link to={`/annons/${r.listing_id}`} className="flex items-center gap-3">
        <Photo path={r.thumb_path} category={r.category} alt="" className="h-16 w-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{listingTitle(r)}</div>
          <div className="text-sm text-muted">
            {r.giver_name} · {r.area_name}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={st.tone}>{st.label}</Badge>
            {r.status === 'pending' && r.queue_position && <Badge>Plats {r.queue_position} i kön</Badge>}
            {r.status === 'picked_up' && !r.taker_confirmed && !r.rating && <Badge tone="accent">Bekräfta hämtning</Badge>}
          </div>
        </div>
      </Link>

      {r.status === 'approved' && <PickupCard requestId={r.id} />}

      {r.status === 'expired' && (
        <Notice tone="warn">
          Hämtningen gjordes inte i tid, så saken gick vidare till nästa i kön. Det räknas som en missad hämtning i din
          pålitlighet.
        </Notice>
      )}

      {r.status === 'picked_up' && !r.rating && (
        <div className="rounded-2xl bg-bg p-3" data-testid="rating">
          <p className="mb-2 text-sm font-semibold">Stämde det med beskrivningen?</p>
          <div className="flex gap-2">
            <Button className="flex-1 !min-h-10 !py-2 text-sm" loading={rate.isPending} onClick={() => rate.mutate({ p_request_id: r.id, p_rating: 'as_described' })}>
              👍 Stämde
            </Button>
            <Button variant="secondary" className="flex-1 !min-h-10 !py-2 text-sm" disabled={rate.isPending} onClick={() => rate.mutate({ p_request_id: r.id, p_rating: 'not_quite' })}>
              🤏 Inte riktigt
            </Button>
          </div>
        </div>
      )}
      {r.rating && <p className="text-xs text-muted">Ditt omdöme: {r.rating === 'as_described' ? '👍 Stämde med beskrivningen' : '🤏 Inte riktigt'}</p>}

      <div className="flex flex-wrap gap-2">
        {r.status === 'approved' && (
          <Button className="flex-1 !min-h-10 !py-2 text-sm" loading={picked.isPending} onClick={() => picked.mutate({ p_request_id: r.id })}>
            ✅ Jag har hämtat
          </Button>
        )}
        {r.conversation_id && (
          <LinkButton to={`/chatt/${r.conversation_id}`} variant="secondary" className="!min-h-10 !py-2 text-sm">
            💬 Chatt
          </LinkButton>
        )}
        {(r.status === 'pending' || r.status === 'approved') && (
          <Button
            variant="ghost"
            className="!min-h-10 !py-2 text-sm"
            loading={cancel.isPending}
            onClick={() => {
              if (confirm('Ångra din förfrågan?')) cancel.mutate({ p_request_id: r.id })
            }}
          >
            Ångra
          </Button>
        )}
      </div>
      <ErrorBox error={cancel.error ?? picked.error ?? rate.error} />
    </Card>
  )
}
