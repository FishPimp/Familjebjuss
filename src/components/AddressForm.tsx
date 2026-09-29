import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { currentPosition, reverseGeocode, searchAddress, type GeoResult } from '../lib/geocode'
import type { Home } from '../lib/types'
import { Button, Chip, ErrorBox, Input, Label, Notice } from './ui'

type Located = GeoResult & { source: 'gps' | 'search' }

export function AddressForm({
  initial,
  initialArea,
  submitLabel = 'Spara adress',
  onSaved,
}: {
  initial?: Home | null
  initialArea?: string | null
  submitLabel?: string
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [street, setStreet] = useState(initial?.street_address ?? '')
  const [postal, setPostal] = useState(initial?.postal_code ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [geo, setGeo] = useState<Located | null>(
    initial ? { lat: initial.lat, lng: initial.lng, areas: initialArea ? [initialArea] : [], city: initial.city, postalCode: initial.postal_code, street: initial.street_address, source: 'search' } : null,
  )
  const [area, setArea] = useState<string>(initialArea ?? '')
  const [busy, setBusy] = useState<'gps' | 'search' | 'save' | null>(null)
  const [error, setError] = useState<unknown>(null)

  function onAddressChange(setter: (v: string) => void, value: string) {
    setter(value)
    if (geo?.source === 'search') {
      setGeo(null)
      setArea('')
    }
  }

  async function useGps() {
    setBusy('gps')
    setError(null)
    try {
      const pos = await currentPosition()
      const res = await reverseGeocode(pos.lat, pos.lng)
      setGeo({ ...res, source: 'gps' })
      setArea(res.areas[0] ?? '')
      if (!street && res.street) setStreet(res.street)
      if (!postal && res.postalCode) setPostal(res.postalCode)
      if (!city && res.city) setCity(res.city)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function find() {
    setBusy('search')
    setError(null)
    try {
      const res = await searchAddress(street, postal, city)
      if (!res) {
        setError('Vi hittade inte adressen. Kontrollera stavningen, eller tryck "Använd min plats" när du är hemma.')
        return
      }
      setGeo({ ...res, source: 'search' })
      setArea(res.areas[0] ?? '')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!geo) return
    setBusy('save')
    setError(null)
    const { error } = await supabase.rpc('set_home', {
      p_street_address: street,
      p_postal_code: postal,
      p_city: city,
      p_lat: geo.lat,
      p_lng: geo.lng,
      p_area_name: area,
      p_area_city: geo.city ?? city,
    })
    setBusy(null)
    if (error) return setError(error)
    await qc.invalidateQueries({ queryKey: ['me'] })
    await qc.invalidateQueries({ queryKey: ['feed'] })
    onSaved()
  }

  const addressFilled = street.trim().length > 1 && postal.replace(/\D/g, '').length === 5 && city.trim().length > 0

  return (
    <div className="space-y-4">
      <Notice>
        🔒 Din gatuadress och portkod visas <strong>bara</strong> för den du själv godkänner att hämta. Andra ser bara ditt
        område (t.ex. "Aspudden") och ungefärligt avstånd.
      </Notice>

      <Button variant="secondary" className="w-full" onClick={useGps} loading={busy === 'gps'}>
        📍 Använd min plats (när du är hemma)
      </Button>

      <div className="space-y-3">
        <div>
          <Label htmlFor="street">Gatuadress</Label>
          <Input id="street" autoComplete="street-address" placeholder="Storgatan 12" value={street} onChange={(e) => onAddressChange(setStreet, e.target.value)} />
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2">
            <Label htmlFor="postal">Postnummer</Label>
            <Input id="postal" inputMode="numeric" autoComplete="postal-code" placeholder="126 49" value={postal} onChange={(e) => onAddressChange(setPostal, e.target.value)} />
          </div>
          <div className="col-span-3">
            <Label htmlFor="city">Ort</Label>
            <Input id="city" autoComplete="address-level2" placeholder="Hägersten" value={city} onChange={(e) => onAddressChange(setCity, e.target.value)} />
          </div>
        </div>
        {!geo && (
          <Button variant="secondary" className="w-full" onClick={find} disabled={!addressFilled} loading={busy === 'search'}>
            🔎 Hitta mitt område
          </Button>
        )}
      </div>

      {geo && (
        <div className="space-y-2">
          <Label>Vilket område bor du i?</Label>
          {geo.areas.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {geo.areas.map((a) => (
                <Chip key={a} selected={area === a} onClick={() => setArea(a)}>
                  {a}
                </Chip>
              ))}
            </div>
          ) : (
            <Input placeholder="T.ex. Aspudden" value={area} onChange={(e) => setArea(e.target.value)} />
          )}
          <p className="text-xs text-muted">Det här är det enda andra ser om var du bor.</p>
        </div>
      )}

      <ErrorBox error={error} />

      <Button className="w-full" onClick={save} disabled={!geo || !area || !addressFilled} loading={busy === 'save'}>
        {submitLabel}
      </Button>
      <p className="text-center text-[11px] text-muted">Adressökning: © OpenStreetMap-bidragsgivare</p>
    </div>
  )
}
