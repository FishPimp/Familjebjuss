import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, useMe } from '../lib/auth'
import { PRIVACY_VERSION } from '../config'
import { AddressForm } from '../components/AddressForm'
import { Button, ErrorBox, Input, Label, PageSpinner } from '../components/ui'

export function Onboarding() {
  const { session, loading } = useAuth()
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (loading || (session && me.isLoading)) return <PageSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (me.data?.profile && me.data?.home) return <Navigate to="/" replace />

  const step = me.data?.profile ? 'address' : 'profile'

  async function saveProfile() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('save_profile', {
      p_display_name: name,
      p_accept_privacy_version: PRIVACY_VERSION,
    })
    setBusy(false)
    if (error) return setError(error)
    await qc.invalidateQueries({ queryKey: ['me'] })
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-extrabold">Välkommen till Bjuss!</h1>
          <p className="text-sm text-muted">Steg {step === 'profile' ? 1 : 2} av 2</p>
        </div>
      </div>

      {step === 'profile' ? (
        <div className="space-y-5">
          <div>
            <Label htmlFor="name">Vad vill du kallas?</Label>
            <Input id="name" autoComplete="given-name" maxLength={40} placeholder="T.ex. ditt förnamn" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Syns för grannar när du bjussar eller vill ha något.</p>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-sm">
              Jag har läst{' '}
              <Link to="/integritet" className="font-semibold text-brand underline">
                hur Bjuss hanterar mina uppgifter
              </Link>{' '}
              och godkänner det. Jag lovar att inte visa barn på bilderna.
            </span>
          </label>

          <ErrorBox error={error} />
          <Button className="w-full" disabled={!name.trim() || !consent} loading={busy} onClick={saveProfile}>
            Fortsätt
          </Button>
          <button className="w-full text-center text-sm text-muted underline" onClick={() => supabase.auth.signOut()}>
            Logga ut
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">Var bor du?</h2>
            <p className="text-sm text-muted">Vi använder det för att visa saker från grannar inom gångavstånd.</p>
          </div>
          <AddressForm submitLabel="Klart – visa flödet" onSaved={() => navigate('/', { replace: true })} />
        </div>
      )}
    </div>
  )
}
