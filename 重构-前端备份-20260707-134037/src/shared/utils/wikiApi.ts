import { getWensetConfig } from '@/shared/config/wenset';

export interface WikiResult {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
}

const OFFICIAL_NEWS_FEEDS = [
  {
    name: 'Minecraft.net',
    url: 'https://www.minecraft.net/en-us/feed'
  },
  {
    name: 'Minecraft Java',
    url: 'https://www.minecraft.net/en-us/feeds/java-news-feed'
  },
  {
    name: 'Minecraft Bedrock',
    url: 'https://www.minecraft.net/en-us/feeds/bedrock-news-feed'
  }
];

const buildWikiArticleUrl = (apiBase: string, title: string): string => {
  const normalizedBase = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  return `${normalizedBase}w/${encodeURIComponent(title.replace(/ /g, '_'))}`;
};

const uniqueByTitle = (items: WikiResult[]): WikiResult[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.title.trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const parseRssXml = (xmlText: string, sourceName: string, limit: number): WikiResult[] => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) return [];

    const items = Array.from(doc.querySelectorAll('item')).slice(0, limit);

    return items
      .map((item) => {
        const title = item.querySelector('title')?.textContent?.trim() ?? '';
        const url = item.querySelector('link')?.textContent?.trim() ?? '';
        const publishedAt = item.querySelector('pubDate')?.textContent?.trim() ?? '';

        if (!title || !url) return null;

        return {
          title,
          url,
          source: sourceName,
          publishedAt
        } as WikiResult;
      })
      .filter((entry): entry is WikiResult => entry !== null);
  } catch {
    return [];
  }
};

const fetchFeedViaAllOrigins = async (feedUrl: string, sourceName: string, limit: number): Promise<WikiResult[]> => {
  const endpoint = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) return [];

  const xmlText = await response.text();
  return parseRssXml(xmlText, sourceName, limit);
};

const fetchFeedViaRss2Json = async (feedUrl: string, sourceName: string, limit: number): Promise<WikiResult[]> => {
  const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=${limit}`;
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) return [];

  const data = await response.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return items
    .slice(0, limit)
    .map((item: { title?: string; link?: string; pubDate?: string }) => {
      const title = item?.title?.trim() ?? '';
      const url = item?.link?.trim() ?? '';
      const publishedAt = item?.pubDate?.trim() ?? '';

      if (!title || !url) return null;

      return {
        title,
        url,
        source: sourceName,
        publishedAt
      } as WikiResult;
    })
    .filter((entry): entry is WikiResult => entry !== null);
};

const fetchMinecraftNews = async (limit: number): Promise<WikiResult[]> => {
  const perFeedLimit = Math.max(4, Math.ceil(limit / OFFICIAL_NEWS_FEEDS.length) + 2);

  const results = await Promise.all(
    OFFICIAL_NEWS_FEEDS.map(async (feed) => {
      const fromAllOrigins = await fetchFeedViaAllOrigins(feed.url, feed.name, perFeedLimit);
      if (fromAllOrigins.length > 0) return fromAllOrigins;
      return fetchFeedViaRss2Json(feed.url, feed.name, perFeedLimit);
    })
  );

  return uniqueByTitle(results.flat());
};

export const fetchWikiHotTopics = async (limit: number = 8): Promise<WikiResult[]> => {
  const config = getWensetConfig();

  try {
    const news = await fetchMinecraftNews(limit);
    if (news.length >= limit) {
      return news.slice(0, limit);
    }

    const fallback: WikiResult[] = [
      { title: 'Minecraft Official News', url: 'https://www.minecraft.net/en-us/articles', source: 'Minecraft.net' },
      { title: 'Java Edition News', url: 'https://www.minecraft.net/en-us/feeds/java-news-feed', source: 'Minecraft Java' },
      { title: 'Bedrock Edition News', url: 'https://www.minecraft.net/en-us/feeds/bedrock-news-feed', source: 'Minecraft Bedrock' },
      { title: 'Minecraft Community Hub', url: 'https://www.minecraft.net/en-us/community', source: 'Minecraft.net' },
      { title: 'StarMC Wiki', url: buildWikiArticleUrl(config.urls.wikiApiBase, '首页'), source: 'StarMC Wiki' }
    ];

    return uniqueByTitle([...news, ...fallback]).slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch Minecraft news:', error);

    return [
      { title: 'Minecraft Official News', url: 'https://www.minecraft.net/en-us/articles', source: 'Minecraft.net' },
      { title: 'Java Edition News', url: 'https://www.minecraft.net/en-us/feeds/java-news-feed', source: 'Minecraft Java' },
      { title: 'Bedrock Edition News', url: 'https://www.minecraft.net/en-us/feeds/bedrock-news-feed', source: 'Minecraft Bedrock' },
      { title: 'Minecraft Community Hub', url: 'https://www.minecraft.net/en-us/community', source: 'Minecraft.net' },
      { title: 'StarMC Wiki', url: buildWikiArticleUrl(config.urls.wikiApiBase, '首页'), source: 'StarMC Wiki' }
    ].slice(0, limit);
  }
};
