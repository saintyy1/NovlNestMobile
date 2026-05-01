export interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string | null;
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
  chapters?: {
    title: string
    content: string
    createdAt?: string
    updatedAt?: string
  }[]
  chapterCount?: number
  chapterTitles?: string[]
  characters?: Character[];
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
  coverImage?: string | null;
  coverSmallImage?: string | null;
  status?: 'ongoing' | 'completed';
  epilogue?: {
    title: string;
    content: string;
  };
  publicDomain?: boolean;
}
