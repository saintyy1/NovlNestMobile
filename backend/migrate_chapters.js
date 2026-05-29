/**
 * MIGRATION SCRIPT: Chapters to Sub-collections
 *
 * Purpose: Moves the 'chapters' array from the main 'novels' document
 * to a dedicated 'chapters' sub-collection to resolve the 1MB Firestore limit.
 *
 * Usage:
 *   Full migration:   node backend/migrate_chapters.js
 *   Single novel:     node backend/migrate_chapters.js --novelId hXuH7D1hzZYFXdA9v84e
 */

const admin = require('firebase-admin');
require('dotenv').config({ path: './backend/.env' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('Initialized with service account JSON');
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      });
      console.log('Initialized with individual environment variables');
    } else {
      admin.initializeApp();
      console.log('Initialized with default credentials');
    }
  } catch (error) {
    console.error('Initialization error:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function migrateNovel(novelDoc) {
  const novelData = novelDoc.data();
  const novelId = novelDoc.id;

  if (!novelData.chapters || !Array.isArray(novelData.chapters)) {
    console.log(`[SKIPPED] Novel ${novelId}: No legacy chapters array found.`);
    return 'skipped';
  }

  console.log(`[PROCESSING] Novel ${novelId}: ${novelData.chapters.length} chapters...`);

  try {
    const chapters = novelData.chapters;
    const chapterTitles = chapters.map(ch => ch.title || 'Untitled Chapter');

    // Firestore batch limit is 500 ops — chunk at 400 to be safe
    const BATCH_SIZE = 400;
    for (let batchStart = 0; batchStart < chapters.length; batchStart += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = chapters.slice(batchStart, batchStart + BATCH_SIZE);

      for (let i = 0; i < chunk.length; i++) {
        const index = batchStart + i;
        const chapter = chunk[i];
        const chapterRef = db
          .collection('novels')
          .doc(novelId)
          .collection('chapters')
          .doc(index.toString());

        const existingDoc = await chapterRef.get();
        if (existingDoc.exists) {
          const existingData = existingDoc.data();
          batch.set(chapterRef, {
            ...chapter,
            order: index,
            chapterLikes: Math.max(chapter.chapterLikes || 0, existingData.chapterLikes || 0),
            chapterLikedBy: existingData.chapterLikedBy && existingData.chapterLikedBy.length > (chapter.chapterLikedBy?.length || 0)
              ? existingData.chapterLikedBy
              : (chapter.chapterLikedBy || []),
            comments: existingData.comments && existingData.comments.length > (chapter.comments?.length || 0)
              ? existingData.comments
              : (chapter.comments || []),
            updatedAt: chapter.updatedAt || novelData.updatedAt || new Date().toISOString(),
          }, { merge: true });
        } else {
          batch.set(chapterRef, {
            ...chapter,
            order: index,
            chapterLikes: chapter.chapterLikes || 0,
            chapterLikedBy: chapter.chapterLikedBy || [],
            comments: chapter.comments || [],
            updatedAt: chapter.updatedAt || novelData.updatedAt || new Date().toISOString(),
          }, { merge: true });
        }
      }

      await batch.commit();
      console.log(`  -> Committed chapters ${batchStart}–${batchStart + chunk.length - 1}`);
    }

    // Update root document: chapterCount + chapterTitles (separate from batch for clarity)
    await db.collection('novels').doc(novelId).update({
      chapterCount: chapters.length,
      chapterTitles: chapterTitles,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[SUCCESS] Novel ${novelId}: migrated ${chapters.length} chapters.`);
    console.log(`  chapterCount  = ${chapters.length}`);
    console.log(`  chapterTitles = [${chapterTitles.join(', ')}]`);
    return 'success';
  } catch (err) {
    console.error(`[ERROR] Novel ${novelId}:`, err.message);
    return 'error';
  }
}

async function migrate() {
  // Support: node migrate_chapters.js --novelId <id>
  const args = process.argv.slice(2);
  const novelIdFlagIndex = args.indexOf('--novelId');
  const targetNovelId = novelIdFlagIndex !== -1 ? args[novelIdFlagIndex + 1] : null;

  let successCount = 0, errorCount = 0, skippedCount = 0;

  if (targetNovelId) {
    // ── SINGLE NOVEL MODE ──────────────────────────────────────
    console.log(`\nTargeting single novel: ${targetNovelId}\n`);
    const novelDoc = await db.collection('novels').doc(targetNovelId).get();
    if (!novelDoc.exists) {
      console.error(`[ERROR] Novel "${targetNovelId}" not found in Firestore.`);
      process.exit(1);
    }
    const result = await migrateNovel(novelDoc);
    if (result === 'success') successCount++;
    else if (result === 'error') errorCount++;
    else skippedCount++;
  } else {
    // ── FULL MIGRATION MODE ────────────────────────────────────
    console.log('Starting full migration (all novels)...');
    const novelsSnapshot = await db.collection('novels').get();
    console.log(`Found ${novelsSnapshot.size} novels to process.\n`);
    for (const novelDoc of novelsSnapshot.docs) {
      const result = await migrateNovel(novelDoc);
      if (result === 'success') successCount++;
      else if (result === 'error') errorCount++;
      else skippedCount++;
    }
  }

  console.log('\n--- MIGRATION COMPLETE ---');
  console.log(`Success: ${successCount}`);
  console.log(`Errors:  ${errorCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log('--------------------------\n');
  console.log('NOTE: The old "chapters" array was NOT deleted (kept as backup).');
  console.log('Once verified, you can safely delete it from Firestore.');
}

migrate().catch(console.error);
