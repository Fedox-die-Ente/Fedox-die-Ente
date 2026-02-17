const { Octokit } = require('@octokit/rest');
const fs = require('fs');

const octokit = new Octokit({
  auth: process.env.STATS_TOKEN
});

const languageColors = {
  'JavaScript': '#f1e05a',
  'TypeScript': '#3178c6',
  'HTML': '#e34c26',
  'CSS': '#563d7c',
  'Java': '#b07219',
  'Dart': '#00B4AB',
  'Vue': '#2c3e50',
  'Ruby': '#701516',
  'Rust': '#dea584',
  'Python': '#3572A5',
  'PHP': '#4F5D95',
  'C++': '#f34b7d',
  'C#': '#178600',
  'Go': '#00ADD8',
  'Swift': '#F05138',
  'Rust': '#dea584',
  'Default': '#B6FF05' 
};

const username = process.env.GITHUB_USERNAME;

async function getGitHubStats() {
  try {
    const { data: user } = await octokit.users.getByUsername({ username });
    
    const repos = [];
    let page = 1;
    while (true) {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        visibility: 'all',
        per_page: 100,
        page
      });
      if (data.length === 0) break;
      repos.push(...data);
      page++;
    }
    
    const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
    const totalCommits = await getTotalCommits(repos);
    const totalPRs = await getTotalPullRequests();
    const totalIssues = await getTotalIssues();
    const totalRepos = user.public_repos + (user.total_private_repos || 0);
    
    const languages = await getTopLanguages(repos);
    
    return {
      totalStars,
      totalForks,
      totalCommits,
      totalPRs,
      totalIssues,
      totalRepos,
      languages
    };
  } catch (error) {
    console.error('Error fetching GitHub stats:', error);
    throw error;
  }
}

async function getTotalCommits(repos) {
  // Benutzt die Search API, um ALLE Commits (auch privat) zu zählen
  try {
    const { data } = await octokit.search.commits({
      q: `author:${username}`,
    });
    return data.total_count;
  } catch (error) {
    let totalCommits = 0;
  
  for (const repo of repos) {
    if (repo.fork) continue;
    
    try {
      const { data: commits } = await octokit.repos.listCommits({
        owner: username,
        repo: repo.name,
        author: username,
        per_page: 1
      });
      
      const response = await octokit.repos.listCommits({
        owner: username,
        repo: repo.name,
        author: username,
        per_page: 100
      });
      
      const linkHeader = response.headers.link;
      if (linkHeader) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match) {
          totalCommits += parseInt(match[1]) * 100;
        } else {
          totalCommits += response.data.length;
        }
      } else {
        totalCommits += response.data.length;
      }
    } catch (error) {
      console.log(`Could not fetch commits for ${repo.name}`);
    }
  }
  
  return totalCommits;
  }
}

async function getTotalPullRequests() {
  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: `author:${username} type:pr`,
      per_page: 1
    });
    return data.total_count;
  } catch (error) {
    console.error('Error fetching PRs:', error);
    return 0;
  }
}

async function getTotalIssues() {
  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: `author:${username} type:issue`,
      per_page: 1
    });
    return data.total_count;
  } catch (error) {
    console.error('Error fetching issues:', error);
    return 0;
  }
}

async function getTopLanguages(repos) {
  const languageStats = {};
  
  for (const repo of repos) {
    if (repo.fork) continue;
    
    try {
      const { data: languages } = await octokit.repos.listLanguages({
        owner: username,
        repo: repo.name
      });
      
      for (const [lang, bytes] of Object.entries(languages)) {
        languageStats[lang] = (languageStats[lang] || 0) + bytes;
      }
    } catch (error) {
      console.log(`Could not fetch languages for ${repo.name}`);
    }
  }
  
  const sortedLanguages = Object.entries(languageStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const totalBytes = sortedLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);
  
  return sortedLanguages.map(([language, bytes]) => ({
    name: language,
    percentage: ((bytes / totalBytes) * 100).toFixed(1)
  }));
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
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
    const langNum = index + 1;
    svg = svg
      .replace(new RegExp(`LANGUAGE_${langNum}_NAME`, 'g'), lang.name)
      .replace(new RegExp(`LANGUAGE_${langNum}_PERCENT`, 'g'), lang.percentage);

    const colorRegex = new RegExp('#D2712C', 'i');
    svg = svg.replace(colorRegex, lang.color);
    
    const barWidth = Math.round((parseFloat(lang.percentage) / 100) * 125);
    svg = svg.replace(
       new RegExp(`width="\\d+" height="9" rx="3" fill="#D2712C"`, 'i'),
       `width="${barWidth}" height="9" rx="3" fill="${lang.color}"`
    );
  });
  
  return svg;
}

async function main() {
  console.log('Fetching GitHub stats...');
  const stats = await getGitHubStats();
  
  console.log('Stats:', stats);
  console.log('Generating SVG...');
  
  const svg = generateSVG(stats);
  fs.writeFileSync('stats.svg', svg);
  
  console.log('SVG generated successfully!');
}

main().catch(console.error);