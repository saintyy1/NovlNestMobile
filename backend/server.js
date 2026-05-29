const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
require('dotenv').config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized with service account JSON');
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      });
      console.log('Firebase Admin initialized with individual environment variables');
    } else {
      admin.initializeApp();
      console.log('Firebase Admin initialized with default credentials');
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
  }
}

const db = admin.firestore();
const expo = new Expo();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads (use /tmp for Vercel serverless)
const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Enable CORS for all origins (adjust in production)
app.use(cors());
app.use(express.json());

// API Key authentication middleware
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!process.env.CRON_SECRET || apiKey !== process.env.CRON_SECRET) {
    console.warn(`Unauthorized access attempt to ${req.path} from IP ${req.ip}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

// Rate limiter for PDF processing (heavier resource usage)
const pdfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 PDF conversions per window
  message: { success: false, error: 'Too many PDF processing requests, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for push notifications
// NOTE: V1.9.0 clients loop /api/notify-user once per follower/library user.
// Limit must be high enough to support authors with large followings (200/min = ~3/sec).
const notificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Raised from 20 to support V1.9.0 loop-per-user pattern
  message: { success: false, error: 'Too many notifications, please try again after a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'PDF processing server is running' });
});

// Process PDF endpoint
// NOTE: No authMiddleware here — V1.9.0 clients don't send X-API-KEY for PDF uploads.
// pdfLimiter (5 req/15min) provides sufficient abuse protection for this heavy endpoint.
app.post('/api/process-pdf', pdfLimiter, upload.single('pdf'), async (req, res) => {
  try {
    console.log('Request received, file:', req.file);

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }

    console.log('Processing PDF:', req.file.originalname);

    // Read the PDF file (async)
    const dataBuffer = await fs.promises.readFile(req.file.path);

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

// Send Push Notification endpoint
app.get('/api/notify-user', (req, res) => {
  res.json({ success: true, message: 'Push notification endpoint is active (POST required)' });
});

app.post('/api/notify-user', notificationLimiter, async (req, res) => {
  const { toUserId, title, body, data } = req.body;

  if (!toUserId || !title || !body) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const userDoc = await db.collection('users').doc(toUserId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userData = userDoc.data();
    const pushToken = userData.pushToken;
    const enabled = userData.pushNotificationsEnabled !== false;

    if (!pushToken || !enabled) {
      return res.json({ success: true, message: 'Push skipped (not enabled or no token)' });
    }

    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      return res.status(400).json({ success: false, error: 'Invalid push token' });
    }

    const messages = [{
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
      channelId: 'default',
      priority: 'high',
    }];

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    for (let chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log(`[Push] Tickets received: ${JSON.stringify(ticketChunk)}`);
      } catch (error) {
        console.error('[Push] Error sending push chunk:', error);
      }
    }

    // Inspect tickets for errors
    for (let ticket of tickets) {
      if (ticket.status === 'error') {
        console.error(`[Push] Delivery error: ${ticket.message}`);
        if (ticket.details && ticket.details.error) {
          console.error(`[Push] Error code: ${ticket.details.error}`);
        }
      }
    }

    res.json({ success: true, message: 'Push notification processed', tickets });

  } catch (error) {
    console.error('Error in /api/send-push:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// New Broadcast Notification Endpoint for scalable announcements and chapter drops
app.post('/api/broadcast-notification', authMiddleware, async (req, res) => {
  const { recipientConfig, notificationData, pushData } = req.body;

  if (!recipientConfig || !notificationData || !pushData) {
    return res.status(400).json({ success: false, error: 'Recipient config, notification data, and push data are required' });
  }

  try {
    let recipientIds = [];

    // 1. Discover recipients based on config
    if (recipientConfig.type === 'library_users') {
      const usersSnapshot = await db.collection('users')
        .where('library', 'array-contains', recipientConfig.id)
        .select() // Optimize: Only fetch IDs
        .get();
      recipientIds = usersSnapshot.docs.map(doc => doc.id);
    } else if (recipientConfig.type === 'followers') {
      const usersSnapshot = await db.collection('users')
        .where('following', 'array-contains', recipientConfig.id)
        .select() // Optimize: Only fetch IDs
        .get();
      recipientIds = usersSnapshot.docs.map(doc => doc.id);
    } else if (recipientConfig.type === 'custom') {
      recipientIds = recipientConfig.userIds || [];
    }

    // Filter out the sender from notifications
    recipientIds = recipientIds.filter(id => id !== notificationData.fromUserId);

    if (recipientIds.length === 0) {
      return res.json({ success: true, message: 'No recipients found' });
    }

    console.log(`Broadcasting to ${recipientIds.length} recipients for type: ${recipientConfig.type}`);

    // 2. Create Firestore Notification documents in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = recipientIds.slice(i, i + BATCH_SIZE);

      chunk.forEach(userId => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          ...notificationData,
          toUserId: userId,
          createdAt: new Date().toISOString(),
          read: false,
        });
      });

      await batch.commit();
    }

    // 3. Fetch Push Tokens and send via Expo
    const pushMessages = [];
    const seenTokens = new Set();

    // We need to fetch user documents to get tokens. 
    // We'll do this in chunks of 30 because of Firestore 'where-in' limits
    for (let i = 0; i < recipientIds.length; i += 30) {
      const chunk = recipientIds.slice(i, i + 30);
      const usersSnapshot = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .select('pushToken', 'pushNotificationsEnabled') // Optimize: only fetch push fields
        .get();

      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const token = userData.pushToken;
        const enabled = userData.pushNotificationsEnabled !== false;

        if (enabled && token && Expo.isExpoPushToken(token) && !seenTokens.has(token)) {
          seenTokens.add(token);
          pushMessages.push({
            to: token,
            sound: 'default',
            title: pushData.title,
            body: pushData.body,
            data: pushData.data || {},
            channelId: 'default',
            priority: 'high',
          });
        }
      });
    }

    // Send chunks to Expo in parallel
    const expoChunks = expo.chunkPushNotifications(pushMessages);
    
    const sendPromises = expoChunks.map(chunk => 
      expo.sendPushNotificationsAsync(chunk).catch(error => {
        console.error('Error sending broadcast push chunk:', error);
        return [];
      })
    );

    const ticketResults = await Promise.all(sendPromises);
    const tickets = ticketResults.flat();
    let successCount = tickets.length;

    // Log errors for broadcast tickets
    tickets.forEach(ticket => {
      if (ticket.status === 'error') {
        console.error(`[Broadcast] Push error: ${ticket.message} (${ticket.details?.error})`);
      }
    });

    res.json({
      success: true,
      message: `Broadcast complete. ${recipientIds.length} notifications created, ${successCount} pushes sent.`
    });

  } catch (error) {
    console.error('Error in /api/broadcast-notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Broadcast endpoint for admin-initiated push notifications
app.post('/api/admin/broadcast', async (req, res) => {
  const { title, body, data } = req.body;

  if (!title || !body) {
    return res.status(400).json({ success: false, error: 'Title and body are required' });
  }

  // Verify Admin secret
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // 1. Fetch only necessary fields to optimize memory and Firestore read costs
    const usersSnapshot = await db.collection('users')
      .select('pushToken', 'pushNotificationsEnabled')
      .get();

    if (usersSnapshot.empty) {
      return res.json({ success: true, message: 'No users to notify' });
    }

    const messages = [];
    const seenTokens = new Set();

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const token = userData.pushToken;
      const enabled = userData.pushNotificationsEnabled !== false;

      if (enabled && token && Expo.isExpoPushToken(token) && !seenTokens.has(token)) {
        seenTokens.add(token);
        messages.push({
          to: token,
          sound: 'default',
          title: title,
          body: body,
          data: data || { type: 'broadcast' },
          channelId: 'default',
          priority: 'high',
        });
      }
    });

    // 2. Send in chunks in parallel for maximum performance
    const chunks = expo.chunkPushNotifications(messages);
    
    const sendPromises = chunks.map(chunk => 
      expo.sendPushNotificationsAsync(chunk).catch(error => {
        console.error('Error sending broadcast chunk:', error);
        return [];
      })
    );

    const ticketResults = await Promise.all(sendPromises);
    const tickets = ticketResults.flat();
    const successCount = tickets.length;

    // Log errors for admin broadcast tickets
    tickets.forEach(ticket => {
      if (ticket.status === 'error') {
        console.error(`[AdminBroadcast] Push error: ${ticket.message} (${ticket.details?.error})`);
      }
    });

    res.json({ 
      success: true, 
      message: `Broadcast initiated for ${successCount} users across ${chunks.length} chunks.` 
    });
  } catch (error) {
    console.error('Error in /api/admin/broadcast:', error);
    res.status(500).json({ success: false, error: error.message });
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