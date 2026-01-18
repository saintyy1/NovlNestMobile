const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads (use /tmp for Vercel serverless)
const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Enable CORS for all origins (adjust in production)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'PDF processing server is running' });
});

// Process PDF endpoint
app.post('/api/process-pdf', upload.single('pdf'), async (req, res) => {
  try {
    console.log('Request received, file:', req.file);
    
    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }

    console.log('Processing PDF:', req.file.originalname);

    // Read the PDF file
    const dataBuffer = fs.readFileSync(req.file.path);
    
    // Parse PDF
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;

    console.log('Extracted text length:', text.length);

    // Split text into chapters
    const chapters = extractChapters(text);

    console.log('Extracted chapters:', chapters.length);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      chapters: chapters,
      totalPages: pdfData.numpages,
      fileName: req.file.originalname
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process PDF'
    });
  }
});

// Function to extract chapters from text (adapted from web version)
function extractChapters(text) {
  let chapters = [];
  
  // First normalize excessive newlines but KEEP single/double newlines for chapter detection
  let fullText = text.replace(/\n{3,}/g, '\n\n');
  
  // Check for and fix broken chapter patterns
  const brokenChapterCheck = fullText.match(/C\s+hapter|CHAPT\s+ER/gi);
  if (brokenChapterCheck) {
    console.log('Found broken chapter patterns:', brokenChapterCheck);
    fullText = fullText.replace(/C\s+hapter/gi, 'Chapter');
    fullText = fullText.replace(/CHAPT\s+ER/gi, 'CHAPTER');
  }
  
  // Strategy 1: Look for explicit chapter markers with flexible regex
  const chapterRegex = /(?:^|\n\n)\s*((?:Chapter|CHAPTER|Ch\.?)\s+(?:\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty|[IVX]+)(?:\s*[:\-—–][^\n]+)?)/gi;
  
  const matches = Array.from(fullText.matchAll(chapterRegex));
  
  console.log(`Found ${matches.length} chapter markers`);
  
  if (matches.length > 0) {
    matches.forEach((match, index) => {
      const fullChapterTitle = match[1].trim();
      
      console.log(`  Match ${index + 1}: "${fullChapterTitle}" at position ${match.index}`);
      
      // Extract clean subtitle
      let chapterTitle = fullChapterTitle;
      let cleanChapterHeader = fullChapterTitle;
      
      // Match everything after the separator
      const subtitleMatch = fullChapterTitle.match(/^((?:Chapter|CHAPTER|Ch\.?)\s+(?:\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty|[IVX]+)\s*[:\-—–])\s*(.+)$/i);
      
      if (subtitleMatch && subtitleMatch[2]) {
        const chapterPrefix = subtitleMatch[1];
        let subtitle = subtitleMatch[2].trim();
        
        // Clean up: Remove any sentence content that might be attached
        const sentencePattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}?)\s+([A-Z][a-z]+\s+[a-z])/;
        const cleanMatch = subtitle.match(sentencePattern);
        
        if (cleanMatch) {
          chapterTitle = cleanMatch[1].trim();
          cleanChapterHeader = chapterPrefix + ' ' + chapterTitle;
        } else {
          chapterTitle = subtitle;
          cleanChapterHeader = fullChapterTitle;
        }
      } else if (!subtitleMatch) {
        // No subtitle, use default "Chapter X" format
        const chapterNumMatch = fullChapterTitle.match(/(?:Chapter|CHAPTER|Ch\.?)\s+(\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty|[IVX]+)/i);
        if (chapterNumMatch) {
          chapterTitle = `Chapter ${chapterNumMatch[1]}`;
          cleanChapterHeader = chapterTitle;
        }
      }
      
      // Calculate content positions
      const chapterStartPos = match.index;
      const cleanHeaderInText = fullText.indexOf(cleanChapterHeader, chapterStartPos);
      let contentStartPos;
      
      if (cleanHeaderInText !== -1) {
        contentStartPos = cleanHeaderInText + cleanChapterHeader.length;
        // Skip whitespace/newlines
        while (contentStartPos < fullText.length && /[\s\n]/.test(fullText[contentStartPos])) {
          contentStartPos++;
        }
      } else {
        contentStartPos = match.index + match[0].length;
      }
      
      const endPos = index < matches.length - 1 ? matches[index + 1].index : fullText.length;
      const chapterContent = fullText.substring(contentStartPos, endPos).trim();
      
      // Smart paragraph creation
      let normalizedContent = chapterContent;
      
      // First, join all single newlines to create continuous text
      normalizedContent = normalizedContent.replace(/([^\n])\n([^\n])/g, '$1 $2');
      
      // Clean up multiple spaces
      normalizedContent = normalizedContent.replace(/ {2,}/g, ' ');
      
      // Split into sentences (on . ! ? followed by space and capital letter or quote+capital)
      const sentences = normalizedContent.split(/([.!?]["']?\s+)(?=[A-Z])/g);
      
      // Rebuild with better paragraph breaks
      let paragraphs = [];
      let currentParagraph = '';
      let sentenceCount = 0;
      
      for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        
        // Skip empty parts
        if (!part || !part.trim()) continue;
        
        currentParagraph += part;
        
        // Count as sentence if it ends with punctuation
        if (/[.!?]["']?\s*$/.test(part)) {
          sentenceCount++;
          
          // Create new paragraph after 3-5 sentences (varying for natural flow)
          const sentencesPerParagraph = 3 + Math.floor(Math.random() * 3); // 3-5 sentences
          
          if (sentenceCount >= sentencesPerParagraph) {
            paragraphs.push(currentParagraph.trim());
            currentParagraph = '';
            sentenceCount = 0;
          }
        }
      }
      
      // Add remaining content as final paragraph
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
      }
      
      // Join paragraphs with double newlines
      normalizedContent = paragraphs.filter(p => p.length > 0).join('\n\n');
      
      console.log(`    Extracted: "${chapterTitle}" - ${normalizedContent.length} characters, ${paragraphs.length} paragraphs`);
      
      if (normalizedContent.length > 50) {
        chapters.push({
          title: chapterTitle,
          content: normalizedContent
        });
      }
    });
  }
  
  // Strategy 2: If few or no chapters found, try splitting on large gaps
  if (chapters.length <= 1) {
    console.log('Strategy 1 failed, trying page break detection...');
    const pageTexts = fullText.split(/\n{4,}/);
    
    if (pageTexts.length > 1) {
      chapters = pageTexts
        .filter(txt => txt.trim().length > 100)
        .map((txt, index) => {
          const lines = txt.trim().split('\n');
          const firstLine = lines[0].trim();
          const isChapterTitle = /^(Chapter|CHAPTER)/i.test(firstLine) && firstLine.length < 50;
          
          let content = isChapterTitle ? lines.slice(1).join('\n').trim() : txt.trim();
          
          // Smart paragraph creation
          content = content.replace(/([^\n])\n([^\n])/g, '$1 $2');
          content = content.replace(/ {2,}/g, ' ');
          
          const sentences = content.split(/([.!?]["']?\s+)(?=[A-Z])/g);
          let paragraphs = [];
          let currentParagraph = '';
          let sentenceCount = 0;
          
          for (let i = 0; i < sentences.length; i++) {
            const part = sentences[i];
            if (!part || !part.trim()) continue;
            
            currentParagraph += part;
            
            if (/[.!?]["']?\s*$/.test(part)) {
              sentenceCount++;
              const sentencesPerParagraph = 3 + Math.floor(Math.random() * 3);
              
              if (sentenceCount >= sentencesPerParagraph) {
                paragraphs.push(currentParagraph.trim());
                currentParagraph = '';
                sentenceCount = 0;
              }
            }
          }
          
          if (currentParagraph.trim()) {
            paragraphs.push(currentParagraph.trim());
          }
          
          content = paragraphs.filter(p => p.length > 0).join('\n\n');
          
          if (isChapterTitle) {
            return {
              title: firstLine,
              content: content
            };
          } else {
            return {
              title: `Chapter ${index + 1}`,
              content: content
            };
          }
        });
      
      console.log(`Found ${chapters.length} chapters using page break detection`);
    }
  }
  
  // Fallback: If still no chapters, treat as single chapter
  if (chapters.length === 0) {
    console.log('No chapters detected, treating entire document as one chapter');
    let content = fullText.trim();
    
    // Smart paragraph creation
    content = content.replace(/([^\n])\n([^\n])/g, '$1 $2');
    content = content.replace(/ {2,}/g, ' ');
    
    const sentences = content.split(/([.!?]["']?\s+)(?=[A-Z])/g);
    let paragraphs = [];
    let currentParagraph = '';
    let sentenceCount = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const part = sentences[i];
      if (!part || !part.trim()) continue;
      
      currentParagraph += part;
      
      if (/[.!?]["']?\s*$/.test(part)) {
        sentenceCount++;
        const sentencesPerParagraph = 3 + Math.floor(Math.random() * 3);
        
        if (sentenceCount >= sentencesPerParagraph) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
          sentenceCount = 0;
        }
      }
    }
    
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
    
    content = paragraphs.filter(p => p.length > 0).join('\n\n');
    
    chapters = [{
      title: 'Chapter 1',
      content: content
    }];
  }
  
  console.log(`Final result: ${chapters.length} chapter(s) extracted`);
  
  return chapters;
}

// Create uploads directory if it doesn't exist (use /tmp for Vercel)
const uploadsDir = process.env.VERCEL ? '/tmp' : 'uploads';
if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Export for Vercel serverless
module.exports = app;

// Only start server if not in Vercel environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`PDF Processing Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API endpoint: http://localhost:${PORT}/api/process-pdf`);
  });
}
