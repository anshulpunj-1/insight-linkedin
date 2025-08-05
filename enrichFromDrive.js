import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { getDriveClient } from './scraper/auth.js'; // service account auth
import {
  ensureDriveFolderPath,
  listFilesInFolder,
  downloadTextFile
} from './scraper/driveUtils.js';
import { saveStructuredPdfDirectly } from './scraper/utils/saveStructuredPdf.js';
import { ensureDrivePath } from './scraper/driveUtils';

config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PARENT_FOLDER = 'Scraper/LinkedInScrapes';
const SUMMARY_FOLDER = `${PARENT_FOLDER}/summary/enriched`;

function parsePostContent(text) {
  const metadataRegex = /--- METADATA ---([\s\S]*?)----------------/;
  const metadataMatch = text.match(metadataRegex);
  return metadataMatch
    ? text.split(metadataMatch[0])[1]?.trim() || ''
    : text.trim();
}

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function enrichInsightsFromDrive() {
  const drive = await getDriveClient();

  // Use Shared Drive folder ID from env as root
  const driveFolderId = process.env.DRIVE_FOLDER_ID;

  // Optional: create/check nested folder structure inside Shared Drive root
  const summaryFolderId = await ensureDriveFolderPath(drive, 'Scraper/LinkedInScrapes/summary/enriched', sharedDriveRootId);
  const folders = await listFilesInFolder(drive, sharedDriveRootId, true);
  const postsByKeyword = {};

  for (const folder of folders) {
    const name = folder.name;
    if (name === 'summary' || !name.includes('_')) continue;

    const keyword = name.split('_').slice(1).join('_');
    const keywordFolderId = folder.id;
    const subfolders = await listFilesInFolder(drive, keywordFolderId, true);
    const rawFolder = subfolders.find(f => f.name === 'raw');
    if (!rawFolder) continue;

    const files = await listFilesInFolder(drive, rawFolder.id);
    const txtFiles = files.filter(f => f.name.endsWith('.txt'));

    for (const file of txtFiles) {
      try {
        const rawText = await downloadTextFile(drive, file.id);
        const content = parsePostContent(rawText);
        if (!content || content.length < 30) continue;
        if (!postsByKeyword[keyword]) postsByKeyword[keyword] = [];
        postsByKeyword[keyword].push(content);
      } catch {
        // ignore single file errors
      }
    }
  }

  const keywords = Object.keys(postsByKeyword);
  if (!keywords.length) {
    console.warn('⚠️ No post data found.');
    return;
  }

  let toc = '## 📑 Table of Contents\n';
  let finalReport = '# 📊 LinkedIn Trend Insights Report\n\n';
  finalReport += 'This report summarizes enriched insights grouped by topic from LinkedIn data.\n\n';
  finalReport += `🕒 Generated on: ${new Date().toLocaleString()}\n\n---\n\n`;

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const posts = postsByKeyword[keyword];
    const combinedPosts = posts.map(p => p.slice(0, 3000)).join('\n\n');

    const prompt = `You are a LinkedIn trend analyst. Based on the following posts under the topic "${keyword}", generate a single insights report with:
- Top emerging trends
- What industry leaders are saying
- Most discussed challenges and solutions
- Actionable takeaways
- What teams should focus on`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: `${prompt}\n\n${combinedPosts}` }],
        temperature: 0.4,
        max_tokens: 2000
      });

      const enriched = completion.choices?.[0]?.message?.content?.trim() || '';
      const blockId = `block-${i + 1}`;
      toc += `- [${keyword.toUpperCase()}](#${blockId})\n`;

      finalReport += `\n\n---\n\n<a name="${blockId}"></a>\n\n`;
      finalReport += `### 📘 ${keyword.toUpperCase()}\n\n`;
      finalReport += enriched
        .replace(/[*]{2}/g, '') // remove markdown bold
        .replace(/(Top emerging trends:?)/gi, '**🔹 $1**')
        .replace(/(What industry leaders are saying:?)/gi, '**👥 $1**')
        .replace(/(Most discussed challenges and solutions:?)/gi, '**⚠️ $1**')
        .replace(/(Actionable takeaways:?)/gi, '**✅ $1**')
        .replace(/(What teams should focus on:?)/gi, '**🧠 $1**')
        .trim();
    } catch (err) {
      console.warn(`⚠️ Skipping ${keyword}:`, err.message);
    }
  }

  finalReport = `${toc}\n\n${finalReport}`;

  if (!fs.existsSync('output')) fs.mkdirSync('output');
  const mdPath = path.join('output', 'insight_report.md');
  fs.writeFileSync(mdPath, finalReport);

  const pdfPath = path.join('output', 'insight_report.pdf');
  await saveStructuredPdfDirectly({
    content: finalReport,
    metadata: { insight: true }, // suppress metadata
    extLinks: [],
    outputPath: pdfPath,
    images: []
  });

  // Upload files to the created/ensured folder in Shared Drive
  await uploadToDrive(drive, [mdPath, pdfPath], summaryFolderId);
  console.log(`✅ Uploaded trend insights to → Shared Drive folder ID ${summaryFolderId}`);
}


async function uploadToDrive(drive, filePaths, parentId) {
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);
    

    const existing = await drive.files.list({
      q: `'${parentId}' in parents and name='${fileName}' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (existing.data.files.length > 0) {
      await drive.files.update({
        fileId: existing.data.files[0].id,
        media: { body: fileStream },
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    } else {
      await drive.files.create({
        requestBody: { name: fileName, parents: [parentId] },
        media: { body: fileStream },
        supportsAllDrives: true,
      });
    }
  }
}

enrichInsightsFromDrive();
