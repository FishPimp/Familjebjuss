import type { PublicProfile } from '../lib/types'
import { MEDALS, earnedMedals, nextMedal } from '../lib/medals'
import { Card } from './ui'

/** Öppen statistik och medaljer. Visar bara antal – aldrig vem man gett till eller fått av. */
export function StatsCard({ p, own }: { p: PublicProfile; own?: boolean }) {
  const earned = earnedMedals(p.medal_points)
  const next = nextMedal(p.medal_points)
  const ratingPct = p.rating_total > 0 ? Math.round((100 * p.rating_good) / p.rating_total) : null

  return (
    <Card className="space-y-4" data-testid="stats-card">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-brand-soft p-3">
          <div className="text-3xl font-extrabold text-brand-dark">{p.given_count}</div>
          <div className="text-xs font-semibold text-brand-dark">bjussningar</div>
        </div>
        <div className="rounded-2xl bg-accent-soft p-3">
          <div className="text-3xl font-extrabold">{p.received_count}</div>
          <div className="text-xs font-semibold">hämtningar</div>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Hämtat i tid</span>
          <strong>{p.reliability_pct != null ? `${p.reliability_pct} %` : 'Ny – inga hämtningar än'}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Stämde med beskrivningen</span>
          <strong>{ratingPct != null ? `${ratingPct} % (${p.rating_total} omdömen)` : 'Inga omdömen än'}</strong>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-bold">Medaljer</div>
        <div className="grid grid-cols-4 gap-2" data-testid="medals">
          {MEDALS.map((m) => {
            const has = earned.includes(m)
            return (
              <div
                key={m.at}
                title={`${m.name} – ${m.at} bjussningar`}
                className={`flex min-w-0 flex-col items-center rounded-2xl border px-1 py-2 text-center ${
                  has ? 'border-accent bg-accent-soft' : 'border-line opacity-40 grayscale'
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {m.emoji}
                </span>
                <span className="w-full text-[10px] font-semibold leading-tight [overflow-wrap:anywhere]">{m.name}</span>
                <span className="text-[10px] text-muted">{m.at}</span>
              </div>
            )
          })}
        </div>
        {own && (
          <p className="mt-2 text-xs text-muted">
            {next
              ? `${next.at - p.medal_points} bjussningar kvar till ${next.emoji} ${next.name}.`
              : 'Du har alla medaljer! 🎉'}{' '}
            Medaljer räknas när mottagaren bekräftat hämtningen, högst två per granne och månad.
          </p>
        )}
      </div>
    </Card>
  )
}
