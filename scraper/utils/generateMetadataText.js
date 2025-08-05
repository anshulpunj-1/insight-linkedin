export function generateMetadataText(metadata) {
  const fields = {
    keywordType: metadata.keywordType || '',
    keyword: metadata.keyword || '',
    url: metadata.url || '',
    filename: metadata.filename || '',
    videoDownloaded: metadata.videoDownloaded || false,
    ocrExtracted: metadata.ocrExtracted || false,
    likeCount: metadata.likeCount ?? 0,
    commentCount: metadata.commentCount ?? 0,
    shareCount: metadata.shareCount ?? 0,
    engagementScore: metadata.engagementScore ?? '',  // ✅ ADD THIS
    engagementTag: metadata.engagementTag || '',       // ✅ ADD THIS
    topComment: metadata.topComment || '',
    sentiment: metadata.sentiment || '',
    externalLinks: (metadata.externalLinks || []).join(', '),
    category: metadata.category || '',
    scrapedAt: metadata.scrapedAt || '',
    author: metadata.author || 'Unknown' 
  };

  return `--- METADATA ---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n----------------\n`;
}