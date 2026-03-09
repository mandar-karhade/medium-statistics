// Medium Audience Stats - Apollo Cache Extractor + GraphQL Fetcher
// Runs in MAIN world to access window.__APOLLO_CLIENT__ and make authenticated fetches

(function () {
  "use strict";

  const TAG = "[Medium Audience Stats]";
  const MAX_ATTEMPTS = 10;
  const POLL_INTERVAL = 500;

  // --- Page Detection ---

  function getCurrentPage() {
    const path = window.location.pathname;
    if (path.startsWith("/me/stats")) return "stats";
    if (path.startsWith("/me/partner/dashboard")) return "stats";
    if (path.startsWith("/me/audience")) return "audience";
    return null;
  }

  // --- Cache Discovery (Debug) ---

  function discoverStatsCache(cache) {
    const prefixes = {};
    const typeNames = {};

    for (const [key, value] of Object.entries(cache)) {
      const prefix = key.split(":")[0];
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;

      if (value && typeof value === "object" && value.__typename) {
        typeNames[value.__typename] = (typeNames[value.__typename] || 0) + 1;
      }
    }

    const rootQueryKeys = cache.ROOT_QUERY
      ? Object.keys(cache.ROOT_QUERY).filter(
          (k) => /stat|earn|revenue|partner|post/i.test(k)
        )
      : [];

    console.log(TAG, "Apollo cache key prefixes:", JSON.stringify(prefixes));
    console.log(TAG, "Apollo cache __typename counts:", JSON.stringify(typeNames));
    if (rootQueryKeys.length > 0) {
      console.log(TAG, "ROOT_QUERY stats-related keys:", rootQueryKeys);
    }
    console.log(TAG, "Total cache keys:", Object.keys(cache).length);

    return { prefixes, typeNames, rootQueryStatsKeys: rootQueryKeys, totalKeys: Object.keys(cache).length };
  }

  // --- Ref Resolution ---

  function resolveDeep(cache, obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map((item) => resolveDeep(cache, item));
    if (typeof obj !== "object") return obj;

    if (obj.__ref) {
      const resolved = cache[obj.__ref];
      if (!resolved) return obj;
      return resolveDeep(cache, resolved);
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "__typename") continue;
      result[key] = resolveDeep(cache, value);
    }
    return result;
  }

  // --- Audience Stats Extraction ---

  function extractAudienceStats(cache) {
    const viewerEdgeKey = Object.keys(cache).find(
      (key) =>
        key.startsWith("UserViewerEdge:") && key.includes("audienceStats")
    );

    if (!viewerEdgeKey) {
      for (const [key, value] of Object.entries(cache)) {
        if (!key.startsWith("UserViewerEdge:")) continue;
        if (!value || typeof value !== "object") continue;

        const statsKey = Object.keys(value).find(
          (k) => k === "audienceStats" || k.startsWith("audienceStats(")
        );
        if (statsKey) {
          console.log(TAG, "Found audienceStats in", key, "via key", statsKey);
          const raw = resolveDeep(cache, value[statsKey]);
          return parseAudienceStats(raw);
        }
      }

      console.log(TAG, "No UserViewerEdge with audienceStats found (expected on non-audience pages)");
      return null;
    }

    const entry = cache[viewerEdgeKey];
    const statsKey = Object.keys(entry).find(
      (k) => k === "audienceStats" || k.startsWith("audienceStats(")
    );
    if (!statsKey) {
      console.error(TAG, "audienceStats key not found in entry");
      return null;
    }

    console.log(TAG, "Found audienceStats via", viewerEdgeKey);
    const raw = resolveDeep(cache, entry[statsKey]);
    return parseAudienceStats(raw);
  }

  function parseAudienceStats(raw) {
    if (!raw) return null;

    let timeseries = null;
    if (raw.timeseries) {
      timeseries = raw.timeseries;
    } else {
      const tsKey = Object.keys(raw).find(
        (k) => k === "timeseries" || k.startsWith("timeseries(")
      );
      if (tsKey) timeseries = raw[tsKey];
    }

    if (!timeseries || !Array.isArray(timeseries)) {
      console.error(TAG, "No timeseries array found in audienceStats");
      return null;
    }

    const totals = {
      followers: raw.currentFollowerCount || 0,
      subscribers: raw.currentSubscriberCount || 0,
      followersPreviousMonth: raw.followerCountPreviousMonth || 0,
      subscribersPreviousMonth: raw.subscriberCountPreviousMonth || 0,
    };

    const normalizedTimeseries = timeseries
      .map((entry) => ({
        collectedAt: entry.collectedAt || entry.periodStartedAt || null,
        followersNet:
          entry.monthlyFollowerNetChange ?? entry.followersNet ?? 0,
        followersTotal: entry.followersCount ?? entry.followersTotal ?? 0,
        subscribersNet:
          entry.monthlySubscriberNetChange ?? entry.subscribersNet ?? 0,
        subscribersTotal:
          entry.subscribersCount ?? entry.subscribersTotal ?? 0,
      }))
      .filter((e) => e.collectedAt)
      .sort((a, b) => a.collectedAt - b.collectedAt);

    console.log(
      TAG,
      `Extracted ${normalizedTimeseries.length} data points, ` +
        `${totals.followers} followers, ${totals.subscribers} subscribers`
    );

    return { totals, timeseries: normalizedTimeseries };
  }

  // --- Earnings Helpers ---

  function parseEarnings(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;

    if (typeof value === "object") {
      // Medium wraps earnings as { total: { units, nanos, currencyCode } }
      if ("total" in value && typeof value.total === "object") {
        return parseEarnings(value.total);
      }
      // Google Money: { units, nanos, currencyCode }
      if ("units" in value || "nanos" in value) {
        const units = parseInt(value.units || "0", 10);
        const nanos = parseInt(value.nanos || "0", 10);
        return units + nanos / 1e9;
      }
      if ("amount" in value) return parseFloat(value.amount) || 0;
      if ("cents" in value) return (parseFloat(value.cents) || 0) / 100;
    }

    if (typeof value === "string") {
      return parseFloat(value.replace(/[^0-9.\-]/g, "")) || 0;
    }

    return 0;
  }

  // --- GraphQL-based Stats Fetching ---

  const STATS_QUERY = `query UserLifetimeStoryStatsPostsQuery($username: ID!, $first: Int!, $after: String!, $orderBy: UserPostsOrderBy, $filter: UserPostsFilter) {
    user(username: $username) {
      id
      postsConnection(first: $first, after: $after, orderBy: $orderBy, filter: $filter) {
        edges {
          node {
            id
            title
            firstPublishedAt
            totalStats { views reads presentations }
            earnings { total { currencyCode nanos units } }
            firstBoostedAt
          }
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  }`;

  function getUsernameFromCache(cache) {
    const rootQuery = cache.ROOT_QUERY;
    if (!rootQuery) return null;

    for (const key of Object.keys(rootQuery)) {
      const match = key.match(/user\(\{"username":"([^"]+)"\}\)/);
      if (match) return match[1];
    }

    // Fallback: resolve viewer -> User object -> username
    const viewerRef = rootQuery.viewer;
    if (viewerRef && viewerRef.__ref) {
      const user = cache[viewerRef.__ref];
      if (user && user.username) return user.username;
    }

    return null;
  }

  async function fetchStatsViaGraphQL(username) {
    console.log(TAG, `Fetching all articles via GraphQL for: ${username}`);

    const articles = [];
    let cursor = "";
    let hasNextPage = true;
    let pageNum = 0;

    while (hasNextPage) {
      pageNum++;
      console.log(TAG, `GraphQL page ${pageNum}, cursor: ${cursor ? "..." + cursor.slice(-20) : "(start)"}`);

      const response = await fetch("https://medium.com/_/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{
          operationName: "UserLifetimeStoryStatsPostsQuery",
          variables: {
            username,
            first: 500,
            after: cursor,
            orderBy: { publishedAt: "DESC" },
            filter: { published: true },
          },
          query: STATS_QUERY,
        }]),
      });

      if (!response.ok) {
        console.error(TAG, `GraphQL failed: HTTP ${response.status}`);
        break;
      }

      const json = await response.json();
      const data = json[0]?.data;
      if (!data?.user?.postsConnection) {
        console.error(TAG, "Unexpected GraphQL response:", JSON.stringify(json[0]?.errors || json[0]).slice(0, 300));
        break;
      }

      const edges = data.user.postsConnection.edges || [];
      const pageInfo = data.user.postsConnection.pageInfo;

      for (const edge of edges) {
        const node = edge.node;
        if (!node) continue;

        const stats = node.totalStats || {};
        const earnings = parseEarnings(node.earnings);

        articles.push({
          postId: node.id,
          title: node.title || node.id,
          firstPublishedAt: node.firstPublishedAt,
          totalViews: stats.views || 0,
          totalReads: stats.reads || 0,
          totalPresentations: stats.presentations || 0,
          totalClaps: 0,
          totalEarnings: earnings,
          isBoosted: node.firstBoostedAt !== null,
          dailyStats: [],
        });
      }

      console.log(TAG, `Page ${pageNum}: got ${edges.length} articles (total so far: ${articles.length})`);

      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = pageInfo?.endCursor || "";

      if (!cursor) break;

      // Delay between pages to avoid 429
      if (hasNextPage) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (articles.length === 0) {
      console.warn(TAG, "GraphQL returned 0 articles");
      return null;
    }

    const totalViews = articles.reduce((s, a) => s + a.totalViews, 0);
    const totalReads = articles.reduce((s, a) => s + a.totalReads, 0);
    const totalEarnings = articles.reduce((s, a) => s + a.totalEarnings, 0);

    console.log(
      TAG,
      `GraphQL complete: ${articles.length} articles, $${totalEarnings.toFixed(2)} total, ` +
        `${totalViews} views, ${totalReads} reads`
    );

    return {
      articles: articles.sort((a, b) => b.totalEarnings - a.totalEarnings),
      aggregates: {
        totalEarnings,
        totalViews,
        totalReads,
        articleCount: articles.length,
        dateRange: null,
      },
      dailyTotals: [],
    };
  }

  // --- Main Extraction ---

  async function tryExtract(attempt) {
    if (attempt >= MAX_ATTEMPTS) {
      console.error(TAG, "Apollo client not found after", MAX_ATTEMPTS, "attempts");
      window.postMessage(
        {
          type: "MAS_EXTRACTION_ERROR",
          error: "Apollo client not found. Make sure you are on a Medium stats or audience page and data has loaded.",
        },
        window.location.origin
      );
      return;
    }

    const client = window.__APOLLO_CLIENT__;
    if (!client || !client.cache) {
      console.log(TAG, `Attempt ${attempt + 1}/${MAX_ATTEMPTS}: Apollo client not ready`);
      setTimeout(() => tryExtract(attempt + 1), POLL_INTERVAL);
      return;
    }

    console.log(TAG, "Apollo client found, extracting...");
    const cache = client.cache.extract();

    if (!cache || Object.keys(cache).length === 0) {
      console.log(TAG, "Cache is empty, retrying...");
      setTimeout(() => tryExtract(attempt + 1), POLL_INTERVAL);
      return;
    }

    const page = getCurrentPage();
    console.log(TAG, "Detected page:", page);

    const cacheDebug = discoverStatsCache(cache);

    let foundAny = false;

    // Audience data from cache (works on /me/audience)
    const audienceStats = extractAudienceStats(cache);
    if (audienceStats) {
      foundAny = true;
      console.log(TAG, "Audience data extracted from cache");
      window.postMessage(
        { type: "MAS_AUDIENCE_DATA", data: audienceStats },
        window.location.origin
      );
    }

    // Stats/earnings via GraphQL (works on any page with auth)
    const username = getUsernameFromCache(cache);
    if (username) {
      try {
        const stats = await fetchStatsViaGraphQL(username);
        if (stats) {
          foundAny = true;
          window.postMessage(
            { type: "MAS_STATS_DATA", data: stats },
            window.location.origin
          );
        }
      } catch (err) {
        console.error(TAG, "GraphQL fetch failed:", err.message);
      }
    } else {
      console.warn(TAG, "Could not determine username from cache — skipping GraphQL stats fetch");
    }

    if (!foundAny) {
      window.postMessage(
        {
          type: "MAS_EXTRACTION_ERROR",
          error: "Could not extract data. Username: " + (username || "unknown") + ". Check console for details.",
          cacheDebug,
        },
        window.location.origin
      );
    }
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === "MAS_REQUEST_DATA") {
      console.log(TAG, "Data extraction requested");
      tryExtract(0);
    }
  });

  tryExtract(0);
})();
