/** Kort sammanfattning av en persons statistik, t.ex. i en förfrågan. Bara antal – aldrig vem. */
export function UserStatsLine({
  given,
  received,
  noShows,
  reliability,
}: {
  given: number | null
  received: number | null
  noShows: number | null
  reliability: number | null
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted" data-testid="user-stats">
      <span>🎁 Bjussat {given ?? 0}</span>
      <span>🧺 Hämtat {received ?? 0}</span>
      {reliability != null ? (
        <span className={reliability < 80 ? 'font-semibold text-danger' : ''}>
          ✔️ {reliability} % hämtat i tid{noShows ? ` (${noShows} missade)` : ''}
        </span>
      ) : (
        <span>✨ Ny på Bjuss</span>
      )}
    </div>
  )
}
