import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useUserId } from '../lib/auth'
import { refreshAll, rpc, useAction, useConversation, useMessages } from '../lib/queries'
import type { ConversationView, Message } from '../lib/types'
import { listingTitle } from '../lib/format'
import { Photo } from '../components/Photo'
import { PickupCard } from '../components/PickupCard'
import { Button, ErrorBox, Notice, PageHeader, PageSpinner } from '../components/ui'

export function ChatPage() {
  const { id } = useParams()
  const uid = useUserId()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const conv = useConversation(id)
  const messages = useMessages(id)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Nya meddelanden i realtid (om Supabase Realtime är på), annars hämtas de var 10:e sekund.
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`messages-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ['messages', id] })
        qc.invalidateQueries({ queryKey: ['conversation', id] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, qc])

  const count = messages.data?.length ?? 0
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
    if (id && count > 0) {
      rpc('mark_conversation_read', { p_conversation_id: id })
        .then(() => {
          qc.invalidateQueries({ queryKey: ['unread'] })
          qc.invalidateQueries({ queryKey: ['conversations'] })
        })
        .catch(() => {})
    }
  }, [id, count, qc])

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !id) return
    setSending(true)
    setError(null)
    const { error } = await supabase.from('messages').insert({ conversation_id: id, body })
    setSending(false)
    if (error) return setError(error)
    setText('')
    qc.invalidateQueries({ queryKey: ['messages', id] })
    qc.invalidateQueries({ queryKey: ['conversations'] })
  }

  if (conv.isLoading) return <PageSpinner />
  if (conv.error) return <ErrorBox error={conv.error} className="m-4" />
  const c = conv.data
  if (!c)
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Chatt" back="/chatt" />
        <p className="p-4 text-muted">Samtalet finns inte.</p>
      </div>
    )

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col">
      <PageHeader title={c.other_name} back={() => (window.history.length > 1 ? navigate(-1) : navigate('/chatt'))} />

      <div className="border-b border-line bg-surface px-4 py-3">
        <Link to={`/annons/${c.listing_id}`} className="flex items-center gap-3">
          <Photo path={c.thumb_path} category={c.category} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{listingTitle(c)}</div>
            <div className="text-xs text-muted">{c.my_role === 'giver' ? 'Du bjussar' : `${c.other_name} bjussar`}</div>
          </div>
        </Link>
        <ChatActions c={c} onChanged={() => refreshAll(qc)} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-bg px-4 py-4" data-testid="messages">
        {messages.isLoading && <PageSpinner />}
        {messages.data?.map((m) => <Bubble key={m.id} m={m} mine={m.sender_id === uid} />)}
        {messages.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            {c.my_role === 'taker' ? 'Ställ en fråga om saken, eller kom överens om hämtning.' : 'Inga meddelanden än.'}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="pb-safe border-t border-line bg-surface">
        <div className="flex items-end gap-2 p-3">
          <textarea
            aria-label="Meddelande"
            rows={1}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="Skriv ett meddelande…"
            className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-3 focus:border-brand focus:outline-none"
          />
          <Button type="submit" className="!px-4" loading={sending} disabled={!text.trim()} aria-label="Skicka">
            ➤
          </Button>
        </div>
        {!!error && <ErrorBox error={error} className="mx-3 mb-3" />}
      </form>
    </div>
  )
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  const time = new Date(m.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  if (m.kind === 'system')
    return (
      <div className="mx-auto max-w-[90%] rounded-2xl bg-brand-soft px-3 py-2 text-center text-xs text-brand-dark">{m.body}</div>
    )
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2 ${
          mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-surface'
        }`}
      >
        {m.body}
        <div className={`mt-0.5 text-right text-[10px] ${mine ? 'text-white/70' : 'text-muted'}`}>{time}</div>
      </div>
    </div>
  )
}

/** Knappar överst i chatten beroende på vem man är och var förfrågan står. */
function ChatActions({ c, onChanged }: { c: ConversationView; onChanged: () => void }) {
  const request = useAction<{ p_listing_id: string }>('request_listing')
  const approve = useAction<{ p_request_id: string }>('approve_request')
  const decline = useAction<{ p_request_id: string }>('decline_request')
  const cancel = useAction<{ p_request_id: string }>('cancel_request')
  const picked = useAction<{ p_request_id: string }>('mark_picked_up')
  const busy = request.isPending || approve.isPending || decline.isPending || cancel.isPending || picked.isPending
  const error = request.error ?? approve.error ?? decline.error ?? cancel.error ?? picked.error
  const rid = c.request_id
  const done = { onSuccess: onChanged }

  let content = null
  if (c.my_role === 'taker') {
    if (c.request_status === 'approved' && rid)
      content = (
        <>
          <PickupCard requestId={rid} />
          <div className="flex gap-2">
            <Button className="flex-1" loading={busy} onClick={() => picked.mutate({ p_request_id: rid }, done)}>
              ✅ Jag har hämtat
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => confirm('Ångra din förfrågan?') && cancel.mutate({ p_request_id: rid }, done)}>
              Ångra
            </Button>
          </div>
        </>
      )
    else if (c.request_status === 'pending' && rid)
      content = (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted">Du står i kö. Bjussaren väljer vem som får hämta.</span>
          <Button variant="ghost" className="!min-h-10 text-sm" disabled={busy} onClick={() => cancel.mutate({ p_request_id: rid }, done)}>
            Ångra
          </Button>
        </div>
      )
    else if (c.request_status === 'picked_up' && rid && !c.taker_confirmed)
      content = (
        <Button className="w-full" loading={busy} onClick={() => picked.mutate({ p_request_id: rid }, done)}>
          ✅ Bekräfta att du hämtat
        </Button>
      )
    else if (c.listing_status === 'available' && c.request_status !== 'picked_up')
      content = (
        <Button className="w-full" loading={busy} onClick={() => request.mutate({ p_listing_id: c.listing_id }, done)}>
          💚 Vill ha
        </Button>
      )
  } else if (rid) {
    if (c.request_status === 'pending')
      content = (
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} disabled={c.listing_status !== 'available'} onClick={() => approve.mutate({ p_request_id: rid }, done)}>
            Godkänn {c.other_name}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => confirm(`Tacka nej till ${c.other_name}?`) && decline.mutate({ p_request_id: rid }, done)}>
            Neka
          </Button>
        </div>
      )
    else if (c.request_status === 'approved')
      content = (
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} onClick={() => picked.mutate({ p_request_id: rid }, done)}>
            Markera som hämtad
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => confirm('Ångra godkännandet?') && decline.mutate({ p_request_id: rid }, done)}>
            Ångra
          </Button>
        </div>
      )
  }

  if (!content && !error) return null
  return (
    <div className="mt-3 space-y-2">
      {content}
      {c.my_role === 'giver' && c.request_status === 'pending' && c.listing_status === 'reserved' && (
        <Notice tone="warn">Du har redan godkänt någon annan för den här.</Notice>
      )}
      <ErrorBox error={error} />
    </div>
  )
}
