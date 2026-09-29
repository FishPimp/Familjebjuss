import { useNavigate, useParams } from 'react-router'
import { usePublicProfile } from '../lib/queries'
import { StatsCard } from '../components/StatsCard'
import { ReportBlockMenu } from '../components/ReportBlock'
import { EmptyState, ErrorBox, PageHeader, PageSpinner } from '../components/ui'
import { useUserId } from '../lib/auth'

export function PublicProfilePage() {
  const { id } = useParams()
  const uid = useUserId()
  const navigate = useNavigate()
  const q = usePublicProfile(id)

  if (q.isLoading) return <PageSpinner />
  if (q.error) return <ErrorBox error={q.error} className="m-4" />
  const p = q.data
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  if (!p)
    return (
      <>
        <PageHeader title="Profil" back={back} />
        <EmptyState emoji="🫥" title="Profilen finns inte" />
      </>
    )

  const since = new Date(p.member_since).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  return (
    <div>
      <PageHeader title={p.display_name} back={back} right={p.id !== uid && <ReportBlockMenu userId={p.id} userName={p.display_name} />} />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-2xl font-extrabold">{p.display_name}</h2>
          <p className="text-sm text-muted">
            📍 {p.area_name} · med sedan {since}
          </p>
        </div>
        <StatsCard p={p} own={p.id === uid} />
        <p className="text-xs text-muted">Bjuss visar bara antal – aldrig vem någon gett till eller fått av.</p>
      </div>
    </div>
  )
}
