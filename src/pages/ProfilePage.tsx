import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { PHOTO_BUCKET, supabase } from '../lib/supabase'
import { useAuth, useMe } from '../lib/auth'
import { rpc, useMyBlocks, refreshAll } from '../lib/queries'
import { ChildrenCard } from '../components/ChildrenCard'
import { Button, Card, ErrorBox, Input, Label, PageSpinner } from '../components/ui'

export function ProfilePage() {
  const { session } = useAuth()
  const me = useMe()
  const qc = useQueryClient()
  const [name, setName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const location = useLocation()

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash, me.data])

  if (me.isLoading || !me.data?.profile) return <PageSpinner />
  const { profile, home } = me.data

  async function saveName() {
    if (name == null) return
    setSaving(true)
    setError(null)
    try {
      await rpc('save_profile', { p_display_name: name })
      await qc.invalidateQueries({ queryKey: ['me'] })
      setName(null)
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 px-4 pb-8">
      <header className="pt-5">
        <h1 className="text-2xl font-extrabold">{profile.display_name}</h1>
        <p className="text-sm text-muted">📍 {profile.area_name}</p>
      </header>

      <Card className="space-y-3">
        <h2 className="font-bold">Namn</h2>
        <div className="flex gap-2">
          <Input aria-label="Namn" value={name ?? profile.display_name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          {name != null && name !== profile.display_name && (
            <Button loading={saving} onClick={saveName} disabled={!name.trim()}>
              Spara
            </Button>
          )}
        </div>
        <ErrorBox error={error} />
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">Adress</h2>
        {home && (
          <p className="text-sm">
            {home.street_address}, {home.postal_code} {home.city}
          </p>
        )}
        <p className="text-xs text-muted">
          🔒 Visas bara för den du godkänner att hämta. Andra ser "{profile.area_name}" och ungefärligt avstånd.
        </p>
        <Link to="/profil/adress" className="inline-block text-sm font-semibold text-brand underline">
          Ändra adress
        </Link>
      </Card>

      <ChildrenCard />

      <BlockedCard />

      <Card className="space-y-3">
        <h2 className="font-bold">Konto</h2>
        <p className="text-sm text-muted">Inloggad som {session?.user.email}</p>
        <div className="flex flex-col gap-2">
          <Link to="/integritet" className="text-sm font-semibold text-brand underline">
            Så hanterar vi dina uppgifter
          </Link>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
            Logga ut
          </Button>
        </div>
      </Card>

      <DeleteAccount />
    </div>
  )
}

function DeleteAccount() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function remove() {
    const uid = session?.user.id
    if (!uid) return
    setBusy(true)
    setError(null)
    try {
      // 1. Ta bort alla mina bilder
      const bucket = supabase.storage.from(PHOTO_BUCKET)
      for (;;) {
        const { data, error } = await bucket.list(uid, { limit: 100 })
        if (error) throw error
        if (!data?.length) break
        const { error: rmError } = await bucket.remove(data.map((f) => `${uid}/${f.name}`))
        if (rmError) throw rmError
        if (data.length < 100) break
      }
      // 2. Ta bort kontot och all data
      await rpc('delete_my_account')
      await supabase.auth.signOut()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 border-danger/30">
      <h2 className="font-bold text-danger">Radera konto</h2>
      {!open ? (
        <Button variant="secondary" className="!text-danger" onClick={() => setOpen(true)}>
          Radera mitt konto och all data
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Allt raderas: profil, adress, annonser, bilder och chattar. Det går inte att ångra. Skriv <strong>RADERA</strong>{' '}
            för att bekräfta.
          </p>
          <div>
            <Label htmlFor="confirm-delete">Bekräfta</Label>
            <Input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          <ErrorBox error={error} />
          <div className="flex gap-2">
            <Button variant="danger" disabled={confirmText.trim().toUpperCase() !== 'RADERA'} loading={busy} onClick={remove}>
              Radera för alltid
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function BlockedCard() {
  const q = useMyBlocks()
  const qc = useQueryClient()
  if (!q.data?.length) return null
  return (
    <Card className="space-y-2">
      <h2 className="font-bold">Blockerade</h2>
      {q.data.map((b) => (
        <div key={b.user_id} className="flex items-center justify-between text-sm">
          <span>{b.display_name}</span>
          <button
            className="font-semibold text-brand"
            onClick={async () => {
              await rpc('unblock_user', { p_user_id: b.user_id })
              refreshAll(qc)
            }}
          >
            Avblockera
          </button>
        </div>
      ))}
    </Card>
  )
}
