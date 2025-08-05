// seedBuilder.js
import inquirer from 'inquirer';
import fs from 'fs';

async function askSeedConfig() {
  const config = [];

  async function askEntry() {
    const base = await inquirer.prompt([
      { type: 'input', name: 'topic', message: '🔍 Research Topic (optional):' },
      { type: 'input', name: 'keywords', message: '💡 Keyword or Hashtag (required):', validate: v => !!v || 'Keyword is required!' },
      { type: 'list', name: 'source', message: '🌐 Source:', choices: ['LinkedIn', 'Medium'] },
      { type: 'checkbox', name: 'contentType', message: '📄 Content Type(s):', choices: ['post', 'article', 'newsletter'] },
      { type: 'input', name: 'hashtags', message: '🏷️ Hashtags (comma separated, optional):' },
      { type: 'input', name: 'people', message: '👤 People (comma separated, optional):' },
      { type: 'input', name: 'organizations', message: '🏢 Organizations (comma separated, optional):' },
      { type: 'input', name: 'groups', message: '👥 Groups to search (comma separated, optional):' },
      { type: 'input', name: 'domainMentions', message: '🌐 Domain mentions (*.com, comma separated, optional):' },
      { type: 'input', name: 'urlSeeds', message: '🔗 Specific post URLs (comma separated, optional):' },
      { type: 'input', name: 'category', message: '📚 Category (e.g., HR Tech, Sustainability):' },
      { type: 'number', name: 'likes', message: '❤️ Min Likes (optional):', default: 0 },
      { type: 'number', name: 'comments', message: '💬 Min Comments (optional):', default: 0 },
      { type: 'number', name: 'days', message: '🗓️ Date Range (last X days):', default: 30 },
      { type: 'input', name: 'language', message: '🌍 Language (e.g., en, fr, de):', default: 'en' }
    ]);

    const entry = {
      topic: base.topic,
      keywords: [base.keyword],
      platforms: [base.source],
      contentTypes: base.contentType,
      hashtags: base.hashtags ? base.hashtags.split(',').map(x => x.trim()) : [],
      people: base.people ? base.people.split(',').map(x => x.trim()) : [],
      organizations: base.organizations ? base.organizations.split(',').map(x => x.trim()) : [],
      groups: base.groups ? base.groups.split(',').map(x => x.trim()) : [],
      domainMentions: base.domainMentions ? base.domainMentions.split(',').map(x => x.trim()) : [],
      urlSeeds: base.urlSeeds ? base.urlSeeds.split(',').map(x => x.trim()) : [],
      category: base.category,
      dateRange: `last ${base.days} days`,
      engagementFilter: {
        likes: base.likes,
        comments: base.comments
      },
      language: base.language
    };

    config.push(entry);
  }

  while (true) {
    await askEntry();
    const { again } = await inquirer.prompt([{ type: 'confirm', name: 'again', message: '➕ Add another seed config?', default: false }]);
    if (!again) break;
  }

  fs.writeFileSync('./seed_config.json', JSON.stringify(config, null, 2));
  console.log('\n✅ seed_config.json saved successfully!\n');
}

askSeedConfig();