import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useListing, useAction, rpc } from '../lib/queries'
import { SAFETY_WARNING, conditionLabel, isSafetyProduct, pickupLabel } from '../config'
import { formatDistance, formatTimeWindow, listingSize, listingTitle, timeAgo } from '../lib/format'
import { Photo } from '../components/Photo'
import { ReportBlockMenu } from '../components/ReportBlock'
import { Badge, Button, EmptyState, ErrorBox, LinkButton, Notice, PageHeader, PageSpinner } from '../components/ui'
import { useState } from 'react'

export function ListingPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const q = useListing(id)
  const request = useAction<{ p_listing_id: string }, string>('request_listing')
  const cancel = useAction<{ p_request_id: string }>('cancel_request')
  const remove = useAction<{ p_listing_id: string }>('remove_listing')
  const [chatError, setChatError] = useState<unknown>(null)
  const [chatBusy, setChatBusy] = useState(false)

  if (q.isLoading) return <PageSpinner />
  if (q.error) return <ErrorBox error={q.error} className="m-4" />
  const l = q.data
  if (!l)
    return (
      <>
        <PageHeader title="Annons" back="/" />
        <EmptyState emoji="🫥" title="Annonsen finns inte längre">
          Den kan ha hämtats eller tagits bort.
        </EmptyState>
      </>
    )

  const size = listingSize(l)

  async function openChat() {
    if (l!.my_conversation_id) return navigate(`/chatt/${l!.my_conversation_id}`)
    setChatBusy(true)
    setChatError(null)
    try {
      const convId = await rpc<string>('start_conversation', { p_listing_id: l!.id })
      navigate(`/chatt/${convId}`)
    } catch (e) {
      setChatError(e)
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={listingTitle(l)}
        back={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        right={!l.is_mine && <ReportBlockMenu listingId={l.id} userId={l.giver_id} userName={l.giver_name} />}
      />
      {params.get('ny') && <Notice tone="good" className="m-4">🎉 Tack! Din bjussning syns nu för grannar i närheten.</Notice>}

      <Photo path={l.photo_path} category={l.category} alt={listingTitle(l)} className="aspect-square w-full" />

      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-2xl font-extrabold">{listingTitle(l)}</h2>
          {size && <div className="text-lg">{size}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="brand">📍 {l.area_name ?? 'Nära dig'}</Badge>
            {l.distance_m != null && <Badge>{formatDistance(l.distance_m)}</Badge>}
            <Badge>{conditionLabel(l.condition)}</Badge>
            {l.quantity > 1 && <Badge>{l.quantity} st</Badge>}
            {l.brand && <Badge>{l.brand}</Badge>}
          </div>
        </div>

        {l.description && <p className="whitespace-pre-line">{l.description}</p>}

        {isSafetyProduct(l) && (
          <Notice tone="warn" data-testid="safety-warning">
            ⚠️ {SAFETY_WARNING}
          </Notice>
        )}

        <div className="rounded-2xl border border-line bg-surface p-3 text-sm">
          <div className="font-semibold">{pickupLabel(l.pickup_method)}</div>
          {l.pickup_method === 'home' && l.pickup_from && <div>{formatTimeWindow(l.pickup_from, l.pickup_to)}</div>}
          <div className="text-muted">Adressen visas när bjussaren godkänt dig.</div>
        </div>

        <div className="text-sm text-muted">
          Bjussas av <strong className="text-ink">{l.is_mine ? 'dig' : l.giver_name}</strong> · {timeAgo(l.created_at)}
        </div>

        {l.is_mine ? (
          <div className="space-y-2">
            <Notice>
              {l.status === 'available' && (l.queue_length > 0 ? `${l.queue_length} vill ha den här.` : 'Ingen har frågat än.')}
              {l.status === 'reserved' && 'Reserverad – väntar på hämtning.'}
              {l.status === 'picked_up' && 'Hämtad. Tack för att du bjussar! 💚'}
              {l.status === 'removed' && 'Borttagen.'}
            </Notice>
            <LinkButton to="/mina" className="w-full">
              Se förfrågningar
            </LinkButton>
            {(l.status === 'available' || l.status === 'reserved') && (
              <Button
                variant="ghost"
                className="w-full"
                loading={remove.isPending}
                onClick={() => {
                  if (confirm('Ta bort annonsen? De som står i kö får besked.')) remove.mutate({ p_listing_id: l.id })
                }}
              >
                Ta bort annonsen
              </Button>
            )}
            <ErrorBox error={remove.error} />
          </div>
        ) : (
          <div className="space-y-2">
            {l.my_request_status === 'pending' && (
              <>
                <Notice tone="warn">
                  Du står i kö{l.my_queue_position ? ` (plats ${l.my_queue_position})` : ''}. Bjussaren väljer vem som får hämta.
                </Notice>
                <Button variant="ghost" className="w-full" loading={cancel.isPending} onClick={() => cancel.mutate({ p_request_id: l.my_request_id! })}>
                  Ångra förfrågan
                </Button>
              </>
            )}
            {l.my_request_status === 'approved' && (
              <Notice tone="good">✅ Du är godkänd! Adress och hämtningsinfo finns i chatten.</Notice>
            )}
            {l.status === 'available' && l.my_request_status !== 'pending' && l.my_request_status !== 'approved' && (
              <>
                {l.queue_length > 0 && <p className="text-center text-sm text-muted">{l.queue_length} står redan i kö</p>}
                <Button className="w-full" loading={request.isPending} onClick={() => request.mutate({ p_listing_id: l.id })}>
                  💚 Vill ha
                </Button>
              </>
            )}
            <Button variant="secondary" className="w-full" loading={chatBusy} onClick={openChat}>
              💬 {l.my_request_status === 'approved' ? 'Öppna chatten' : 'Fråga bjussaren'}
            </Button>
            <ErrorBox error={request.error ?? cancel.error ?? chatError} />
          </div>
        )}
      </div>
    </div>
  )
}
