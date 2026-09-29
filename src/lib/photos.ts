// Bilderna ligger i privat lagring. För att visa dem skapas tillfälliga länkar
// (giltiga en timme) – bara för bilder man har rätt att se.
import { useQuery } from '@tanstack/react-query'
import { PHOTO_BUCKET, supabase } from './supabase'

const cache = new Map<string, { url: string; expires: number }>()
const pending = new Map<string, Promise<string | null>>()
let batch: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  const paths = batch
  batch = []
  timer = null
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
  const results = new Map<string, string | null>()
  if (!error && data) for (const d of data) if (d.path) results.set(d.path, d.signedUrl ?? null)
  for (const p of paths) {
    const url = results.get(p) ?? null
    if (url) cache.set(p, { url, expires: Date.now() + 50 * 60 * 1000 })
    resolvers.get(p)?.(url)
    resolvers.delete(p)
    pending.delete(p)
  }
}
const resolvers = new Map<string, (url: string | null) => void>()

/** Samlar ihop många bilder till ett enda anrop. */
export function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url)
  const existing = pending.get(path)
  if (existing) return existing
  const promise = new Promise<string | null>((resolve) => resolvers.set(path, resolve))
  pending.set(path, promise)
  batch.push(path)
  if (!timer) timer = setTimeout(flush, 20)
  return promise
}

export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['photo', path],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: () => signedUrl(path!),
  })
}
