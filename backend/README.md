# NovlNest PDF Processing Backend

Simple Node.js backend for processing PDF files and extracting chapters.

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Configuration

The server runs on port 3001 by default. You can change this by setting the `PORT` environment variable.

## API Endpoints

### POST /api/process-pdf
Upload a PDF file and receive extracted chapters.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: PDF file with key "pdf"

**Response:**
```json
{
  "success": true,
  "chapters": [
    {
      "title": "Chapter 1: The Beginning",
      "content": "Chapter content here..."
    }
  ],
  "totalPages": 250,
  "fileName": "mybook.pdf"
}
```

### GET /health
Check if the server is running.

## Features

- Extracts text from PDF files
- Automatically detects and splits chapters
- Supports multiple chapter naming patterns:
  - "Chapter 1: Title"
  - "CHAPTER I"
  - "Ch. 1"
  - Numbered sections "1. Title"
- Handles PDFs up to 50MB
- CORS enabled for cross-origin requests

## Deployment to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Update your app's `.env` file with the Vercel URL:
```
EXPO_PUBLIC_BACKEND_URL=https://your-app.vercel.app
```

## For Production

- Update CORS settings in server.js to only allow your domain
- Add authentication/API keys if needed
- Set up proper logging
- Consider rate limiting
