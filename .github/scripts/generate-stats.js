const { Octokit } = require('@octokit/rest');
const fs = require('fs');

const octokit = new Octokit({
  auth: process.env.STATS_TOKEN 
});

const username = process.env.GITHUB_USERNAME || 'feeeedox';

const languageColors = {
  'JavaScript': '#f1e05a',
  'TypeScript': '#3178c6',
  'HTML': '#e34c26',
  'CSS': '#563d7c',
  'Java': '#b07219',
  'Dart': '#00B4AB',
  'Vue': '#41b883',
  'Lua': '#000080',
  'Python': '#3572A5',
  'PHP': '#4F5D95',
  'C++': '#f34b7d',
  'C#': '#178600',
  'Go': '#00ADD8',
  'Default': '#B6FF05' 
};

async function getGitHubStats() {
  try {
    const repos = await octokit.paginate(octokit.repos.listForUser, {
      username: username,
      type: 'owner', 
      per_page: 100
    });

    console.log(`Found ${repos.length} public owned repositories.`);

    let totalStars = 0;
    let totalForks = 0;
    const languageStats = {};

    for (const repo of repos) {
      if (repo.fork) continue; 

      totalStars += repo.stargazers_count;
      totalForks += repo.forks_count;

      try {
        const { data: langs } = await octokit.repos.listLanguages({
          owner: username,
          repo: repo.name
        });
        for (const [lang, bytes] of Object.entries(langs)) {
          languageStats[lang] = (languageStats[lang] || 0) + bytes;
        }
      } catch (e) {
      }
    }

    const { data: commitData } = await octokit.search.commits({ q: `author:${username} is:public` });
    const { data: prData } = await octokit.search.issuesAndPullRequests({ q: `author:${username} type:pr is:public` });
    const { data: issueData } = await octokit.search.issuesAndPullRequests({ q: `author:${username} type:issue is:public` });

    const sortedLangs = Object.entries(languageStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalBytes = sortedLangs.reduce((sum, [, bytes]) => sum + bytes, 0);

    const languages = sortedLangs.map(([name, bytes]) => ({
      name,
      percentage: ((bytes / totalBytes) * 100).toFixed(1),
      color: languageColors[name] || languageColors['Default']
    }));

    return {
      totalStars,
      totalForks,
      totalCommits: commitData.total_count,
      totalPRs: prData.total_count,
      totalIssues: issueData.total_count,
      totalRepos: repos.length,
      languages
    };
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function generateSVG(stats) {
  const svgTemplate = fs.readFileSync('stats-template.svg', 'utf8');
  
  let svg = svgTemplate
    .replace(/TOTAL_STARS_VALUE/g, formatNumber(stats.totalStars))
    .replace(/TOTAL_COMMITS_VALUE/g, formatNumber(stats.totalCommits))
    .replace(/PULL_REQUESTS_VALUE/g, formatNumber(stats.totalPRs))
    .replace(/ISSUES_VALUE/g, formatNumber(stats.totalIssues))
    .replace(/TOTAL_REPOS_VALUE/g, formatNumber(stats.totalRepos))
    .replace(/TOTAL_FORKS_VALUE/g, formatNumber(stats.totalForks));
  
  stats.languages.forEach((lang, index) => {
    const i = index + 1;
    svg = svg.replace(`LANGUAGE_${i}_NAME`, lang.name)
             .replace(`LANGUAGE_${i}_PERCENT`, lang.percentage);

    svg = svg.replace('#D2712C', lang.color);
    
    const barWidth = Math.round((parseFloat(lang.percentage) / 100) * 125);
    const barRegex = new RegExp(`width="\\d+" height="9" rx="3" fill="#D2712C"`, 'i');
    svg = svg.replace(barRegex, `width="${barWidth}" height="9" rx="3" fill="${lang.color}"`);
  });
  
  return svg;
}

async function main() {
  console.log('Fetching PUBLIC GitHub stats...');
  const stats = await getGitHubStats();
  console.log('Public Stats:', stats);
  const svg = generateSVG(stats);
  fs.writeFileSync('stats.svg', svg);
  console.log('SVG generated successfully!');
}

main().catch(console.error);