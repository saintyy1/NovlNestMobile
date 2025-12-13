export type ChatMessage = {
  id: string
  sender: string
  content: string
}

export interface Novel {
  id: string
  title: string
  description: string
  summary: string
  genres: string[]
  hasGraphicContent: boolean
  authorsNote?: string
  prologue?: string
  chapters: {
    title: string
    content: string
    chatMessages?: ChatMessage[]
  }[]
  authorId: string
  authorName: string
  isPromoted: boolean
  promotionStartDate?: string
  promotionEndDate?: string
  promotionEndNotificationSent?: boolean
  published: boolean
  createdAt: string
  updatedAt: string
  generationPrompt?: string
  likes?: number
  views?: number
  likedBy?: string[] // Array of user IDs who liked the novel
  rating?: number
  ratingCount?: number
  coverImage?: string | null
  coverSmallImage?: string | null
}
