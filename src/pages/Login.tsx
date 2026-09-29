import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, ErrorBox, Input, Label } from '../components/ui'

export function Login() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (session) return <Navigate to="/" replace />

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) return setError(error)
    setStep('code')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\s/g, ''),
      type: 'email',
    })
    setBusy(false)
    if (error) return setError(error)
    navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-4 h-20 w-20" />
        <h1 className="text-3xl font-extrabold text-brand">Bjuss</h1>
        <p className="mt-2 text-muted">Skänk utväxta barnkläder och leksaker till grannar – till fots.</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <Label htmlFor="email">Din e-post</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="namn@exempel.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <ErrorBox error={error} />
          <Button type="submit" loading={busy} className="w-full">
            Skicka inloggningskod
          </Button>
          <p className="text-center text-xs text-muted">
            Inget lösenord behövs. Du får en kod via mejl. Genom att logga in första gången skapar du ett konto.{' '}
            <Link to="/integritet" className="underline">
              Så hanterar vi dina uppgifter
            </Link>
            .
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-center">
            Vi har skickat en kod till <strong>{email}</strong>. Kolla skräpposten om den inte syns.
          </p>
          <div>
            <Label htmlFor="code">Kod från mejlet</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              required
              placeholder="123456"
              className="text-center text-2xl tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <ErrorBox error={error} />
          <Button type="submit" loading={busy} className="w-full">
            Logga in
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-brand underline" onClick={() => setStep('email')}>
              Byt e-post
            </button>
            <button type="button" className="text-brand underline" onClick={() => sendCode()} disabled={busy}>
              Skicka ny kod
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
