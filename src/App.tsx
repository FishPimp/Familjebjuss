import { Navigate, Outlet, Route, Routes } from 'react-router'
import { configMissing } from './lib/supabase'
import { useAuth, useMe } from './lib/auth'
import { BottomNav } from './components/BottomNav'
import { ErrorBox, PageSpinner } from './components/ui'
import { SetupMissing } from './pages/SetupMissing'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Feed } from './pages/Feed'
import { NewListing } from './pages/NewListing'
import { ListingPage } from './pages/ListingPage'
import { Mine } from './pages/Mine'
import { Chats } from './pages/Chats'
import { ChatPage } from './pages/ChatPage'
import { ProfilePage } from './pages/ProfilePage'
import { EditAddress } from './pages/EditAddress'
import { Privacy } from './pages/Privacy'

function Layout() {
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-28">
      <Outlet />
      <BottomNav />
    </div>
  )
}

function RequireReady() {
  const { session, loading } = useAuth()
  const me = useMe()
  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (me.isLoading) return <PageSpinner />
  if (me.error)
    return (
      <div className="mx-auto max-w-md p-4">
        <ErrorBox error={me.error} />
      </div>
    )
  if (!me.data?.profile || !me.data?.home) return <Navigate to="/valkommen" replace />
  return <Outlet />
}

export function App() {
  if (configMissing) return <SetupMissing />
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/valkommen" element={<Onboarding />} />
      <Route path="/integritet" element={<Privacy />} />
      <Route element={<RequireReady />}>
        <Route element={<Layout />}>
          <Route index element={<Feed />} />
          <Route path="/annons/:id" element={<ListingPage />} />
          <Route path="/mina" element={<Mine />} />
          <Route path="/chatt" element={<Chats />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/profil/adress" element={<EditAddress />} />
        </Route>
        <Route path="/bjussa" element={<NewListing />} />
        <Route path="/chatt/:id" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
