import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { refreshAll, rpc } from '../lib/queries'
import { Button, ErrorBox, Label, Notice, Textarea } from './ui'

const REASONS = [
  { id: 'child_in_photo', label: 'Barn syns på bilden' },
  { id: 'car_seat', label: 'Bilbarnstol eller babyskydd' },
  { id: 'unsafe', label: 'Osäker eller återkallad produkt' },
  { id: 'not_free', label: 'Säljs – är inte gratis' },
  { id: 'inappropriate', label: 'Olämpligt innehåll' },
  { id: 'harassment', label: 'Trakasserier eller obehagligt beteende' },
  { id: 'spam', label: 'Spam eller bluff' },
  { id: 'other', label: 'Annat' },
]

/** "⋯"-knapp med Rapportera och Blockera. */
export function ReportBlockMenu({
  listingId,
  userId,
  userName,
}: {
  listingId?: string
  userId: string | null
  userName: string
}) {
  const [open, setOpen] = useState<'menu' | 'report' | 'block' | 'done' | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [doneText, setDoneText] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()

  async function sendReport() {
    setBusy(true)
    setError(null)
    try {
      await rpc('report', {
        p_reason: reason,
        p_listing_id: listingId ?? null,
        p_user_id: listingId ? null : userId,
        p_details: details || null,
      })
      setDoneText('Tack! Vi tittar på det. Blir en annons rapporterad av flera grannar döljs den automatiskt.')
      setOpen('done')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function block() {
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      await rpc('block_user', { p_user_id: userId })
      refreshAll(qc)
      setOpen(null)
      navigate('/')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="rounded-full px-3 py-2 text-xl text-muted" aria-label="Mer" onClick={() => setOpen('menu')}>
        ⋯
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            className="pb-safe w-full max-w-md space-y-3 rounded-t-3xl bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {open === 'menu' && (
              <>
                <Button variant="secondary" className="w-full" onClick={() => setOpen('report')}>
                  🚩 Rapportera {listingId ? 'annonsen' : userName}
                </Button>
                {userId && (
                  <Button variant="secondary" className="w-full !text-danger" onClick={() => setOpen('block')}>
                    🚫 Blockera {userName}
                  </Button>
                )}
                <Button variant="ghost" className="w-full" onClick={() => setOpen(null)}>
                  Avbryt
                </Button>
              </>
            )}
            {open === 'report' && (
              <>
                <h2 className="text-lg font-bold">Vad är fel?</h2>
                <div className="space-y-1.5">
                  {REASONS.map((r) => (
                    <label key={r.id} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-sm">
                      <input type="radio" name="reason" className="h-5 w-5 accent-brand" checked={reason === r.id} onChange={() => setReason(r.id)} />
                      {r.label}
                    </label>
                  ))}
                </div>
                <div>
                  <Label htmlFor="report-details" optional>
                    Berätta mer
                  </Label>
                  <Textarea id="report-details" rows={2} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
                </div>
                <ErrorBox error={error} />
                <Button className="w-full" disabled={!reason} loading={busy} onClick={sendReport}>
                  Skicka rapport
                </Button>
              </>
            )}
            {open === 'block' && (
              <>
                <h2 className="text-lg font-bold">Blockera {userName}?</h2>
                <p className="text-sm">
                  Ni kommer inte att se varandras annonser eller kunna skriva till varandra. Pågående förfrågningar mellan er
                  avslutas. {userName} får inget besked om att du blockerat. Du kan ångra under Profil.
                </p>
                <ErrorBox error={error} />
                <Button variant="danger" className="w-full" loading={busy} onClick={block}>
                  Blockera
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setOpen(null)}>
                  Avbryt
                </Button>
              </>
            )}
            {open === 'done' && (
              <>
                <Notice tone="good">{doneText}</Notice>
                <Button className="w-full" onClick={() => setOpen(null)}>
                  Stäng
                </Button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
