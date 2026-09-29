import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useChildren } from '../lib/queries'
import { describeNext, formatAge, sizeInfo, type Child } from '../lib/sizes'
import { CLOTHING_SIZES, SHOE_SIZES } from '../config'
import { Button, Card, ErrorBox, Input, Label, Select } from './ui'

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ChildrenCard() {
  const q = useChildren()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Child | 'new' | null>(null)

  async function remove(c: Child) {
    if (!confirm(`Ta bort ${c.nickname || 'barnet'}?`)) return
    await supabase.from('children').delete().eq('id', c.id)
    qc.invalidateQueries({ queryKey: ['children'] })
    qc.invalidateQueries({ queryKey: ['feed'] })
  }

  return (
    <Card className="space-y-3">
      <div id="barn" className="flex items-center justify-between">
        <h2 className="font-bold">Mina barn</h2>
        {!editing && (
          <button className="text-sm font-semibold text-brand" onClick={() => setEditing('new')}>
            + Lägg till
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Används för "Passar mina barn" i flödet och för att räkna ut när nästa storlek behövs. Syns bara för dig.
      </p>

      {q.data?.map((c) => {
        const info = sizeInfo(c)
        return editing && editing !== 'new' && editing.id === c.id ? (
          <ChildForm key={c.id} child={c} onDone={() => setEditing(null)} />
        ) : (
          <div key={c.id} className="rounded-2xl bg-bg p-3 text-sm" data-testid="child">
            <div className="flex items-center justify-between">
              <strong>
                {c.nickname || 'Barn'} · {formatAge(info.ageMonths)}
              </strong>
              <div className="flex gap-3 text-xs">
                <button className="text-brand" onClick={() => setEditing(c)}>
                  Ändra
                </button>
                <button className="text-muted" onClick={() => remove(c)}>
                  Ta bort
                </button>
              </div>
            </div>
            <p className="mt-1">👕 {describeNext(info)}</p>
            {info.shoe && (
              <p className="mt-1">
                👟 Skor {info.shoe}.{info.nextShoe ? ` Storlek ${info.nextShoe} behövs om ungefär ${info.monthsUntilNextShoe} månader.` : ''}
              </p>
            )}
          </div>
        )
      })}

      {editing === 'new' && <ChildForm onDone={() => setEditing(null)} />}
    </Card>
  )
}

function ChildForm({ child, onDone }: { child?: Child; onDone: () => void }) {
  const qc = useQueryClient()
  const [nickname, setNickname] = useState(child?.nickname ?? '')
  const [birth, setBirth] = useState(child?.birth_month.slice(0, 7) ?? '')
  const [cm, setCm] = useState<number | null>(child?.clothes_size_cm ?? null)
  const [shoe, setShoe] = useState<number | null>(child?.shoe_size ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function save() {
    setBusy(true)
    setError(null)
    const row = { nickname: nickname.trim() || null, birth_month: `${birth}-01`, clothes_size_cm: cm, shoe_size: shoe }
    const { error } = child
      ? await supabase.from('children').update(row).eq('id', child.id)
      : await supabase.from('children').insert(row)
    setBusy(false)
    if (error) return setError(error)
    qc.invalidateQueries({ queryKey: ['children'] })
    qc.invalidateQueries({ queryKey: ['feed'] })
    onDone()
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line p-3">
      <div>
        <Label htmlFor="child-name" optional>
          Smeknamn
        </Label>
        <Input id="child-name" maxLength={30} placeholder="T.ex. Lillen" value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="child-birth">Född (år och månad)</Label>
        <Input id="child-birth" type="month" max={thisMonth()} value={birth} onChange={(e) => setBirth(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="child-cm" optional>
            Klädstorlek nu
          </Label>
          <Select id="child-cm" value={cm ?? ''} onChange={(e) => setCm(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Vet ej</option>
            {CLOTHING_SIZES.map((s) => (
              <option key={s.cm} value={s.cm}>
                {s.cm}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="child-shoe" optional>
            Skostorlek nu
          </Label>
          <Select id="child-shoe" value={shoe ?? ''} onChange={(e) => setShoe(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Vet ej</option>
            {SHOE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button className="flex-1" loading={busy} disabled={!/^\d{4}-\d{2}$/.test(birth)} onClick={save}>
          Spara
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Avbryt
        </Button>
      </div>
    </div>
  )
}
