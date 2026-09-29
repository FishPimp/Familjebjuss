import type { CategoryId, Condition, PickupMethod } from '../config'

export type ListingStatus = 'available' | 'reserved' | 'picked_up' | 'removed'
export type RequestStatus = 'pending' | 'approved' | 'picked_up' | 'declined' | 'cancelled' | 'expired'

export interface Profile {
  id: string
  display_name: string
  area_name: string | null
  area_city: string | null
  consent_at: string
  privacy_version: string
  created_at: string
}

export interface Home {
  street_address: string
  postal_code: string
  city: string
  lat: number
  lng: number
}

export interface ListingView {
  id: string
  giver_id: string
  giver_name: string
  category: CategoryId
  subcategory: string | null
  size_cm: number | null
  shoe_size: number | null
  condition: Condition
  quantity: number
  brand: string | null
  description: string | null
  photo_path: string
  thumb_path: string
  pickup_method: PickupMethod
  pickup_from: string | null
  pickup_to: string | null
  status: ListingStatus
  area_name: string | null
  area_city: string | null
  created_at: string
  distance_m: number | null
  is_mine: boolean
  my_request_id: string | null
  my_request_status: RequestStatus | null
  my_queue_position: number | null
  my_conversation_id: string | null
  queue_length: number
}

export interface MyListing {
  id: string
  category: CategoryId
  subcategory: string | null
  size_cm: number | null
  shoe_size: number | null
  condition: Condition
  quantity: number
  thumb_path: string
  status: ListingStatus
  pickup_method: PickupMethod
  created_at: string
  pending_count: number
  approved_request_id: string | null
  approved_taker_name: string | null
  approved_deadline: string | null
}

export interface ListingRequest {
  id: string
  status: RequestStatus
  created_at: string
  approved_at: string | null
  pickup_deadline: string | null
  picked_up_at: string | null
  taker_confirmed: boolean
  taker_id: string | null
  taker_name: string
  conversation_id: string | null
  taker_given: number | null
  taker_received: number | null
  taker_no_shows: number | null
  taker_reliability_pct: number | null
}

export interface MyRequest {
  id: string
  status: RequestStatus
  created_at: string
  approved_at: string | null
  pickup_deadline: string | null
  picked_up_at: string | null
  taker_confirmed: boolean
  close_reason: string | null
  queue_position: number | null
  listing_id: string
  category: CategoryId
  subcategory: string | null
  size_cm: number | null
  shoe_size: number | null
  thumb_path: string
  listing_status: ListingStatus
  pickup_method: PickupMethod
  area_name: string | null
  giver_id: string
  giver_name: string
  conversation_id: string | null
  rating: 'as_described' | 'not_quite' | null
}

export interface PickupDetails {
  street_address: string
  postal_code: string
  city: string
  door_code: string | null
  instructions: string | null
  pickup_method: PickupMethod
  pickup_from: string | null
  pickup_to: string | null
  pickup_deadline: string | null
}

export interface ConversationView {
  id: string
  listing_id: string
  category: CategoryId
  subcategory: string | null
  size_cm: number | null
  shoe_size: number | null
  thumb_path: string
  listing_status: ListingStatus
  pickup_method: PickupMethod
  my_role: 'giver' | 'taker'
  other_user_id: string | null
  other_name: string
  last_message_at: string | null
  last_message_preview: string | null
  unread: boolean
  request_id: string | null
  request_status: RequestStatus | null
  taker_confirmed: boolean | null
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  kind: 'user' | 'system'
  body: string
  created_at: string
}

export interface UserStats {
  user_id: string
  given_count: number
  received_count: number
  no_show_count: number
  reliability_pct: number | null
  rating_good: number
  rating_total: number
}
