import { usePhotoUrl } from '../lib/photos'
import { categoryEmoji } from '../lib/format'

export function Photo({
  path,
  category,
  alt,
  className = '',
}: {
  path: string | null | undefined
  category?: string
  alt: string
  className?: string
}) {
  const { data: url } = usePhotoUrl(path)
  return (
    <div className={`relative overflow-hidden bg-brand-soft ${className}`}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden>
          {categoryEmoji(category ?? '')}
        </div>
      )}
    </div>
  )
}
