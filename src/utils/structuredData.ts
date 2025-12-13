import type { Novel } from '../types/novel'

export const generateWebsiteStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "NovlNest",
  "url": "https://novlnest.com",
  "description": "From new voices to hidden gems, explore novels created and shared by real storytellers. Read free novels online, discover trending stories, and share your own writing.",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://novlnest.com/novels?search={search_term_string}",
    "query-input": "required name=search_term_string"
  },
  "publisher": {
    "@type": "Organization",
    "name": "NovlNest",
    "url": "https://novlnest.com",
    "logo": {
      "@type": "ImageObject",
      "url": "https://novlnest.com/images/logo.jpg"
    }
  }
})

export const generateNovelStructuredData = (novel: Novel) => ({
  "@context": "https://schema.org",
  "@type": "Book",
  "name": novel.title,
  "description": novel.description,
  "author": {
    "@type": "Person",
    "name": novel.authorName || "Unknown Author"
  },
  "publisher": {
    "@type": "Organization",
    "name": "NovlNest"
  },
  "datePublished": novel.createdAt ? new Date(novel.createdAt).toISOString() : undefined,
  "dateModified": novel.updatedAt ? new Date(novel.updatedAt).toISOString() : undefined,
  "url": `https://novlnest.com/novel/${novel.id}`,
  "image": novel.coverImage ? `https://novlnest.com${novel.coverImage}` : "https://novlnest.com/images/logo.jpg",
  "genre": novel.genres || [],
  "inLanguage": "en",
  "isAccessibleForFree": true,
  "bookFormat": "EBook",
  "numberOfPages": novel.chapters?.length || 0,
  "aggregateRating": novel.rating ? {
    "@type": "AggregateRating",
    "ratingValue": novel.rating,
    "ratingCount": novel.ratingCount || 1
  } : undefined,
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  }
})

export const generateBreadcrumbStructuredData = (items: Array<{name: string, url: string}>) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": items.map((item, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "name": item.name,
    "item": item.url
  }))
})

export const generateCollectionStructuredData = (novels: Novel[], pageTitle: string) => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": pageTitle,
  "description": `Discover ${novels.length} novels on NovlNest - ${pageTitle.toLowerCase()}`,
  "url": `https://novlnest.com/novels`,
  "mainEntity": {
    "@type": "ItemList",
    "numberOfItems": novels.length,
    "itemListElement": novels.map((novel, index) => ({
      "@type": "Book",
      "position": index + 1,
      "name": novel.title,
      "url": `https://novlnest.com/novel/${novel.id}`,
      "author": {
        "@type": "Person",
        "name": novel.authorName || "Unknown Author"
      },
      "image": novel.coverImage ? `https://novlnest.com${novel.coverImage}` : "https://novlnest.com/images/logo.jpg"
    }))
  }
})
