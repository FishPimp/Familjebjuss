// Skickar fotot till Edge Function "analyze-photo" (som frågar Claude) och får tillbaka förslag.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { blobToBase64 } from './image'
import type { CategoryId, Condition } from '../config'

export interface AiSuggestion {
  category: CategoryId
  subcategory: string | null
  size_cm: number | null
  shoe_size: number | null
  quantity: number
  condition: Condition
  brand: string | null
  description: string
  contains_car_seat: boolean
  contains_child: boolean
  safety_product: boolean
  confidence: 'high' | 'medium' | 'low'
}

export type AnalyzeResult =
  | { kind: 'ok'; suggestion: AiSuggestion }
  | { kind: 'off' } // bildtolkning inte uppsatt än – appen funkar ändå
  | { kind: 'error'; message: string }

const MESSAGES: Record<string, string> = {
  BJUSS_AI_LIMIT: 'Du har använt bildtolkningen många gånger i dag. Fyll i fälten själv så länge.',
  AI_BUSY: 'Bildtolkningen är upptagen just nu. Fyll i fälten själv.',
  AI_REFUSED: 'Bildtolkningen kunde inte tolka den här bilden. Fyll i fälten själv.',
  BAD_IMAGE: 'Bilden gick inte att tolka. Fyll i fälten själv.',
}

export async function analyzePhoto(photo: Blob): Promise<AnalyzeResult> {
  try {
    const image = await blobToBase64(photo)
    const { data, error } = await supabase.functions.invoke('analyze-photo', { body: { image } })
    if (error) {
      let code = ''
      if (error instanceof FunctionsHttpError) {
        try {
          code = ((await error.context.json()) as { error?: string }).error ?? ''
        } catch {
          // inget
        }
      }
      if (code === 'AI_NOT_CONFIGURED' || code === 'AI_BAD_KEY' || /not found|404/i.test(error.message)) return { kind: 'off' }
      return { kind: 'error', message: MESSAGES[code] ?? 'Bildtolkningen fungerade inte just nu. Fyll i fälten själv.' }
    }
    return { kind: 'ok', suggestion: (data as { suggestion: AiSuggestion }).suggestion }
  } catch {
    return { kind: 'error', message: 'Bildtolkningen fungerade inte just nu. Fyll i fälten själv.' }
  }
}
