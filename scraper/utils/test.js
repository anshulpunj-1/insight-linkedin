import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { saveTextToPdf } from './utils/savePdfFromText.js';
dotenv.config();

const OUTPUT_PATH = './output';
if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH);
const SEED_CONFIG = JSON.parse(fs.readFileSync('./seed_config.json', 'utf-8'));
const delay = ms => new Promise(res => setTimeout(res, ms));

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

function generateMetadataText(metadata) {
  return `--- METADATA ---\n${Object.entries(metadata).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')}\n----------------\n`;
}

function extractExternalLinks(text) {
  const regex = /https?:\/\/[^\s\)\]\}"']+/g;
  return [...new Set((text.match(regex) || []))];
}

function generateSearchTermsFromSeed(seed) {
  const terms = [];
  if (seed.keywords) terms.push(...seed.keywords);
  if (seed.hashtags) terms.push(...seed.hashtags.map(h => h.startsWith('#') ? h : `#${h}`));
  if (seed.people) terms.push(...seed.people);
  if (seed.organizations) terms.push(...seed.organizations);
  if (seed.groups) terms.push(...seed.groups);
  if (seed.domainMentions) terms.push(...seed.domainMentions.map(d => d.startsWith('site:') ? d : `site:${d}`));
  if (seed.urlSeeds) terms.push(...seed.urlSeeds);
  if (seed.category) terms.push(seed.category);
  return [...new Set(terms)].filter(Boolean);
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

async function extractOCRFromPostImages(post, folderPath, filenameSafe) {
  const images = await post.$$eval('img', imgs =>
    imgs.map(img => img.src).filter(src => src && src.startsWith('http'))
  );
  if (!images.length) return { ocrText: '', ocrExtracted: false };

  let ocrText = '';
  for (let i = 0; i < images.length; i++) {
    const imgUrl = images[i];
    try {
      const imgResp = await fetch(imgUrl);
      const contentType = imgResp.headers.get('content-type');
      if (!contentType?.startsWith('image/')) continue;
      const tempPath = path.join(folderPath, `${filenameSafe}_ocr_${i}.jpg`);
      const outStream = fs.createWriteStream(tempPath);
      await pipeline(imgResp.body, outStream);

      const stats = fs.statSync(tempPath);
      if (stats.size < 100) {
        fs.unlinkSync(tempPath);
        continue;
      }

      const command = `python3 ocr_helper.py "${tempPath}"`;
      try {
        execSync(command, { stdio: 'inherit' });
        const ocrResultPath = tempPath + '.txt';
        if (fs.existsSync(ocrResultPath)) {
          const text = fs.readFileSync(ocrResultPath, 'utf-8').trim();
          if (text.length > 30) ocrText += `\n[Image ${i + 1}]\n${text}\n`;
          fs.unlinkSync(ocrResultPath);
        }
      } catch (err) {
        console.warn(`❌ OCR error: ${err.message}`);
      }

      fs.unlinkSync(tempPath);
    } catch (err) {
      console.warn(`⚠️ Image OCR failed: ${imgUrl}`, err.message);
    }
  }

  return { ocrText: ocrText.trim(), ocrExtracted: !!ocrText.trim() };
}
async function scrapeDirectLinkedPost(page, url, folder) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('div.feed-shared-update-v2', { timeout: 10000 });
    const post = await page.$('div.feed-shared-update-v2');
    if (!post) return null;

    await expandAllSeeMoreInPost(post);
    await delay(800);

    const postUrl = await getAccuratePostUrl(post) || url;
    const filenameSafe = postUrl.split('/').pop().replace(/[^a-z0-9\-_]/gi, '_');
    const filePath = path.join(folder, `${filenameSafe}.txt`);
    const pdfPath = filePath.replace(/\.txt$/, '.pdf');

    const mainContent = await post.innerText();
    if (!mainContent || mainContent.length < 20) {
      console.warn('⚠️ Skipping empty post content.');
      return null;
    }

    const extLinks = extractExternalLinks(mainContent);
    const timestamp = new Date().toISOString();

    const metadata = {
      keyword: 'direct-link',
      url: postUrl,
      filename: `${filenameSafe}.txt`,
      videoDownloaded: false,
      externalLinks: extLinks,
      scrapedAt: timestamp
    };

    const videoPath = await downloadVideoFromPost(post, folder, filenameSafe);
    if (videoPath) metadata.videoDownloaded = true;

    const { ocrText, ocrExtracted } = await extractOCRFromPostImages(post, folder, filenameSafe);
    metadata.ocrExtracted = ocrExtracted;

    let fullText = `${generateMetadataText(metadata)}\n${mainContent}`;
    if (ocrExtracted)
      fullText += `\n\n--- OCR EXTRACTED TEXT ---\n${ocrText}\n--------------------------`;

    for (const extUrl of extLinks) {
      try {
        const extText = extUrl.endsWith('.pdf')
          ? await fetchPDFText(extUrl, `${filenameSafe}_external.pdf`)
          : await fetchExternalPageText(extUrl);

        if (extText)
          fullText += `\n\n--- EXTERNAL LINK: ${extUrl} ---\n${extText.slice(0, 3000)}\n--------------------------`;
      } catch {
        console.warn(`⚠️ External failed: ${extUrl}`);
      }
    }

    fs.writeFileSync(filePath, fullText);
    await saveTextToPdf(filePath);
    console.log(`✅ Saved: ${filePath}`);

    return { ...metadata, content: mainContent };
  } catch (err) {
    console.warn(`⚠️ Direct post failed: ${err.message}`);
    return null;
  }
}

