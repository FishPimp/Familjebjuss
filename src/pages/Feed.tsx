import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMe } from '../lib/auth'
import { useChildren, useFeed, type FeedFilters } from '../lib/queries'
import { fittingSizes } from '../lib/sizes'
import { BRAND_SUGGESTIONS, CATEGORIES, CLOTHING_SIZES, CONDITIONS, SHOE_SIZES, categoryById, sizeTypeFor } from '../config'
import { ListingCard } from '../components/ListingCard'
import { Button, Chip, EmptyState, ErrorBox, Input, Label, LinkButton, PageSpinner, Select } from '../components/ui'

const FIT_KEY = 'bjuss.fit'

function readFit(): boolean {
  try {
    return localStorage.getItem(FIT_KEY) !== '0'
  } catch {
    return true
  }
}

export function Feed() {
  const me = useMe()
  const children = useChildren()
  const area = me.data?.profile?.area_name

  const [category, setCategory] = useState<string | null>(null)
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [conditions, setConditions] = useState<string[]>([])
  const [brand, setBrand] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [fit, setFit] = useState(readFit)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fitting = useMemo(() => fittingSizes(children.data ?? []), [children.data])
  const canFit = fitting.cm.length > 0 || fitting.shoes.length > 0
  const fitOn = fit && canFit
  const sizeType = category ? sizeTypeFor(category, subcategory) : 'none'

  const filters: FeedFilters = {
    category,
    subcategory,
    conditions,
    brand,
    search,
    ...(size
      ? { sizesCm: sizeType === 'clothes' ? [size] : null, shoeSizes: sizeType === 'shoes' ? [size] : null, sizeStrict: true }
      : fitOn
        ? { sizesCm: fitting.cm, shoeSizes: fitting.shoes, sizeStrict: false }
        : {}),
  }
  const feed = useFeed(filters)
  const extraCount = (subcategory ? 1 : 0) + (size ? 1 : 0) + conditions.length + (brand.trim() ? 1 : 0)

  function toggleFit() {
    const next = !fit
    setFit(next)
    try {
      localStorage.setItem(FIT_KEY, next ? '1' : '0')
    } catch {
      // inget
    }
  }

  function clearAll() {
    setCategory(null)
    setSubcategory(null)
    setSize(null)
    setConditions([])
    setBrand('')
    setSearchInput('')
  }

  const cat = category ? categoryById(category) : null

  return (
    <div>
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Bjuss</h1>
          <p className="text-sm text-muted">Nära dig{area ? ` i ${area}` : ''}</p>
        </div>
        <button
          onClick={() => feed.refetch()}
          className="rounded-full border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand"
          aria-label="Uppdatera"
        >
          ↻
        </button>
      </header>

      <div className="space-y-2 px-4 pb-2">
        <Input type="search" aria-label="Sök" placeholder="🔎 Sök, t.ex. overall eller Reima" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {canFit ? (
            <Chip selected={fitOn} onClick={toggleFit} className="shrink-0">
              👶 Passar mina barn
            </Chip>
          ) : (
            <Link to="/profil#barn" className="flex min-h-11 shrink-0 items-center rounded-2xl border border-dashed border-brand/50 px-4 text-sm font-medium text-brand">
              👶 Lägg till barn
            </Link>
          )}
          <Chip selected={showFilters || extraCount > 0} onClick={() => setShowFilters(!showFilters)} className="shrink-0">
            ⚙️ Filter{extraCount > 0 ? ` (${extraCount})` : ''}
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              selected={category === c.id}
              className="shrink-0"
              onClick={() => {
                setCategory(category === c.id ? null : c.id)
                setSubcategory(null)
                setSize(null)
              }}
            >
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>

        {showFilters && (
          <div className="space-y-4 rounded-3xl border border-line bg-surface p-4" data-testid="filter-panel">
            {cat && cat.subcategories.length > 0 && (
              <div>
                <Label>Typ</Label>
                <div className="flex flex-wrap gap-2">
                  {cat.subcategories.map((s) => (
                    <Chip key={s} selected={subcategory === s} onClick={() => setSubcategory(subcategory === s ? null : s)}>
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {sizeType !== 'none' && (
              <div>
                <Label htmlFor="filter-size">Storlek</Label>
                <Select id="filter-size" value={size ?? ''} onChange={(e) => setSize(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{fitOn ? 'Passar mina barn' : 'Alla storlekar'}</option>
                  {sizeType === 'clothes'
                    ? CLOTHING_SIZES.map((s) => (
                        <option key={s.cm} value={s.cm}>
                          {s.cm} · {s.label}
                        </option>
                      ))
                    : SHOE_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                </Select>
              </div>
            )}
            {!category && <p className="text-xs text-muted">Välj en kategori ovan för att filtrera på typ och storlek.</p>}
            <div>
              <Label>Skick</Label>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c.id}
                    selected={conditions.includes(c.id)}
                    onClick={() => setConditions(conditions.includes(c.id) ? conditions.filter((x) => x !== c.id) : [...conditions, c.id])}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="filter-brand">Varumärke</Label>
              <Input id="filter-brand" list="filter-brands" placeholder="T.ex. Reima" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <datalist id="filter-brands">
                {BRAND_SUGGESTIONS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={clearAll}>
                Rensa
              </Button>
              <Button className="flex-1" onClick={() => setShowFilters(false)}>
                Visa
              </Button>
            </div>
          </div>
        )}
      </div>

      {feed.isLoading ? (
        <PageSpinner />
      ) : feed.error ? (
        <ErrorBox error={feed.error} className="m-4" />
      ) : !feed.data?.length ? (
        category || extraCount || search || fitOn ? (
          <EmptyState emoji="🔍" title="Inget som matchar">
            <p className="mb-5">Prova att ta bort något filter{fitOn ? ' eller slå av "Passar mina barn"' : ''}.</p>
            <Button variant="secondary" onClick={() => (clearAll(), fitOn && toggleFit())}>
              Visa allt
            </Button>
          </EmptyState>
        ) : (
          <EmptyState emoji="🌱" title="Inget att hämta just nu">
            <p className="mb-5">Inga grannar har bjussat något i närheten än. Bli först – det tar under en minut!</p>
            <LinkButton to="/bjussa">Bjussa något</LinkButton>
          </EmptyState>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-2">
          {feed.data.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  )
}
