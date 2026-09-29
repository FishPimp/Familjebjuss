import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { PHOTO_BUCKET, supabase } from '../lib/supabase'
import { useUserId } from '../lib/auth'
import { processPhoto, type ProcessedPhoto } from '../lib/image'
import { refreshAll, rpc } from '../lib/queries'
import {
  BRAND_SUGGESTIONS,
  CATEGORIES,
  CLOTHING_SIZES,
  CONDITIONS,
  PICKUP_METHODS,
  SHOE_SIZES,
  categoryById,
  sizeTypeFor,
  type CategoryId,
  type Condition,
  type PickupMethod,
} from '../config'
import { Button, Chip, ErrorBox, Input, Label, Notice, PageHeader, Select, Textarea } from '../components/ui'

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function defaultWindow() {
  const from = new Date()
  from.setMinutes(0, 0, 0)
  from.setHours(from.getHours() + 1)
  const to = new Date(from.getTime() + 2 * 3600 * 1000)
  return { date: localInput(from).date, from: localInput(from).time, to: localInput(to).time }
}

export function NewListing() {
  const uid = useUserId()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [category, setCategory] = useState<CategoryId | null>(null)
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [sizeCm, setSizeCm] = useState<number | null>(null)
  const [shoeSize, setShoeSize] = useState<number | null>(null)
  const [condition, setCondition] = useState<Condition | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [pickup, setPickup] = useState<PickupMethod>('door')
  const [doorCode, setDoorCode] = useState('')
  const [instructions, setInstructions] = useState('')
  const [slot, setSlot] = useState(defaultWindow)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  const cat = category ? categoryById(category) : null
  const sizeType = category ? sizeTypeFor(category, subcategory) : 'none'

  const windowIso = useMemo(() => {
    const from = new Date(`${slot.date}T${slot.from}`)
    const to = new Date(`${slot.date}T${slot.to}`)
    return { from, to, valid: to > from && to > new Date() }
  }, [slot])

  const missing: string[] = []
  if (!photo) missing.push('foto')
  if (!category) missing.push('kategori')
  if (sizeType === 'clothes' && !sizeCm) missing.push('storlek')
  if (sizeType === 'shoes' && !shoeSize) missing.push('storlek')
  if (!condition) missing.push('skick')
  if (pickup === 'home' && !windowIso.valid) missing.push('en tid framåt')

  async function onFile(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    setError(null)
    try {
      setPhoto(await processPhoto(file))
    } catch (e) {
      setError(e)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function publish() {
    if (!photo || !category || !condition || !uid) return
    setBusy(true)
    setError(null)
    const id = crypto.randomUUID()
    const photoPath = `${uid}/${id}.jpg`
    const thumbPath = `${uid}/${id}_thumb.jpg`
    const bucket = supabase.storage.from(PHOTO_BUCKET)
    try {
      const up1 = await bucket.upload(photoPath, photo.full, { contentType: 'image/jpeg', upsert: false })
      if (up1.error) throw up1.error
      const up2 = await bucket.upload(thumbPath, photo.thumb, { contentType: 'image/jpeg', upsert: false })
      if (up2.error) throw up2.error
      const listingId = await rpc<string>('create_listing', {
        p_category: category,
        p_condition: condition,
        p_photo_path: photoPath,
        p_thumb_path: thumbPath,
        p_pickup_method: pickup,
        p_subcategory: subcategory,
        p_size_cm: sizeType === 'clothes' ? sizeCm : null,
        p_shoe_size: sizeType === 'shoes' ? shoeSize : null,
        p_quantity: quantity,
        p_brand: brand || null,
        p_description: description || null,
        p_pickup_from: pickup === 'home' ? windowIso.from.toISOString() : null,
        p_pickup_to: pickup === 'home' ? windowIso.to.toISOString() : null,
        p_door_code: pickup === 'door' ? doorCode || null : null,
        p_instructions: pickup === 'door' ? instructions || null : null,
      })
      refreshAll(qc)
      navigate(`/annons/${listingId}?ny=1`, { replace: true })
    } catch (e) {
      await bucket.remove([photoPath, thumbPath]).catch(() => {})
      setError(e)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-32">
      <PageHeader title="Bjussa något" back={() => navigate(-1)} />

      <div className="space-y-7 px-4 pt-4">
        {/* Foto */}
        <section>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" data-testid="photo-input" onChange={(e) => onFile(e.target.files?.[0])} />
          {photo ? (
            <div className="relative">
              <img src={photo.previewUrl} alt="Din bild" className="aspect-square w-full rounded-3xl object-cover" />
              <button
                onClick={() => cameraRef.current?.click()}
                className="absolute bottom-3 right-3 rounded-full bg-surface/90 px-4 py-2 text-sm font-semibold shadow"
              >
                📷 Ta om
              </button>
            </div>
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-brand/40 bg-brand-soft/50">
              <Button onClick={() => cameraRef.current?.click()} loading={photoBusy}>
                📷 Fota
              </Button>
              <button className="text-sm font-semibold text-brand underline" onClick={() => galleryRef.current?.click()}>
                eller välj en bild
              </button>
              <p className="px-6 text-center text-xs text-muted">Fota gärna hela högen. Inga barn på bilden, tack!</p>
            </div>
          )}
        </section>

        {/* Kategori */}
        <section>
          <Label>Vad är det?</Label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => {
                  setCategory(c.id)
                  setSubcategory(null)
                }}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center text-xs font-semibold ${
                  category === c.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {c.emoji}
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </section>

        {cat && cat.subcategories.length > 0 && (
          <section>
            <Label optional>Typ</Label>
            <div className="flex flex-wrap gap-2">
              {cat.subcategories.map((s) => (
                <Chip key={s} selected={subcategory === s} onClick={() => setSubcategory(subcategory === s ? null : s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </section>
        )}

        {sizeType === 'clothes' && (
          <section>
            <Label htmlFor="size">Storlek</Label>
            <Select id="size" value={sizeCm ?? ''} onChange={(e) => setSizeCm(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Välj storlek</option>
              {CLOTHING_SIZES.map((s) => (
                <option key={s.cm} value={s.cm}>
                  {s.cm} · {s.label}
                </option>
              ))}
            </Select>
          </section>
        )}
        {sizeType === 'shoes' && (
          <section>
            <Label htmlFor="shoe">Storlek (EU)</Label>
            <Select id="shoe" value={shoeSize ?? ''} onChange={(e) => setShoeSize(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Välj storlek</option>
              {SHOE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </section>
        )}

        {/* Skick */}
        <section>
          <Label>Skick</Label>
          <div className="grid grid-cols-3 gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={condition === c.id}
                onClick={() => setCondition(c.id)}
                className={`min-h-16 rounded-2xl border p-2 text-center text-sm font-semibold ${
                  condition === c.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                }`}
              >
                {c.label}
                <span className={`block text-[11px] font-normal ${condition === c.id ? 'text-white/80' : 'text-muted'}`}>{c.hint}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Antal */}
        <section className="flex items-center justify-between">
          <div>
            <Label>Antal</Label>
            <p className="-mt-1 text-xs text-muted">Plagg eller saker i kassen</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="h-11 w-11 rounded-full border border-line bg-surface text-xl" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Färre">
              −
            </button>
            <span className="w-8 text-center text-lg font-bold" data-testid="quantity">
              {quantity}
            </span>
            <button type="button" className="h-11 w-11 rounded-full border border-line bg-surface text-xl" onClick={() => setQuantity((q) => Math.min(200, q + 1))} aria-label="Fler">
              +
            </button>
          </div>
        </section>

        <section>
          <Label htmlFor="brand" optional>
            Varumärke
          </Label>
          <Input id="brand" list="brands" maxLength={60} placeholder="T.ex. Polarn O. Pyret" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <datalist id="brands">
            {BRAND_SUGGESTIONS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </section>

        <section>
          <Label htmlFor="desc" optional>
            Något mer att veta?
          </Label>
          <Textarea id="desc" rows={2} maxLength={500} placeholder="T.ex. liten fläck på ärmen" value={description} onChange={(e) => setDescription(e.target.value)} />
        </section>

        {/* Hämtning */}
        <section className="space-y-3">
          <Label>Hur hämtas det?</Label>
          <div className="grid grid-cols-2 gap-2">
            {PICKUP_METHODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={pickup === p.id}
                onClick={() => setPickup(p.id)}
                className={`min-h-20 rounded-2xl border p-3 text-left text-sm font-semibold ${
                  pickup === p.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {p.emoji}
                </span>{' '}
                {p.label}
                <span className={`block text-xs font-normal ${pickup === p.id ? 'text-white/80' : 'text-muted'}`}>{p.hint}</span>
              </button>
            ))}
          </div>

          {pickup === 'door' ? (
            <div className="space-y-3 rounded-2xl bg-surface p-3">
              <div>
                <Label htmlFor="door" optional>
                  Portkod
                </Label>
                <Input id="door" maxLength={40} placeholder="T.ex. 1234" value={doorCode} onChange={(e) => setDoorCode(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="instr" optional>
                  Instruktion
                </Label>
                <Input id="instr" maxLength={300} placeholder="T.ex. 3 tr, kassen hänger på dörren" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </div>
              <p className="text-xs text-muted">🔒 Portkod och instruktion visas bara för den du godkänner.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface p-3">
              <div className="col-span-3">
                <Label htmlFor="date">Dag</Label>
                <Input id="date" type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} />
              </div>
              <div className="col-span-3 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="from">Från</Label>
                  <Input id="from" type="time" value={slot.from} onChange={(e) => setSlot({ ...slot, from: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="to">Till</Label>
                  <Input id="to" type="time" value={slot.to} onChange={(e) => setSlot({ ...slot, to: e.target.value })} />
                </div>
              </div>
              {!windowIso.valid && <p className="col-span-3 text-xs text-danger">Välj en sluttid som ligger efter starttiden och framåt i tiden.</p>}
            </div>
          )}
        </section>

        <ErrorBox error={error} />
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-md space-y-2 p-4">
          {missing.length > 0 && <Notice className="py-2 text-center text-xs">Saknas: {missing.join(', ')}</Notice>}
          <Button className="w-full" disabled={missing.length > 0} loading={busy} onClick={publish}>
            Bjussa!
          </Button>
        </div>
      </div>
    </div>
  )
}
