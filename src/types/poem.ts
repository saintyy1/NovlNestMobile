export interface Poem {
  id: string
  title: string
  description: string
  content: string // The full poem text
  genres: string[]
  poetId: string
  poetName: string
  isPromoted: boolean
  published: boolean
  createdAt: string
  updatedAt: string
  likes?: number
  views?: number
  likedBy?: string[] // Array of user IDs who liked the poem
  rating?: number
  ratingCount?: number
  coverImage?: string | null
  coverSmallImage?: string | null
}