async function scrapePostsForKeyword(page, keyword, keywordFolder) {
  const url = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
  console.log(`🔍 Searching: "${keyword}"`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('div.feed-shared-update-v2', { timeout: 10000 });
  } catch (e) {
    console.warn('❌ Failed to load results:', e.message);
    return [];
  }

  await page.mouse.wheel(0, 3000);
  await delay(4000);

  const posts = await page.$$('div.feed-shared-update-v2');
  const results = [];

  for (let i = 0; i < posts.length; i++) {
    try {
      const post = posts[i];
      await expandAllSeeMoreInPost(post);
      await delay(800);

      const postUrl = await getAccuratePostUrl(post);
      if (!postUrl) continue;

      const filenameSafe = postUrl.split('/').pop().replace(/[^a-z0-9\-_]/gi, '_');
      const filePath = path.join(keywordFolder, `${filenameSafe}.txt`);
      if (fs.existsSync(filePath)) {
        console.log(`⏭️ Skipping already saved: ${filenameSafe}.txt`);
        continue;
      }

      const mainContent = await post.innerText();
      if (!mainContent || mainContent.length < 20) continue;

      const extLinks = extractExternalLinks(mainContent);
      const timestamp = new Date().toISOString();

      const metadata = {
        keyword,
        url: postUrl,
        filename: `${filenameSafe}.txt`,
        videoDownloaded: false,
        externalLinks: extLinks,
        scrapedAt: timestamp
      };

      const videoPath = await downloadVideoFromPost(post, keywordFolder, filenameSafe);
      if (videoPath) metadata.videoDownloaded = true;

      const { ocrText, ocrExtracted } = await extractOCRFromPostImages(post, keywordFolder, filenameSafe);
      metadata.ocrExtracted = ocrExtracted;

      let fullText = `${generateMetadataText(metadata)}\n${mainContent}`;
      if (ocrExtracted)
        fullText += `\n\n--- OCR EXTRACTED TEXT ---\n${ocrText}\n--------------------------`;

      for (const extUrl of extLinks) {
        try {
          const extText = extUrl.endsWith('.pdf')
            ? await fetchPDFText(extUrl, `${filenameSafe}_external.pdf`)
            : await fetchExternalPageText(extUrl);
          if (extText)
            fullText += `\n\n--- EXTERNAL LINK: ${extUrl} ---\n${extText.slice(0, 3000)}\n--------------------------`;
        } catch {
          console.warn(`⚠️ External failed: ${extUrl}`);
        }
      }

      fs.writeFileSync(filePath, fullText);
      await saveTextToPdf(filePath);
      console.log(`✅ Saved: ${filePath}`);

      results.push({ ...metadata, content: mainContent });
    } catch (err) {
      console.warn(`⚠️ Post ${i + 1} failed:`, err.message);
    }
  }

  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await loginWithCookie(context);
  const page = await context.newPage();

  const allResults = [];
  const outputFile = path.join(OUTPUT_PATH, 'posts.json');
  let existing = [];
  if (fs.existsSync(outputFile)) {
    existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  }

  for (const seed of SEED_CONFIG) {
    const queries = generateSearchTermsFromSeed(seed);
    for (const query of queries) {
      if (
        (seed.platforms?.includes('LinkedIn') || seed.source === 'LinkedIn') &&
        (seed.contentTypes?.includes('post') || !seed.contentTypes)
      ) {
        const keywordFolder = path.join(OUTPUT_PATH, query.replace(/\s+/g, '_'));
        if (!fs.existsSync(keywordFolder)) fs.mkdirSync(keywordFolder);
        const results = await scrapePostsForKeyword(page, query, keywordFolder);
        allResults.push(...results);
      }
    }

    if (seed.urlsFile) {
      const links = fs.readFileSync(seed.urlsFile, 'utf-8')
        .split('\n')
        .map(link => link.trim())
        .filter(Boolean);
      for (const link of links) {
        const folder = path.join(OUTPUT_PATH, 'direct_links');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder);
        const result = await scrapeDirectLinkedPost(page, link, folder);
        if (result) allResults.push(result);
      }
    }
  }

  const merged = [...existing, ...allResults].filter(
    (v, i, arr) => arr.findIndex(p => p.url === v.url) === i
  );
  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));
  console.log(`📦 Total: ${merged.length} → Updated ${outputFile}`);

  await browser.close();
}

main();