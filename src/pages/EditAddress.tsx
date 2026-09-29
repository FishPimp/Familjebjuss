import { useNavigate } from 'react-router'
import { useMe } from '../lib/auth'
import { AddressForm } from '../components/AddressForm'
import { PageHeader, PageSpinner } from '../components/ui'

export function EditAddress() {
  const me = useMe()
  const navigate = useNavigate()
  if (me.isLoading) return <PageSpinner />
  return (
    <div>
      <PageHeader title="Ändra adress" back="/profil" />
      <div className="p-4">
        <AddressForm initial={me.data?.home} initialArea={me.data?.profile?.area_name} onSaved={() => navigate('/profil')} />
      </div>
    </div>
  )
}
