import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { saveStructuredPdfDirectly } from './utils/saveStructuredPdf.js';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { getDriveClient } from './auth.js';
import { ensureDriveFolderPath } from './driveUtils.js'; 
import mime from 'mime-types';
import { uploadFilesToDrive } from './uploadFilesToDrive.js'; // adjust path if needed
import { mistralChat } from './mistralClient.js';
import { classifyPost } from './utils/categorizer.js';


// Load list of research authors
const targetAuthors = fs.readFileSync('target_authors.txt', 'utf-8')
  .split('\n')
  .map(a => a.trim())
  .filter(Boolean);

function sanitizeForPath(str) {
  return str
    .replace(/[“”‘’"']/g, '')        // remove all types of quotes
    .replace(/[^a-zA-Z0-9_\-]/g, '_') // replace all unsafe chars with _
    .replace(/_+/g, '_')              // collapse multiple underscores
    .replace(/^_+|_+$/g, '');         // trim leading/trailing _
}
function removeMetadataHeaders(text) {
  return text.replace(/--- METADATA ---[\s\S]*?----------------/, '').trim();
}
dotenv.config();

// ✅ Correctly load from .env (required: APP_SPACE_FOLDER_ID)
const appSpaceFolderId = process.env.APP_SPACE_FOLDER_ID;
if (!appSpaceFolderId) {
  throw new Error('❌ APP_SPACE_FOLDER_ID is not defined. Check your .env file!');
}

// ✅ Initialize Google Drive client with full scope
const auth = await google.auth.getClient({
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });


const OUTPUT_PATH = './output';
if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH);

// ✅ Load seed config JSON
const SEED_CONFIG = JSON.parse(fs.readFileSync('./seed_config.json', 'utf-8'));

// ✅ Delay util
const delay = ms => new Promise(res => setTimeout(res, ms));

// ✅ LinkedIn cookie-based login
async function loginWithCookie(context) {
  const cookie = process.env.LI_AT;
  if (!cookie) throw new Error('❌ Missing LI_AT cookie');
  await context.addCookies([{
    name: 'li_at',
    value: cookie,
    domain: '.linkedin.com',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax'
  }]);
}

async function safeGoto(page, url, retries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🌐 Navigating to: ${url} (attempt ${attempt}/${retries})`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return true;
    } catch (err) {
      console.warn(`❌ Goto failed (attempt ${attempt}): ${err.message}`);
      if (attempt < retries) await delay(delayMs);
    }
  }
  return false;
}

function computeEngagementScore(likeCount, commentCount, shareCount) {
  const likeWeight = likeCount > 10 ? 2 : 1;
  const commentWeight = commentCount > 5 ? 3 : 2;
  const shareWeight = shareCount > 3 ? 5 : 2;

  return (likeCount * likeWeight) + (commentCount * commentWeight) + (shareCount * shareWeight);
}

function generateMetadataText(metadata) {
  const likeCount = Number(metadata.likeCount || 0);
  const commentCount = Number(metadata.commentCount || 0);
  const shareCount = Number(metadata.shareCount || 0);

  // ✅ Add scoring logic here
  const engagementScore = computeEngagementScore(likeCount, commentCount, shareCount);
  metadata.engagementScore = engagementScore;

  if (engagementScore > 50) {
    metadata.engagementTag = '🔥 High Engagement';
  }

  const fields = {
    keywordType: metadata.keywordType || '',
    keyword: metadata.keyword || '',
    url: metadata.url || '',
    filename: metadata.filename || '',
    videoDownloaded: metadata.videoDownloaded ? 'true' : 'false',
    ocrExtracted: metadata.ocrExtracted ? 'true' : 'false',
    likeCount,
    commentCount,
    shareCount,
    engagementScore,
    engagementTag: metadata.engagementTag || '',
    sentiment: metadata.sentiment || '',
    topComment: (metadata.topComment || '').replace(/\s+/g, ' ').slice(0, 300),
    externalLinks: (metadata.externalLinks || []).join(', '),
    category: metadata.category || '',
    scrapedAt: metadata.scrapedAt || '',
  };

  return `--- METADATA ---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n----------------\n`;
}

function extractExternalLinks(text) {
  const regex = /https?:\/\/[^\s\)\]\}"']+/g;
  return [...new Set((text.match(regex) || []))];
}

function generateSearchTermsFromSeed(seed) {
  const terms = [];

  if (seed.keywords) terms.push(...seed.keywords.map(t => ({ type: 'keyword', value: t })));
  if (seed.hashtags) terms.push(...seed.hashtags.map(h => ({ type: 'hashtag', value: h.startsWith('#') ? h : `#${h}` })));
  if (seed.people) terms.push(...seed.people.map(p => ({ type: 'people', value: p })));
  if (seed.organizations) terms.push(...seed.organizations.map(o => ({ type: 'organization', value: o })));
  if (seed.groups) terms.push(...seed.groups.map(g => ({ type: 'group', value: g })));
  if (seed.domainMentions) terms.push(...seed.domainMentions.map(d => ({ type: 'domain', value: d.startsWith('site:') ? d : `site:${d}` })));
  if (seed.urlSeeds) terms.push(...seed.urlSeeds.map(u => ({ type: 'urlSeed', value: u })));
  if (seed.category) terms.push({ type: 'category', value: seed.category });

  return terms.filter(t => !!t.value);
}

async function extractSlideDeckImages(post) {
  try {
    const slides = await post.$$eval(
      '.feed-shared-document-viewer__slide img',
      imgs => imgs.map(img => img.src).filter(Boolean)
    );
    return slides;
  } catch (err) {
    console.warn('⚠️ Slide deck image extraction failed:', err.message);
    return [];
  }
}

async function expandAllSeeMoreInPost(post) {
  try {
    const buttons = await post.$$('button span');
    for (const span of buttons) {
      const txt = (await span.innerText()).trim().toLowerCase();
      if (txt.includes('see more') || txt.includes('...more') || txt.includes('more')) {
        const parentButton = await span.evaluateHandle(el => el.closest('button'));
        if (parentButton) {
          await parentButton.scrollIntoViewIfNeeded();
          await parentButton.click({ force: true });
          await delay(800);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ See more failed:', err.message);
  }
}

async function getAccuratePostUrl(post) {
  try {
    const anchor = await post.$('a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/pulse/"]');
    const href = anchor && await anchor.getAttribute('href');
    if (href) return href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
    const urn = await post.getAttribute('data-urn');
    if (urn?.includes('urn:li:activity:')) return `https://www.linkedin.com/feed/update/urn:li:activity:${urn.split(':').pop()}`;
    return null;
  } catch (e) {
    return null;
  }
}

async function fetchExternalPageText(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, head, iframe').remove();
    return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);
  } catch {
    return '';
  }
}

async function fetchPDFText(url, filename) {
  const filePath = path.join(OUTPUT_PATH, filename);
  const stream = fs.createWriteStream(filePath);
  const response = await fetch(url);
  await pipeline(response.body, stream);
  const { default: pdfParse } = await import('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  return (await pdfParse(buffer)).text.slice(0, 5000);
}

async function downloadVideoFromPost(post, folderPath, filenamePrefix) {
  try {
    const videoEl = await post.$('video');
    if (!videoEl) return null;
    const videoUrl = await videoEl.getAttribute('src');
    if (!videoUrl?.startsWith('http')) return null;
    const videoPath = path.join(folderPath, `${filenamePrefix}.mp4`);
    const response = await fetch(videoUrl);
    const stream = fs.createWriteStream(videoPath);
    await pipeline(response.body, stream);
    console.log(`🎥 Saved video → ${videoPath}`);
    return videoPath;
  } catch (err) {
    console.warn('⚠️ Video download failed:', err.message);
    return null;
  }
}

// ✅ Utility: Cleanup all OCR images from a folder
function cleanupAllOcrImagesInFolder(folderPath, baseName = '', forceDelete = false) {
  if (!fs.existsSync(folderPath)) return;

  const files = fs.readdirSync(folderPath);
  let deleted = 0;

  for (const file of files) {
    const fullPath = path.join(folderPath, file);

    const isOcrImage = file.endsWith('.jpg') && file.includes('_ocr_');
    const matchesBase = baseName ? file.startsWith(`${baseName}_ocr_`) : true;

    if (isOcrImage && matchesBase) {
      try {
        if (forceDelete) {
          fs.unlinkSync(fullPath);
          console.log(`🧹 Deleted OCR image: ${file}`);
          deleted++;
        } else {
          const stats = fs.statSync(fullPath);
          const ageMs = Date.now() - stats.mtimeMs;

          if (ageMs > 500) {
            fs.unlinkSync(fullPath);
            console.log(`🧹 Deleted OCR image: ${file}`);
            deleted++;
          } else {
            console.log(`⏳ Skipping recent OCR image: ${file} (${Math.round(ageMs)}ms old)`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Could not delete ${file}: ${err.message}`);
      }
    }
  }

  const leftover = fs.readdirSync(folderPath).filter(f =>
    f.endsWith('.jpg') && f.includes('_ocr_') && f.startsWith(`${baseName}_ocr_`)
  );
  console.log(`📦 OCR cleanup complete: ${deleted} deleted, ${leftover.length} remaining.`);
}
// ✅ OCR Extraction from Post Images
async function extractOCRFromPostImages(post, folderPath, filenameSafe) {
  const images = await post.$$eval('img', imgs =>
    imgs.map(img => img.src).filter(src => src && src.startsWith('http'))
  );
  if (!images.length) return { ocrText: '', ocrExtracted: false };

  let ocrText = '';
  const ocrFailures = [];

  for (let i = 0; i < images.length; i++) {
    const imgUrl = images[i];
    try {
      const imgResp = await fetch(imgUrl);
      const contentType = imgResp.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        console.warn(`⚠️ Skipping non-image content: ${imgUrl} (${contentType})`);
        continue;
      }

      const ext = contentType.includes('png') ? 'png' : 'jpg'; // optionally extend for webp
      const tempPath = path.join(folderPath, `${filenameSafe}_ocr_${i}.${ext}`);
      const outStream = fs.createWriteStream(tempPath);
      await pipeline(imgResp.body, outStream);

      if (!fs.existsSync(tempPath)) {
        console.warn(`❌ Image not found after saving: ${tempPath}`);
        ocrFailures.push(tempPath);
        continue;
      }

      const stats = fs.statSync(tempPath);
      if (stats.size < 100) {
        console.warn(`⚠️ Skipping corrupt/empty image: ${tempPath}`);
        fs.unlinkSync(tempPath); // clean up
        ocrFailures.push(tempPath);
        continue;
      }

      const command = `python3 ocr_helper.py "${tempPath}"`;
      try {
        execSync(command, { stdio: 'pipe' });
        const ocrResultPath = tempPath + '.txt';
        if (fs.existsSync(ocrResultPath)) {
          const text = fs.readFileSync(ocrResultPath, 'utf-8').trim();
          if (text.length > 30) ocrText += `\n[Image ${i + 1}]\n${text}\n`;
          fs.unlinkSync(ocrResultPath);
        }
      } catch (err) {
        console.warn(`❌ OCR failed for ${tempPath}: ${err.message}`);
        ocrFailures.push(tempPath);
      }
    } catch (err) {
      console.warn(`⚠️ Image OCR failed for ${imgUrl}:`, err.message);
      ocrFailures.push(imgUrl);
    }
  }

  return {
    ocrText: ocrText.trim(),
    ocrExtracted: !!ocrText.trim(),
    imageFiles: fs.readdirSync(folderPath)
      .filter(f => f.startsWith(`${filenameSafe}_ocr_`) && f.match(/\.(jpg|png|jpeg)$/))
      .map(f => path.join(folderPath, f)),
    ocrFailures
  };
}


// ✅ Ensure cleanup is called after each post processing like:
// cleanupAllOcrImagesInFolder(folder);

async function scrapeDirectLinkedPost(page, url, folder, existingUrls, drive, appSpaceFolderId) {
  try {
    const success = await safeGoto(page, url);
    if (!success) return null;

    await page.waitForSelector('div.feed-shared-update-v2', { timeout: 20000 });

    const post = await page.$('div.feed-shared-update-v2');
    if (!post) return null;

    await expandAllSeeMoreInPost(post);
    await delay(800);

    const postUrl = await getAccuratePostUrl(post) || url;
    const cleanUrl = postUrl.split('?')[0].split('#')[0];
    const baseName = cleanUrl.split('/').pop().replace(/[^a-z0-9\-_]/gi, '_');
    const hash = crypto.createHash('sha1').update(cleanUrl).digest('hex').slice(0, 4);
    const filenameSafe = `${baseName}_${hash}`;
    const filePath = path.join(folder, `${filenameSafe}.txt`);
    const pdfPath = filePath.replace(/\.txt$/, '.pdf');

    // ✅ Deduplication check
    if (existingUrls.has(cleanUrl)) {
      console.log(`⏭️ Already scraped: ${cleanUrl}`);
      return null;
    }

    if (fs.existsSync(filePath)) {
      console.log(`⏭️ Already saved: ${filePath}`);
      return null;
    }

    const mainContent = await post.innerText();
    if (!mainContent || mainContent.length < 20) {
      console.warn('⚠️ Skipping empty post content.');
      return null;
    }

    const extLinks = extractExternalLinks(mainContent);
    const timestamp = new Date().toISOString();
    const category = classifyPost(mainContent);
    const engagementScore = 0; // ✅ initialize to avoid ReferenceError

    const metadata = {
      keywordType: 'direct-link',
      keyword: 'direct-link',
      url: cleanUrl,
      filename: `${filenameSafe}.txt`,
      videoDownloaded: false,
      engagementScore,
      externalLinks: extLinks,
      scrapedAt: timestamp,
      category,
      author
    };

    const videoPath = await downloadVideoFromPost(post, folder, filenameSafe);
    if (videoPath) metadata.videoDownloaded = true;

    const { ocrText, ocrExtracted, imageFiles } = await extractOCRFromPostImages(post, folder, filenameSafe);
    metadata.ocrExtracted = ocrExtracted;

    const externalTexts = [];
    for (const extUrl of extLinks) {
      try {
        const extText = extUrl.endsWith('.pdf')
          ? await fetchPDFText(extUrl, `${filenameSafe}_external.pdf`)
          : await fetchExternalPageText(extUrl);

        if (extText) {
          externalTexts.push(`\n\n--- EXTERNAL LINK: ${extUrl} ---\n${extText.slice(0, 3000)}\n--------------------------`);
        }
      } catch {
        console.warn(`⚠️ External fetch failed: ${extUrl}`);
      }
    }

    const imagesForPdf = [];
    for (const imgPath of imageFiles) {
      try {
        const buffer = fs.readFileSync(imgPath);
        const base64 = buffer.toString('base64');
        if (base64.length < 1000) continue;
        imagesForPdf.push({ base64, mime: 'image/jpeg' });
      } catch (e) {
        console.warn(`⚠️ Failed reading image: ${imgPath}`, e.message);
      }
    }
    
let slideNote = '';
   const fullText = [
  generateMetadataText(metadata),
  mainContent,
  slideNote,
  ocrExtracted ? `\n\n--- OCR EXTRACTED TEXT ---\n${ocrText}` : '',
  ...externalTexts
].join('\n');

    fs.writeFileSync(filePath, fullText);

    await saveStructuredPdfDirectly({
      content: mainContent,
      metadata,
      ocrText,
      extLinks,
      outputPath: pdfPath,
      images: imagesForPdf
    });

    // ✅ Upload to Drive
    const keywordType = 'people';
    const keywordValue = 'direct-link';

    const uploadFiles = [filePath, pdfPath];
    if (fs.existsSync(videoPath)) {
      console.log(`🎥 Found video to upload: ${videoPath}`);
      uploadFiles.push(videoPath);
    }
    console.log('📤 Attempting uploadFilesToDrive with:', {
  keywordType,
  keywordValue,
  files: [filePath, pdfPath, ...(fs.existsSync(videoFilePath) ? [videoFilePath] : [])],
});
console.log(`🔍 Uploading to Shared Drive under:`, appSpaceFolderId);
    console.log(`📤 Uploading files to Google Drive...`);
try {
  await uploadFilesToDrive(uploadFiles, drive, appSpaceFolderId, keywordType, keywordValue);
  console.log(`✅ Upload complete.`);
} catch (e) {
  console.error(`❌ Upload failed:`, e.message);
}

    // ✅ Track scraped URL
    existingUrls.add(cleanUrl);

    // ✅ Cleanup OCR
    cleanupAllOcrImagesInFolder(folder, filenameSafe, true);

    return { ...metadata, content: mainContent };
  } catch (err) {
    console.warn(`⚠️ Direct post failed: ${err.message}`);
    return null;
  }
}

/**
 * Scrapes LinkedIn posts for a given keyword, extracts metadata, performs OCR, creates summaries,
 * and uploads structured outputs (text, PDF, video) to Google Drive.
 */


async function scrapePostsForKeyword(
  page,
  keyword,
  keywordFolder,
  keywordType = 'keyword',
  keywordValue = keyword,
  existingUrls = new Set(),
  drive,
  appSpaceFolderId,
  auth
) {
  const safeKeyword = sanitizeForPath(keywordValue);
  const url = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
  console.log(`🔍 Searching: "${keyword}"`);

  try {
    const success = await safeGoto(page, url);
    if (!success) return [];

    await autoScrollUntilStable(page);
    await page.waitForSelector('div.feed-shared-update-v2', { timeout: 20000 });
  } catch (e) {
    console.warn('❌ Failed to load results:', e.message);
    return [];
  }

  await autoScrollUntilStable(page);
  const posts = await page.$$('div.feed-shared-update-v2');
  const results = [];

  for (let i = 0; i < posts.length; i++) {
    try {
      const post = posts[i];
      await expandAllSeeMoreInPost(post);
      await delay(800);

      const postUrl = await getAccuratePostUrl(post);
      if (!postUrl) continue;

      const cleanUrl = postUrl.split('?')[0].split('#')[0];
      if (existingUrls.has(cleanUrl)) {
        console.log(`⏭️ Already scraped: ${cleanUrl}`);
        continue;
      }

      const baseName = cleanUrl.split('/').pop().replace(/[^a-z0-9\-_]/gi, '_');
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const filenameSafe = `${baseName}_${randomSuffix}`;
      const filePath = path.join(keywordFolder, `${filenameSafe}.txt`);
      const pdfPath = filePath.replace(/\.txt$/, '.pdf');
      const videoFilePath = path.join(keywordFolder, `${filenameSafe}.mp4`);

      // Ensure the folder exists before file writing
      if (!fs.existsSync(keywordFolder)) {
        fs.mkdirSync(keywordFolder, { recursive: true });
      }

      const mainContent = await post.innerText();
      // 🧠 Slide deck detection and extraction
      const slideImageUrls = await extractSlideDeckImages(post);
let slideNote = '';
if (slideImageUrls.length > 0) {
  slideNote += `\n\n📄 [Slide Deck Detected] - ${slideImageUrls.length} slides\n`;
  slideImageUrls.forEach((url, idx) => {
    slideNote += `Slide ${idx + 1}: ${url}\n`;
  });
}
      if (!mainContent || mainContent.length < 20) continue;

      const likeCount = await getNumericAriaValue(post, '[aria-label*=" reaction"]');
      const commentCount = await getNumericAriaValue(post, '[aria-label*=" comment"]');
      const shareCount = await getNumericAriaValue(post, '[aria-label*=" repost"]');
      const engagementScore = computeEngagementScore(likeCount, commentCount, shareCount);
      const engagementTag = engagementScore > 50 ? '🔥 High Engagement' : '';

      const cleanText = removeMetadataHeaders(mainContent);
      const category = classifyPost(cleanText);
      const extLinks = extractExternalLinks(mainContent);
      const timestamp = new Date().toISOString();
      const authorEl =
  await post.$('[data-test-feed-shared-actor-name]') ||
  await post.$('span.feed-shared-actor__name') ||
  await post.$('span.update-components-actor__title span[aria-hidden="true"]');

const author = authorEl ? (await authorEl.innerText()).trim() : 'Unknown';

      const metadata = {
        keywordType,
        keyword: keywordValue,
        url: cleanUrl,
        filename: `${filenameSafe}.txt`,
        videoDownloaded: false,
        externalLinks: extLinks,
        likeCount,
        commentCount,
        shareCount,
        engagementScore,
        engagementTag,
        scrapedAt: timestamp,
        category, 
        author
      };

      const videoPath = await downloadVideoFromPost(post, keywordFolder, filenameSafe);
      if (videoPath) metadata.videoDownloaded = true;

      const { ocrText, ocrExtracted, imageFiles } = await extractOCRFromPostImages(post, keywordFolder, filenameSafe);
      metadata.ocrExtracted = ocrExtracted;

      const externalTexts = [];
      for (const extUrl of extLinks) {
        try {
          const extText = extUrl.endsWith('.pdf')
            ? await fetchPDFText(extUrl, `${filenameSafe}_external.pdf`)
            : await fetchExternalPageText(extUrl);
          if (extText) {
            externalTexts.push(`\n\n--- EXTERNAL LINK: ${extUrl} ---\n${extText.slice(0, 3000)}\n--------------------------`);
          }
        } catch (err) {
          console.warn(`❌ External link fetch failed: ${extUrl}`, err.message);
        }
      }

      const imagesForPdf = imageFiles.map(img => {
        try {
          const buf = fs.readFileSync(img);
          const base64 = buf.toString('base64');
          return base64.length > 100 ? { base64, mime: 'image/jpeg' } : null;
        } catch (e) {
          console.warn(`⚠️ Failed to read image ${img}:`, e.message);
          return null;
        }
      }).filter(Boolean);

      const fullText = [
      generateMetadataText(metadata),
      mainContent,
      slideNote,
      ocrExtracted ? `\n\n--- OCR EXTRACTED TEXT ---\n${ocrText}` : '',
      ...externalTexts
      ].join('\n');
      fs.writeFileSync(filePath, fullText);

      await saveStructuredPdfDirectly({
        content: mainContent,
        metadata,
        ocrText,
        extLinks,
        outputPath: pdfPath,
        images: imagesForPdf
      });

      const filesToUpload = [filePath, pdfPath, videoFilePath].filter(fp => fs.existsSync(fp));

      if (!drive || !appSpaceFolderId) {
        console.error('❌ Drive client or Shared Drive ID is missing');
      } else if (filesToUpload.length > 0) {
        try {
          await uploadFilesToDrive(
            filesToUpload,
            drive,
            appSpaceFolderId,
            keywordType,
            keywordValue
          );
          console.log(`✅ Upload complete for ${filenameSafe}`);
        } catch (uploadErr) {
          console.error(`❌ Upload failed for ${filenameSafe}:`, uploadErr.message);
        }
      } else {
        console.warn(`⚠️ No valid files to upload for ${filenameSafe}`);
      }

      existingUrls.add(cleanUrl);
      results.push({ ...metadata, content: mainContent });
      cleanupAllOcrImagesInFolder(keywordFolder, filenameSafe, true);
    } catch (err) {
      console.warn(`⚠️ Post ${i + 1} failed:`, err.stack || err.message);
    }
  }

  return results;
}

// Helper
async function getNumericAriaValue(post, selector) {
  const el = await post.$(selector);
  if (!el) return 0;
  const label = await el.getAttribute('aria-label');
  return parseInt(label?.replace(/[^\d]/g, '') || '0');
}




// ✅ REPLACEMENT FUNCTION FOR `scrapePostsForKeyword()` ONLY FOR `people` TYPE
// Use this ONLY when keywordType === 'people'
// ✅ FIXED scrapePostsForPerson: Ensure person name is matched in posts before saving

async function scrapePostsFromSearchPageIfPresent(page, normalizedTarget) {
  const heading = await page.locator('h2:has-text("Posts by")');
  if (!(await heading.isVisible())) {
    console.log(`ℹ️ No inline \"Posts by\" section found.`);
    return null;
  }

  console.log(`✅ Found inline \"Posts by\" section on search page`);

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 3000);
    await delay(2500);
  }

  const posts = await page.$$('div.feed-shared-update-v2');
  console.log(`📝 Inline search page → Found ${posts.length} post(s)`);

  const filtered = [];

  for (const post of posts) {
    const authorEl =
      await post.$('[data-test-feed-shared-actor-name]') ||
      await post.$('span.feed-shared-actor__name') ||
      await post.$('span.update-components-actor__title span[aria-hidden="true"]');

    const author = authorEl ? (await authorEl.innerText()).trim() : 'Unknown';
    const authorText = author.toLowerCase();

    let author_match = false;
    let category = 'Uncategorized';

    if (targetAuthors.some(name => authorText.includes(name.toLowerCase()))) {
      category = 'Research';
      author_match = true;
    }

    if (authorText.includes(normalizedTarget)) {
      filtered.push(post);
    } else {
      console.log(`⏭️ Skipped post by another author: "${authorText}"`);
    }
  }

  return filtered;
}

async function navigateToPersonPosts(page, personName) {
  console.log(`🔍 Navigating to profile of: "${personName}"`);

  await safeGoto(page, 'https://www.linkedin.com/');
  await delay(1000);

  const searchBox = await page.getByRole('combobox', { name: 'Search' });
  await searchBox.click();
  await delay(300);
  await searchBox.fill(personName);
  await delay(1000);

  const suggestion = await page.locator('div[role="listbox"] div[role="option"]').first();
  if (await suggestion.isVisible()) {
    console.log(`✅ Autocomplete suggestion appeared. Clicking first suggestion...`);
    await suggestion.click();
    await page.waitForLoadState('domcontentloaded');
    await delay(3000);
    return page.url();
  }

  console.warn(`⚠️ No suggestion matched, fallback to Enter key`);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('domcontentloaded');
  await delay(3000);
  return page.url();
}


async function scrapePostsFromCurrentPage(page, normalizedTarget) {
  console.log(`📜 Scrolling current page for posts...`);

  let lastCount = 0;
  let unchangedScrolls = 0;

  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 4000);
    await delay(3000);

    const postsNow = await page.$$('div.feed-shared-update-v2');
    const currentCount = postsNow.length;

    if (currentCount === lastCount) {
      unchangedScrolls++;
      if (unchangedScrolls >= 2) {
        console.log(`🛑 No new posts after ${i + 1} scrolls.`);
        break;
      }
    } else {
      unchangedScrolls = 0;
      lastCount = currentCount;
    }
  }

  const posts = await page.$$('div.feed-shared-update-v2');
  console.log(`📝 Found ${posts.length} post(s)`);

  const filtered = [];

  for (const post of posts) {
    const authorEl =
      await post.$('[data-test-feed-shared-actor-name]') ||
      await post.$('span.feed-shared-actor__name') ||
      await post.$('span.update-components-actor__title span[aria-hidden="true"]');

    const authorText = authorEl ? (await authorEl.innerText()).toLowerCase().trim() : '';

    if (authorText.includes(normalizedTarget)) {
      filtered.push(post);
    } else {
      console.log(`⏭️ Skipped post by: "${authorText}"`);
    }
  }

  return filtered;
}


// Updated scrapePostsForPerson with profile navigation + scrolling

async function autoScrollUntilStable(page, maxScrolls = 20, wait = 2500) {
  let previousHeight = 0;
  let stuckCount = 0;

  for (let i = 0; i < maxScrolls; i++) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) {
      stuckCount++;
      if (stuckCount >= 2) {
        console.log(`🛑 No new content after ${i + 1} scrolls.`);
        break;
      }
    } else {
      stuckCount = 0;
    }

    previousHeight = currentHeight;
    await page.mouse.wheel(0, 3000);
    await delay(wait);
  }
}

async function scrapePostsForPerson(
  page,
  profileUrl,
  personName,
  keywordFolder,
  existingUrls = new Set(),
  keywordType = 'people',
  keyword = personName,
  drive,
  appSpaceFolderId,
  auth
) {
  const results = [];
  const keywordValue = keyword;

  console.log(`👤 Navigating to: ${profileUrl}`);
  const success = await safeGoto(page, profileUrl);
  if (!success) return [];

  await delay(2000);
  await autoScrollUntilStable(page);
  if (!fs.existsSync(keywordFolder)) fs.mkdirSync(keywordFolder, { recursive: true });

  const posts = await page.$$('div.feed-shared-update-v2');
  console.log(`📝 Loaded ${posts.length} post(s)`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    let filenameSafe = '';

    try {
      await expandAllSeeMoreInPost(post);
      await delay(300);

      const postUrl = await getAccuratePostUrl(post);
      if (!postUrl) continue;

      const cleanUrl = postUrl.split('?')[0].split('#')[0];
      const hash = crypto.createHash('sha1').update(cleanUrl).digest('hex').slice(0, 4);
      const slug = cleanUrl.split('/').pop().replace(/[^a-z0-9_-]/gi, '_');
      filenameSafe = `${slug}_${hash}`;

      const filePath = path.join(keywordFolder, `${filenameSafe}.txt`);
      const pdfPath = filePath.replace(/\.txt$/, '.pdf');
      const videoFilePath = path.join(keywordFolder, `${filenameSafe}.mp4`);

      if (existingUrls.has(cleanUrl) || fs.existsSync(filePath)) {
        console.log(`⏭️ Already scraped or saved: ${cleanUrl}`);
        continue;
      }

      const mainContent = await post.innerText();
      if (!mainContent || mainContent.length < 20) continue;

      const likesEl = await post.$('[aria-label*=" reaction"]');
      const commentsEl = await post.$('[aria-label*=" comment"]');
      const sharesEl = await post.$('[aria-label*=" repost"]');

      const likeCount = likesEl ? parseInt((await likesEl.getAttribute('aria-label'))?.replace(/[^\d]/g, '') || '0') : 0;
      const commentCount = commentsEl ? parseInt((await commentsEl.getAttribute('aria-label'))?.replace(/[^\d]/g, '') || '0') : 0;
      const shareCount = sharesEl ? parseInt((await sharesEl.getAttribute('aria-label'))?.replace(/[^\d]/g, '') || '0') : 0;
      const engagementScore = computeEngagementScore(likeCount, commentCount, shareCount);
      const engagementTag = engagementScore > 50 ? '🔥 High Engagement' : '';

      let topComment = '';
      try {
        const commentBox = await post.$('div.comments-comments-list__comment-item');
        if (commentBox) topComment = await commentBox.innerText();
      } catch {}

    const isOllamaRunning = () => {
  try {
    execSync('curl -s http://localhost:11434');
    return true;
  } catch {
    return false;
  }
};

let sentiment = '';
if (isOllamaRunning()) {
  try {
    const prompt = `Analyze sentiment:\nPOST:\n${mainContent}\nCOMMENT:\n${topComment}\nRespond with one word: Positive, Negative, or Neutral.`;
    const response = execSync(`ollama run mistral`, { input: prompt }).toString().trim();
    sentiment = response.split('\n')[0];
  } catch (err) {
    console.warn(`⚠️ Sentiment inference failed:`, err.message);
  }
} else {
  console.warn(`⚠️ Ollama is not running. Skipping sentiment analysis.`);
}


      const extLinks = extractExternalLinks(mainContent);
      const timestamp = new Date().toISOString();
      const category = classifyPost(mainContent);
      const authorEl = await post.$('[data-test-feed-shared-actor-name]') ||
                 await post.$('span.feed-shared-actor__name') ||
                 await post.$('span.update-components-actor__title span[aria-hidden="true"]');

const author = authorEl ? (await authorEl.innerText()).trim() : 'Unknown';

      const metadata = {
        keywordType,
        keyword,
        url: cleanUrl,
        filename: `${filenameSafe}.txt`,
        scrapedAt: timestamp,
        externalLinks: extLinks,
        likeCount,
        commentCount,
        shareCount,
        engagementScore,
        engagementTag,
        topComment,
        sentiment, 
        category, 
        author
      };

      const videoPath = await downloadVideoFromPost(post, keywordFolder, filenameSafe);
      if (videoPath) metadata.videoDownloaded = true;

      const { ocrText, ocrExtracted, imageFiles } = await extractOCRFromPostImages(post, keywordFolder, filenameSafe);
      metadata.ocrExtracted = ocrExtracted;

      const imagesForPdf = imageFiles.map(img => {
        try {
          const buf = fs.readFileSync(img);
          const base64 = buf.toString('base64');
          return base64.length > 1000 ? { base64, mime: 'image/jpeg' } : null;
        } catch {
          return null;
        }
      }).filter(Boolean);

      const externalTexts = [];
      for (const extUrl of extLinks) {
        try {
          const extText = extUrl.endsWith('.pdf')
            ? await fetchPDFText(extUrl, `${filenameSafe}_external.pdf`)
            : await fetchExternalPageText(extUrl);
          if (extText) {
            externalTexts.push(`\n\n--- EXTERNAL LINK: ${extUrl} ---\n${extText.slice(0, 3000)}\n--------------------------`);
          }
        } catch {}
      }
let slideNote = '';
      const fullText = [
  generateMetadataText(metadata),
  mainContent,
  slideNote,
  ocrExtracted ? `\n\n--- OCR EXTRACTED TEXT ---\n${ocrText}` : '',
  ...externalTexts
].join('\n');

      fs.writeFileSync(filePath, fullText);

      await saveStructuredPdfDirectly({
        content: mainContent,
        metadata,
        ocrText,
        extLinks,
        outputPath: pdfPath,
        images: imagesForPdf
      });

      // ✅ Rewritten safer upload block (fully backward compatible)
const filesToUpload = [filePath, pdfPath];
if (fs.existsSync(videoFilePath)) {
  console.log(`🎥 Found video to upload: ${videoFilePath}`);
  filesToUpload.push(videoFilePath);
}

console.log(`📤 Preparing to upload to GDrive`);
console.log(`📄 Local files:`, filesToUpload);
console.log(`🔍 Uploading to Shared Drive under: ${appSpaceFolderId}`);

if (!drive || !appSpaceFolderId) {
  console.error('❌ Drive client or Shared Drive ID is missing');
} else {
  try {
    await uploadFilesToDrive(
      filesToUpload,
      drive,
      appSpaceFolderId,
      keywordType,
      keywordValue
    );
    console.log(`✅ Upload complete for ${filenameSafe}`);
  } catch (uploadErr) {
    console.error(`❌ Upload failed for ${filenameSafe}:`, uploadErr.message);
  }
}

      existingUrls.add(cleanUrl);
      results.push({ ...metadata, content: mainContent });
      cleanupAllOcrImagesInFolder(keywordFolder, filenameSafe, true);
    } catch (err) {
      console.warn(`⚠️ Post ${i + 1} failed:`, err.message);
    } finally {
      cleanupAllOcrImagesInFolder(keywordFolder, filenameSafe, true);
    }
  }

  return results;
}
/**
 * Uploads one or more files to the target folder path in Google Drive
 * Supports Shared Drives using `supportsAllDrives: true`
 */


async function main() {
  const browser = await chromium.launch({ headless: false });
  const drive = await getDriveClient();
  const appSpaceFolderId = process.env.APP_SPACE_FOLDER_ID;

  if (!appSpaceFolderId) throw new Error("❌ DRIVE_FOLDER_ID is not defined in your .env file");

  const context = await browser.newContext();
  await loginWithCookie(context);
  const page = await context.newPage();

  const allResults = [];
  const outputFile = path.join(OUTPUT_PATH, 'posts.json');

  let existing = fs.existsSync(outputFile)
    ? JSON.parse(fs.readFileSync(outputFile, 'utf8'))
    : [];

  const existingUrls = new Set(existing.map(p => (p.url || '').split('?')[0].split('#')[0]));

  console.log(`🟢 Starting scrape with ${SEED_CONFIG.length} seed configurations...`);

  for (const seed of SEED_CONFIG) {
    console.log(`📘 Processing seed:\n${JSON.stringify(seed, null, 2)}\n`);

    const validLinkedInSeed = seed.platforms?.includes('LinkedIn') || seed.source === 'LinkedIn';
    const wantsPosts = !seed.contentTypes || seed.contentTypes.length === 0 || seed.contentTypes.includes('post');

    if (validLinkedInSeed && wantsPosts) {
      const queries = generateSearchTermsFromSeed(seed);
      console.log(`🔍 Generated search terms:`, queries);

      for (const { value: term, type } of queries) {
        const folderName = `${type}_${term.replace(/\s+/g, '_')}`;
        const keywordFolder = path.join(OUTPUT_PATH, folderName);
        if (!fs.existsSync(keywordFolder)) fs.mkdirSync(keywordFolder);

        const keywordType = type;
        const keywordValue = term;

        const results = type === 'people'
          ? await scrapePostsForPerson(page, term, term, keywordFolder, existingUrls, keywordType, keywordValue, drive, appSpaceFolderId)
          : await scrapePostsForKeyword(page, term, keywordFolder, keywordType, keywordValue, existingUrls, drive, appSpaceFolderId);

        allResults.push(...results);
      }
    }

    if (seed.urlsFile) {
      const links = fs.readFileSync(seed.urlsFile, 'utf-8')
        .split('\n')
        .map(link => link.trim())
        .filter(Boolean);

      const keywordType = 'people';
      const keyword = seed.name || 'direct-link';
      const keywordFolder = path.join(OUTPUT_PATH, `${keywordType}_${keyword.replace(/\s+/g, '_')}`);
      if (!fs.existsSync(keywordFolder)) fs.mkdirSync(keywordFolder);

      for (const link of links) {
        const personName = link.split('/')[4]?.replace(/-/g, ' ') || 'unknown';

        const results = await scrapePostsForPerson(
          page,
          link,
          personName,
          keywordFolder,
          existingUrls,
          keywordType,
          keyword,
          drive,
          appSpaceFolderId
        );

        if (results) allResults.push(...results);
      }
    }
  }

  const merged = [...existing, ...allResults].filter((v, i, arr) =>
    arr.findIndex(p => (p.url || '').split('?')[0].split('#')[0] === (v.url || '').split('?')[0].split('#')[0]) === i
  );

  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));
  console.log(`📦 Total: ${merged.length} → Updated ${outputFile}`);
  await browser.close();
}


console.log(`🟢 Starting scrape with ${SEED_CONFIG.length} seed configurations...`);
main();