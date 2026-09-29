import { Link } from 'react-router'
import type { ListingView } from '../lib/types'
import { conditionLabel, pickupLabel } from '../config'
import { formatDistance, listingSize, listingTitle, timeAgo } from '../lib/format'
import { Photo } from './Photo'
import { Badge } from './ui'

export function ListingCard({ listing }: { listing: ListingView }) {
  const size = listingSize(listing)
  return (
    <Link
      to={`/annons/${listing.id}`}
      className="block overflow-hidden rounded-3xl border border-line bg-surface shadow-sm transition active:scale-[0.99]"
    >
      <Photo path={listing.thumb_path} category={listing.category} alt={listingTitle(listing)} className="aspect-square w-full" />
      <div className="space-y-1 p-3">
        <div className="line-clamp-2 font-bold leading-tight">{listingTitle(listing)}</div>
        {size && <div className="text-sm text-ink">{size}</div>}
        <div className="text-xs text-muted">{conditionLabel(listing.condition)}</div>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <Badge tone="brand">📍 {listing.area_name ?? 'Nära'}</Badge>
          {listing.distance_m != null && <Badge>{formatDistance(listing.distance_m)}</Badge>}
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-muted">
          <span>{pickupLabel(listing.pickup_method)}</span>
          <span>{timeAgo(listing.created_at)}</span>
        </div>
        {listing.my_request_status === 'pending' && <Badge tone="accent">Du står i kö</Badge>}
      </div>
    </Link>
  )
}
