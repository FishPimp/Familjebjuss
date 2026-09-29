import { usePickupDetails } from '../lib/queries'
import { formatDateTime, formatTimeWindow } from '../lib/format'
import { pickupLabel } from '../config'
import { ErrorBox, Spinner } from './ui'

/** Adress, portkod och tider. Visas bara för godkänd mottagare (databasen släpper inte ut det annars). */
export function PickupCard({ requestId }: { requestId: string }) {
  const q = usePickupDetails(requestId, true)
  if (q.isLoading) return <Spinner small />
  if (q.error) return <ErrorBox error={q.error} />
  const d = q.data
  if (!d) return null
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.street_address}, ${d.postal_code} ${d.city}`)}`
  return (
    <div className="space-y-2 rounded-2xl border border-brand/30 bg-brand-soft p-4 text-sm" data-testid="pickup-card">
      <div className="font-bold text-brand-dark">🔑 Hämtningsinfo</div>
      <div>
        <div className="text-base font-semibold">{d.street_address}</div>
        <div>
          {d.postal_code} {d.city}
        </div>
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-brand underline">
          Öppna i karta
        </a>
      </div>
      <div>
        <strong>{pickupLabel(d.pickup_method)}</strong>
        {d.pickup_method === 'home' && d.pickup_from && <> · {formatTimeWindow(d.pickup_from, d.pickup_to)}</>}
      </div>
      {d.door_code && (
        <div>
          Portkod: <strong className="font-mono text-base">{d.door_code}</strong>
        </div>
      )}
      {d.instructions && <div>{d.instructions}</div>}
      {d.pickup_deadline && <div className="text-muted">Hämta senast {formatDateTime(d.pickup_deadline)}</div>}
    </div>
  )
}
