// Medium Audience Stats - Dashboard Renderer
// Runs in MAIN world, receives data via postMessage, renders Chart.js charts

(function () {
  "use strict";

  const TAG = "[Medium Audience Stats]";
  const CHART_COLORS = {
    green: "#1a8917",
    greenLight: "rgba(26, 137, 23, 0.15)",
    blue: "#1967d2",
    blueLight: "rgba(25, 103, 210, 0.15)",
    red: "#d32f2f",
    redLight: "rgba(211, 47, 47, 0.15)",
    orange: "#e65100",
    gray: "#888",
    gold: "#d4a017",
    goldLight: "rgba(212, 160, 23, 0.15)",
  };

  let activeCharts = [];
  let currentAudienceData = null;
  let currentStatsData = null;
  let activeTab = null;
  let audienceGranularity = "daily";

  // --- Utilities ---

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toLocaleString();
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  }

  function formatDateShort(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
  }

  function formatCurrency(amount) {
    if (amount === 0) return "$0.00";
    return "$" + amount.toFixed(2);
  }

  function pctChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  // --- Aggregation ---

  function bucketKey(dateVal, granularity) {
    const d = new Date(dateVal);
    if (granularity === "weekly") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return monday.toISOString().slice(0, 10);
    }
    // monthly
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function aggregateTimeseries(data, granularity, dateField) {
    if (granularity === "daily" || !data || data.length === 0) return data;

    const buckets = {};
    for (const entry of data) {
      const key = bucketKey(entry[dateField], granularity);
      buckets[key] = entry; // last value wins (for point-in-time totals)
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, entry]) => entry);
  }

  function aggregateViewsReads(data, granularity) {
    if (granularity === "daily" || !data || data.length === 0) return data;

    const buckets = {};
    for (const entry of data) {
      const key = bucketKey(entry.date, granularity);
      if (!buckets[key]) {
        buckets[key] = { date: entry.date, views: 0, reads: 0, earnings: 0 };
      }
      buckets[key].views += entry.views || 0;
      buckets[key].reads += entry.reads || 0;
      buckets[key].earnings += entry.earnings || 0;
    }

    return Object.values(buckets).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function timeUnitForData(granularity, length) {
    if (granularity === "monthly") return "month";
    if (granularity === "weekly") return "week";
    if (length > 180) return "month";
    if (length > 30) return "week";
    return "day";
  }

  // --- Tab Management ---

  function renderTabs(hasAudience, hasStats, activePage) {
    const tabs = [];
    if (hasAudience) tabs.push({ id: "audience", label: "Audience" });
    if (hasStats) tabs.push({ id: "earnings", label: "Earnings" });

    if (tabs.length <= 1) {
      activeTab = tabs.length === 1 ? tabs[0].id : null;
      return "";
    }

    if (!activeTab) {
      activeTab = activePage === "stats" && hasStats ? "earnings" : "audience";
    }

    const html = tabs
      .map(
        (t) =>
          `<button class="mas-tab ${activeTab === t.id ? "mas-tab-active" : ""}" data-tab="${t.id}">${t.label}</button>`
      )
      .join("");

    return `<div class="mas-tab-bar" id="mas-tab-bar">${html}</div>`;
  }

  function bindTabEvents() {
    const bar = document.getElementById("mas-tab-bar");
    if (!bar) return;

    bar.addEventListener("click", function (e) {
      const tab = e.target.closest(".mas-tab");
      if (!tab) return;
      const tabId = tab.dataset.tab;
      if (tabId === activeTab) return;

      activeTab = tabId;
      renderFullDashboard();
    });
  }

  // --- Date Range (Audience) ---

  function getDateOptions(timeseries) {
    return timeseries.map((entry) => ({
      value: entry.collectedAt,
      label: formatDate(entry.collectedAt),
    }));
  }

  function populateDateSelectors(timeseries) {
    const startSelect = document.getElementById("mas-start-date");
    const endSelect = document.getElementById("mas-end-date");
    if (!startSelect || !endSelect) return;

    const options = getDateOptions(timeseries);

    startSelect.innerHTML = "";
    endSelect.innerHTML = "";

    options.forEach((opt) => {
      startSelect.appendChild(new Option(opt.label, opt.value));
      endSelect.appendChild(new Option(opt.label, opt.value));
    });

    const defaultStart = Math.max(0, options.length - 12);
    startSelect.selectedIndex = defaultStart;
    endSelect.selectedIndex = options.length - 1;

    const onChange = () => {
      const startVal = parseInt(startSelect.value);
      const endVal = parseInt(endSelect.value);
      const filtered = timeseries.filter(
        (e) => e.collectedAt >= startVal && e.collectedAt <= endVal
      );
      renderAudienceTab(filtered, currentAudienceData.totals);
    };

    startSelect.addEventListener("change", onChange);
    endSelect.addEventListener("change", onChange);
  }

  function getFilteredAudienceData(timeseries) {
    const startSelect = document.getElementById("mas-start-date");
    const endSelect = document.getElementById("mas-end-date");
    if (!startSelect || !endSelect) return timeseries;

    const startVal = parseInt(startSelect.value);
    const endVal = parseInt(endSelect.value);
    return timeseries.filter(
      (e) => e.collectedAt >= startVal && e.collectedAt <= endVal
    );
  }

  // (Daily date range filtering removed — GraphQL returns lifetime totals only)

  // --- Audience Summary ---

  function computeAudienceSummary(data, totals) {
    if (data.length === 0) {
      return {
        currentFollowers: 0,
        currentSubscribers: 0,
        followerDelta: 0,
        subscriberDelta: 0,
        rangeFollowerGrowth: 0,
        rangeSubscriberGrowth: 0,
      };
    }

    const first = data[0];
    const last = data[data.length - 1];

    const rangeFollowerGrowth = last.followersTotal - first.followersTotal;
    const rangeSubscriberGrowth = last.subscribersTotal - first.subscribersTotal;

    // Use latest timeseries data point (matches graph) instead of totals
    const prevFollowers = data.length >= 2 ? data[data.length - 2].followersTotal : first.followersTotal;
    const prevSubscribers = data.length >= 2 ? data[data.length - 2].subscribersTotal : first.subscribersTotal;

    return {
      currentFollowers: last.followersTotal,
      currentSubscribers: last.subscribersTotal,
      followerDelta: last.followersTotal - prevFollowers,
      subscriberDelta: last.subscribersTotal - prevSubscribers,
      rangeFollowerGrowth,
      rangeSubscriberGrowth,
      rangeFollowerGrowthPct: pctChange(last.followersTotal, first.followersTotal),
      rangeSubscriberGrowthPct: pctChange(last.subscribersTotal, first.subscribersTotal),
    };
  }

  function renderAudienceSummaryCards(summary) {
    function deltaClass(val) {
      if (val > 0) return "mas-positive";
      if (val < 0) return "mas-negative";
      return "mas-neutral";
    }

    function deltaPrefix(val) {
      return val > 0 ? "+" : "";
    }

    return `
      <div class="mas-summary">
        <div class="mas-stat-card">
          <div class="mas-stat-label">Followers</div>
          <div class="mas-stat-value">${summary.currentFollowers.toLocaleString()}</div>
          <div class="mas-stat-delta ${deltaClass(summary.followerDelta)}">
            ${deltaPrefix(summary.followerDelta)}${summary.followerDelta.toLocaleString()} vs previous period
          </div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">Subscribers</div>
          <div class="mas-stat-value">${summary.currentSubscribers.toLocaleString()}</div>
          <div class="mas-stat-delta ${deltaClass(summary.subscriberDelta)}">
            ${deltaPrefix(summary.subscriberDelta)}${summary.subscriberDelta.toLocaleString()} vs previous period
          </div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">Range Growth (Followers)</div>
          <div class="mas-stat-value">${deltaPrefix(summary.rangeFollowerGrowth)}${summary.rangeFollowerGrowth.toLocaleString()}</div>
          <div class="mas-stat-delta ${deltaClass(summary.rangeFollowerGrowthPct)}">
            ${summary.rangeFollowerGrowthPct ? summary.rangeFollowerGrowthPct.toFixed(1) + "%" : "N/A"}
          </div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">Range Growth (Subscribers)</div>
          <div class="mas-stat-value">${deltaPrefix(summary.rangeSubscriberGrowth)}${summary.rangeSubscriberGrowth.toLocaleString()}</div>
          <div class="mas-stat-delta ${deltaClass(summary.rangeSubscriberGrowthPct)}">
            ${summary.rangeSubscriberGrowthPct ? summary.rangeSubscriberGrowthPct.toFixed(1) + "%" : "N/A"}
          </div>
        </div>
      </div>
    `;
  }

  // --- Earnings Summary ---

  function computeEarningsSummary(statsData) {
    const { articles, aggregates } = statsData;

    const rpm = aggregates.totalViews > 0
      ? (aggregates.totalEarnings / aggregates.totalViews) * 1000
      : 0;

    const avgPerArticle = articles.length > 0
      ? aggregates.totalEarnings / articles.length
      : 0;

    const readRatio = aggregates.totalViews > 0
      ? (aggregates.totalReads / aggregates.totalViews) * 100
      : 0;

    return {
      totalEarnings: aggregates.totalEarnings,
      totalViews: aggregates.totalViews,
      totalReads: aggregates.totalReads,
      articleCount: aggregates.articleCount,
      rpm,
      avgPerArticle,
      readRatio,
    };
  }

  function renderEarningsSummaryCards(summary) {
    return `
      <div class="mas-summary">
        <div class="mas-stat-card">
          <div class="mas-stat-label">Total Earnings</div>
          <div class="mas-stat-value">${formatCurrency(summary.totalEarnings)}</div>
          <div class="mas-stat-sub">${summary.articleCount} articles</div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">Total Views</div>
          <div class="mas-stat-value">${formatNumber(summary.totalViews)}</div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">Total Reads</div>
          <div class="mas-stat-value">${formatNumber(summary.totalReads)}</div>
          <div class="mas-stat-sub">${summary.readRatio.toFixed(1)}% read ratio</div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">RPM (Revenue/1K views)</div>
          <div class="mas-stat-value">${formatCurrency(summary.rpm)}</div>
        </div>
        <div class="mas-stat-card">
          <div class="mas-stat-label">Avg per Article</div>
          <div class="mas-stat-value">${formatCurrency(summary.avgPerArticle)}</div>
        </div>
      </div>
    `;
  }

  // --- Charts ---

  function destroyCharts() {
    activeCharts.forEach((c) => c.destroy());
    activeCharts = [];
  }

  function createTimeLabels(data) {
    return data.map((e) => new Date(e.collectedAt));
  }

  function commonTimeScaleOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 12 } },
        tooltip: {
          backgroundColor: "#1a1a1a",
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 6,
        },
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "month", displayFormats: { month: "MMM yyyy" } },
          grid: { display: false },
          ticks: { font: { size: 11 }, maxRotation: 45 },
        },
        y: {
          grid: { color: "rgba(0,0,0,0.06)" },
          ticks: {
            font: { size: 11 },
            callback: function (value) {
              return formatNumber(value);
            },
          },
        },
      },
    };
  }

  // --- Audience Charts ---

  function chartViewsAndReads(canvas, dailyData, granularity) {
    const aggregated = aggregateViewsReads(dailyData, granularity);
    const labels = aggregated.map((d) => new Date(d.date));
    const unit = timeUnitForData(granularity, aggregated.length);

    const opts = commonTimeScaleOptions();
    opts.scales.x.time.unit = unit;
    opts.scales.x.time.displayFormats = { day: "MMM d", week: "MMM d", month: "MMM yyyy" };
    opts.scales.y.position = "left";
    opts.scales.y.title = { display: true, text: "Views", font: { size: 11 }, color: CHART_COLORS.green };
    opts.scales.y.ticks.color = CHART_COLORS.green;
    opts.scales.y1 = {
      position: "right",
      title: { display: true, text: "Reads", font: { size: 11 }, color: CHART_COLORS.blue },
      grid: { drawOnChartArea: false },
      ticks: { font: { size: 11 }, color: CHART_COLORS.blue, callback: (v) => formatNumber(v) },
    };

    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Views",
            data: aggregated.map((d) => d.views),
            borderColor: CHART_COLORS.green,
            backgroundColor: CHART_COLORS.greenLight,
            fill: true,
            tension: 0.3,
            pointRadius: aggregated.length > 90 ? 0 : 2,
            pointHoverRadius: 4,
            yAxisID: "y",
          },
          {
            label: "Reads",
            data: aggregated.map((d) => d.reads),
            borderColor: CHART_COLORS.blue,
            backgroundColor: "transparent",
            tension: 0.3,
            pointRadius: aggregated.length > 90 ? 0 : 2,
            pointHoverRadius: 4,
            yAxisID: "y1",
          },
        ],
      },
      options: opts,
    });
  }

  function chartFollowersAndSubscribers(canvas, data, granularity) {
    const aggregated = aggregateTimeseries(data, granularity, "collectedAt");
    const labels = aggregated.map((e) => new Date(e.collectedAt));
    const unit = timeUnitForData(granularity, aggregated.length);

    const opts = commonTimeScaleOptions();
    opts.scales.x.time.unit = unit;
    opts.scales.x.time.displayFormats = { day: "MMM d", week: "MMM d", month: "MMM yyyy" };
    opts.scales.y.position = "left";
    opts.scales.y.title = { display: true, text: "Followers", font: { size: 11 }, color: CHART_COLORS.green };
    opts.scales.y.ticks.color = CHART_COLORS.green;
    opts.scales.y1 = {
      position: "right",
      title: { display: true, text: "Subscribers", font: { size: 11 }, color: CHART_COLORS.blue },
      grid: { drawOnChartArea: false },
      ticks: { font: { size: 11 }, color: CHART_COLORS.blue, callback: (v) => formatNumber(v) },
    };

    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Followers",
            data: aggregated.map((e) => e.followersTotal),
            borderColor: CHART_COLORS.green,
            backgroundColor: CHART_COLORS.greenLight,
            fill: true,
            tension: 0.3,
            pointRadius: aggregated.length > 90 ? 0 : 2,
            pointHoverRadius: 4,
            yAxisID: "y",
          },
          {
            label: "Subscribers",
            data: aggregated.map((e) => e.subscribersTotal),
            borderColor: CHART_COLORS.blue,
            backgroundColor: CHART_COLORS.blueLight,
            fill: true,
            tension: 0.3,
            pointRadius: aggregated.length > 90 ? 0 : 2,
            pointHoverRadius: 4,
            yAxisID: "y1",
          },
        ],
      },
      options: opts,
    });
  }

  // --- Earnings Charts ---

  function chartEarningsVsViews(canvas, articles) {
    const filtered = articles.filter((a) => a.totalViews > 0);
    const data = filtered.map((a) => ({
      x: a.totalViews,
      y: a.totalEarnings,
      title: a.title,
    }));

    return new Chart(canvas, {
      type: "scatter",
      data: {
        datasets: [{
          label: "Articles",
          data,
          backgroundColor: CHART_COLORS.gold,
          pointRadius: 5,
          pointHoverRadius: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pt = ctx.raw;
                const title = pt.title ? pt.title.slice(0, 40) : "";
                return [title, "Views: " + formatNumber(pt.x), "Earnings: " + formatCurrency(pt.y)];
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Views", font: { size: 11 } },
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: { font: { size: 11 }, callback: (v) => formatNumber(v) },
          },
          y: {
            title: { display: true, text: "Earnings", font: { size: 11 } },
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: { font: { size: 11 }, callback: (v) => formatCurrency(v) },
          },
        },
      },
    });
  }

  // --- Sortable Article Table ---

  let articleSortField = "firstPublishedAt";
  let articleSortAsc = false;

  function renderArticleTable(articles) {
    const sorted = [...articles].sort((a, b) => {
      if (articleSortField === "title") {
        const cmp = (a.title || "").localeCompare(b.title || "");
        return articleSortAsc ? cmp : -cmp;
      }
      if (articleSortField === "isBoosted") {
        const aVal = a.isBoosted ? 1 : 0;
        const bVal = b.isBoosted ? 1 : 0;
        return articleSortAsc ? aVal - bVal : bVal - aVal;
      }
      const aVal = a[articleSortField] || 0;
      const bVal = b[articleSortField] || 0;
      return articleSortAsc ? aVal - bVal : bVal - aVal;
    });

    function sortIndicator(field) {
      if (articleSortField !== field) return "";
      return articleSortAsc ? " &#9650;" : " &#9660;";
    }

    const rows = sorted.map((a) => {
      const rpm = a.totalViews > 0 ? (a.totalEarnings / a.totalViews) * 1000 : 0;
      const readRatio = a.totalViews > 0 ? ((a.totalReads / a.totalViews) * 100).toFixed(1) : "0.0";
      const title = a.title.length > 60 ? a.title.slice(0, 57) + "..." : a.title;

      const pubDate = a.firstPublishedAt ? formatDateShort(a.firstPublishedAt) : "";

      return `<tr>
        <td class="mas-table-num">${pubDate}</td>
        <td class="mas-table-title" title="${a.title.replace(/"/g, '&quot;')}">${title}</td>
        <td class="mas-table-num">${formatNumber(a.totalPresentations || 0)}</td>
        <td class="mas-table-num">${formatNumber(a.totalViews)}</td>
        <td class="mas-table-num">${formatNumber(a.totalReads)}</td>
        <td class="mas-table-num">${readRatio}%</td>
        <td class="mas-table-num">${formatCurrency(a.totalEarnings)}</td>
        <td class="mas-table-num">${formatCurrency(rpm)}</td>
        <td class="mas-table-num">${a.isBoosted ? "Yes" : ""}</td>
      </tr>`;
    }).join("");

    return `
      <div class="mas-chart-section">
        <div class="mas-chart-title">All Articles</div>
        <div class="mas-table-wrapper">
          <table class="mas-article-table" id="mas-article-table">
            <thead>
              <tr>
                <th data-sort="firstPublishedAt">Published${sortIndicator("firstPublishedAt")}</th>
                <th data-sort="title">Title${sortIndicator("title")}</th>
                <th data-sort="totalPresentations">Presented${sortIndicator("totalPresentations")}</th>
                <th data-sort="totalViews">Views${sortIndicator("totalViews")}</th>
                <th data-sort="totalReads">Reads${sortIndicator("totalReads")}</th>
                <th data-sort="readRatio">Read %${sortIndicator("readRatio")}</th>
                <th data-sort="totalEarnings">Earnings${sortIndicator("totalEarnings")}</th>
                <th data-sort="rpm">RPM${sortIndicator("rpm")}</th>
                <th data-sort="isBoosted">Boosted${sortIndicator("isBoosted")}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function bindArticleTableSort() {
    const table = document.getElementById("mas-article-table");
    if (!table) return;

    table.querySelector("thead").addEventListener("click", function (e) {
      const th = e.target.closest("th");
      if (!th || !th.dataset.sort) return;

      const field = th.dataset.sort;
      if (field === articleSortField) {
        articleSortAsc = !articleSortAsc;
      } else {
        articleSortField = field;
        articleSortAsc = field === "title"; // title sorts A-Z by default, numbers desc
      }

      renderEarningsContent();
    });
  }

  // --- Render: Audience Tab ---

  function renderAudienceTab(data, totals) {
    const container = document.getElementById("mas-tab-content");
    if (!container) return;

    destroyCharts();

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="mas-error">No audience data available for the selected range.</div>';
      return;
    }

    const summary = computeAudienceSummary(data, totals);

    const hasViewsReads = !!(currentStatsData && currentStatsData.dailyTotals && currentStatsData.dailyTotals.length > 0);

    // Granularity selector only shown when we have daily views/reads data
    const granularityHtml = hasViewsReads ? (() => {
      const granularities = ["daily", "weekly", "monthly"];
      const buttons = granularities
        .map(
          (g) =>
            `<button class="mas-date-range-btn ${audienceGranularity === g ? "mas-date-range-btn-active" : ""}" data-granularity="${g}">${g.charAt(0).toUpperCase() + g.slice(1)}</button>`
        )
        .join("");
      return `<div class="mas-date-range-group" id="mas-audience-granularity">${buttons}</div>`;
    })() : "";

    container.innerHTML = `
      ${renderAudienceSummaryCards(summary)}
      ${hasViewsReads ? `
      ${granularityHtml}
      <div class="mas-chart-section">
        <div class="mas-chart-title">Views & Reads</div>
        <div class="mas-chart-container"><canvas id="mas-chart-views-reads"></canvas></div>
      </div>
      ` : ""}
      <div class="mas-chart-section">
        <div class="mas-chart-title">Followers & Subscribers (Monthly)</div>
        <div class="mas-chart-container"><canvas id="mas-chart-followers-subscribers"></canvas></div>
      </div>
    `;

    if (hasViewsReads) {
      activeCharts.push(chartViewsAndReads(
        document.getElementById("mas-chart-views-reads"),
        currentStatsData.dailyTotals,
        audienceGranularity
      ));
    }

    // Followers/subscribers is always monthly — no aggregation needed
    activeCharts.push(chartFollowersAndSubscribers(
      document.getElementById("mas-chart-followers-subscribers"),
      data,
      "monthly"
    ));

    const granularityGroup = document.getElementById("mas-audience-granularity");
    if (granularityGroup) {
      granularityGroup.addEventListener("click", function (e) {
        const btn = e.target.closest(".mas-date-range-btn");
        if (!btn) return;
        audienceGranularity = btn.dataset.granularity;
        renderAudienceTab(data, totals);
      });
    }
  }

  // --- Earnings Date Filter ---

  function getEarningsMonthOptions(articles) {
    const months = {};
    for (const a of articles) {
      if (!a.firstPublishedAt) continue;
      const d = new Date(a.firstPublishedAt);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      if (!months[key]) {
        // First day of that month as timestamp
        months[key] = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      }
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, ts]) => ({ value: ts, label: formatDate(ts) }));
  }

  function getFilteredEarningsArticles() {
    if (!currentStatsData) return [];
    const articles = currentStatsData.articles;

    const startSelect = document.getElementById("mas-earnings-start");
    const endSelect = document.getElementById("mas-earnings-end");
    if (!startSelect || !endSelect) return articles;

    const startVal = parseInt(startSelect.value);
    const endVal = parseInt(endSelect.value);

    // End of the selected month
    const endDate = new Date(endVal);
    const endOfMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    return articles.filter(
      (a) => a.firstPublishedAt && a.firstPublishedAt >= startVal && a.firstPublishedAt <= endOfMonth
    );
  }

  function renderEarningsDateFilter() {
    if (!currentStatsData) return "";
    const options = getEarningsMonthOptions(currentStatsData.articles);
    if (options.length === 0) return "";

    const startOpts = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
    const endOpts = startOpts;

    return `
      <div class="mas-earnings-date-filter">
        <label>From</label>
        <select id="mas-earnings-start">${startOpts}</select>
        <label>To</label>
        <select id="mas-earnings-end">${endOpts}</select>
      </div>
    `;
  }

  function bindEarningsDateFilter() {
    const startSelect = document.getElementById("mas-earnings-start");
    const endSelect = document.getElementById("mas-earnings-end");
    if (!startSelect || !endSelect) return;

    // Default: all time
    startSelect.selectedIndex = 0;
    endSelect.selectedIndex = endSelect.options.length - 1;

    const onChange = () => renderEarningsWithFilter();
    startSelect.addEventListener("change", onChange);
    endSelect.addEventListener("change", onChange);
  }

  function renderEarningsWithFilter() {
    const container = document.getElementById("mas-earnings-body");
    if (!container || !currentStatsData) return;

    destroyCharts();

    const filtered = getFilteredEarningsArticles();
    const filteredData = {
      articles: filtered,
      aggregates: {
        totalEarnings: filtered.reduce((s, a) => s + a.totalEarnings, 0),
        totalViews: filtered.reduce((s, a) => s + a.totalViews, 0),
        totalReads: filtered.reduce((s, a) => s + a.totalReads, 0),
        articleCount: filtered.length,
      },
    };

    const summary = computeEarningsSummary(filteredData);
    const articlesWithRpm = filtered.map((a) => ({
      ...a,
      rpm: a.totalViews > 0 ? (a.totalEarnings / a.totalViews) * 1000 : 0,
      readRatio: a.totalViews > 0 ? (a.totalReads / a.totalViews) * 100 : 0,
    }));

    container.innerHTML = `
      ${renderEarningsSummaryCards(summary)}
      <div class="mas-chart-section">
        <div class="mas-chart-title">Earnings vs Views (per article)</div>
        <div class="mas-chart-container"><canvas id="mas-chart-scatter"></canvas></div>
      </div>
      ${renderArticleTable(articlesWithRpm)}
    `;

    activeCharts.push(chartEarningsVsViews(document.getElementById("mas-chart-scatter"), filtered));
    bindArticleTableSort();
  }

  // --- Render: Earnings Tab ---

  function renderEarningsContent() {
    const container = document.getElementById("mas-tab-content");
    if (!container || !currentStatsData) return;

    destroyCharts();

    container.innerHTML = `
      ${renderEarningsDateFilter()}
      <div id="mas-earnings-body"></div>
    `;

    bindEarningsDateFilter();
    renderEarningsWithFilter();
  }

  // --- Full Dashboard Render ---

  function renderFullDashboard() {
    const content = document.getElementById("mas-content");
    if (!content) {
      console.warn(TAG, "renderFullDashboard: #mas-content not found, overlay not open yet");
      return;
    }

    destroyCharts();

    // Use looser checks: data object exists with expected shape (don't require non-empty arrays)
    const hasAudience = !!(currentAudienceData && currentAudienceData.timeseries);
    const hasStats = !!(currentStatsData && currentStatsData.articles);

    if (!hasAudience && !hasStats) {
      content.innerHTML = '<div class="mas-loading">Loading data...</div>';
      return;
    }

    // Show/hide audience date controls based on active tab
    const audienceDateControls = document.getElementById("mas-audience-date-controls");
    if (audienceDateControls) {
      audienceDateControls.style.display = (activeTab === "audience" || (!activeTab && hasAudience && !hasStats)) ? "flex" : "none";
    }

    // If only one data source, skip tabs
    if (hasAudience && !hasStats) {
      activeTab = "audience";
    } else if (hasStats && !hasAudience) {
      activeTab = "earnings";
    }

    const activePage = hasStats ? "stats" : "audience";
    const tabsHtml = renderTabs(hasAudience, hasStats, activePage);

    content.innerHTML = `
      ${tabsHtml}
      <div id="mas-tab-content"></div>
    `;

    bindTabEvents();

    if (activeTab === "earnings" && hasStats) {
      renderEarningsContent();
    } else if (hasAudience) {
      populateDateSelectors(currentAudienceData.timeseries);
      const filtered = getFilteredAudienceData(currentAudienceData.timeseries);
      renderAudienceTab(filtered, currentAudienceData.totals);

      // Update date controls visibility after tab is determined
      if (audienceDateControls) {
        audienceDateControls.style.display = "flex";
      }
    }

    console.log(TAG, "Dashboard rendered, active tab:", activeTab, "audience:", hasAudience, "stats:", hasStats);
  }

  // --- Message Listener ---

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (!event.data || !event.data.type) return;

    switch (event.data.type) {
      case "MAS_AUDIENCE_DATA":
        console.log(TAG, "Dashboard received MAS_AUDIENCE_DATA");
        currentAudienceData = event.data.data;
        renderFullDashboard();
        break;

      case "MAS_STATS_DATA":
        console.log(TAG, "Dashboard received MAS_STATS_DATA");
        currentStatsData = event.data.data;
        renderFullDashboard();
        break;

      case "MAS_RENDER_DASHBOARD":
        console.log(TAG, "Dashboard received MAS_RENDER_DASHBOARD, activePage:", event.data.activePage);
        if (event.data.audienceData) {
          currentAudienceData = event.data.audienceData;
        }
        if (event.data.statsData) {
          currentStatsData = event.data.statsData;
        }
        if (event.data.activePage === "stats" && currentStatsData) {
          activeTab = "earnings";
        } else if (event.data.activePage === "audience" && currentAudienceData) {
          activeTab = "audience";
        }
        renderFullDashboard();
        break;
    }
  });

  console.log(TAG, "Dashboard script loaded");
})();
