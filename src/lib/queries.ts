// Alla anrop till databasen samlade på ett ställe.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useUserId } from './auth'
import type {
  ConversationView,
  ListingRequest,
  ListingView,
  Message,
  MyListing,
  MyRequest,
  PickupDetails,
  UserStats,
  PublicProfile,
  PickupStatus,
} from './types'
import type { Child } from './sizes'

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Efter att något ändrats: hämta om allt som kan ha påverkats. */
export function refreshAll(qc: QueryClient) {
  for (const key of ['children', 'blocks', 'feed', 'listing', 'my-listings', 'listing-requests', 'my-requests', 'conversations', 'conversation', 'messages', 'unread', 'pickup', 'stats', 'pickup-status'])
    qc.invalidateQueries({ queryKey: [key] })
}

export interface FeedFilters {
  category?: string | null
  subcategory?: string | null
  sizesCm?: number[] | null
  shoeSizes?: number[] | null
  /** false = "passar mina barn": saker utan storlek visas också */
  sizeStrict?: boolean
  conditions?: string[] | null
  brand?: string | null
  search?: string | null
}

export function useFeed(filters: FeedFilters = {}) {
  const uid = useUserId()
  return useQuery({
    queryKey: ['feed', uid, filters],
    queryFn: () =>
      rpc<ListingView[]>('feed', {
        p_limit: 60,
        p_category: filters.category || null,
        p_subcategory: filters.subcategory || null,
        p_sizes_cm: filters.sizesCm?.length ? filters.sizesCm : null,
        p_shoe_sizes: filters.shoeSizes?.length ? filters.shoeSizes : null,
        p_size_strict: filters.sizeStrict ?? true,
        p_conditions: filters.conditions?.length ? filters.conditions : null,
        p_brand: filters.brand?.trim() || null,
        p_search: filters.search?.trim() || null,
      }),
  })
}

export function useChildren() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['children', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('children').select('*').order('birth_month', { ascending: false })
      if (error) throw error
      return data as Child[]
    },
  })
}

export function useUserStats(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['stats', userId],
    enabled: !!userId,
    queryFn: async () => (await rpc<UserStats[]>('user_stats', { p_user_id: userId }))[0] ?? null,
  })
}

export function useMyBlocks() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['blocks', uid],
    queryFn: () => rpc<{ user_id: string; display_name: string; created_at: string }[]>('my_blocks'),
  })
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ['listing', id],
    enabled: !!id,
    queryFn: async () => (await rpc<ListingView[]>('get_listing', { p_listing_id: id }))[0] ?? null,
  })
}

export function useMyListings() {
  const uid = useUserId()
  return useQuery({ queryKey: ['my-listings', uid], queryFn: () => rpc<MyListing[]>('my_listings') })
}

export function useListingRequests(listingId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['listing-requests', listingId],
    enabled: !!listingId && enabled,
    queryFn: () => rpc<ListingRequest[]>('listing_requests', { p_listing_id: listingId }),
  })
}

export function useMyRequests() {
  const uid = useUserId()
  return useQuery({ queryKey: ['my-requests', uid], queryFn: () => rpc<MyRequest[]>('my_requests') })
}

export function usePickupDetails(requestId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pickup', requestId],
    enabled: !!requestId && enabled,
    queryFn: async () => (await rpc<PickupDetails[]>('get_pickup_details', { p_request_id: requestId }))[0] ?? null,
  })
}

export function useConversations() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['conversations', uid],
    refetchInterval: 30000,
    queryFn: () => rpc<ConversationView[]>('my_conversations'),
  })
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: async () => (await rpc<ConversationView[]>('get_conversation', { p_conversation_id: id }))[0] ?? null,
  })
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return data as Message[]
    },
  })
}

/** Gemensam "gör något och uppdatera allt"-hjälpare för knappar. */
export function useAction<TArgs extends Record<string, unknown>, TResult = unknown>(fn: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: TArgs) => rpc<TResult>(fn, args),
    onSettled: () => refreshAll(qc),
  })
}

export function usePublicProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['stats', 'profile', userId],
    enabled: !!userId,
    queryFn: async () => (await rpc<PublicProfile[]>('public_profile', { p_user_id: userId }))[0] ?? null,
  })
}

export function usePickupStatus() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['pickup-status', uid],
    enabled: !!uid,
    queryFn: async () => (await rpc<PickupStatus[]>('my_pickup_status'))[0] ?? null,
  })
}
