// Medium Audience Stats - Service Worker
// Badge updates, GraphQL proxy for publication discovery, icon click handler

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Badge updates from content script
  if (message.type === "MAS_DATA_READY" && sender.tab) {
    const tabId = sender.tab.id;

    if (message.page === "stats") {
      const earnings = message.totalEarnings || 0;
      const text = earnings >= 1000
        ? "$" + Math.round(earnings / 1000) + "K"
        : earnings >= 1
          ? "$" + Math.round(earnings)
          : String(message.articleCount || 0);

      chrome.action.setBadgeText({ text, tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#d4a017", tabId });
    } else {
      const count = message.followerCount || 0;
      const text = count >= 1000 ? Math.round(count / 1000) + "K" : String(count);

      chrome.action.setBadgeText({ text, tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#1a8917", tabId });
    }
    return;
  }

  // GraphQL proxy for publications page
  if (message.type === "MPD_GRAPHQL") {
    proxyGraphQL(message.operations)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function proxyGraphQL(operations) {
  // Get Medium cookies explicitly (credentials: "include" may not work from service worker)
  const cookies = await chrome.cookies.getAll({ domain: ".medium.com" });
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  console.log("[MPD Proxy] Sending", operations.length, "operations, cookies:", cookies.length);

  const response = await fetch("https://medium.com/_/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieHeader,
    },
    body: JSON.stringify(operations),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[MPD Proxy] HTTP error:", response.status, text.slice(0, 200));
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log("[MPD Proxy] Response:", JSON.stringify(data).slice(0, 200));
  return data;
}

// Clear badge when navigating away from supported pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (
    changeInfo.url &&
    !changeInfo.url.includes("medium.com/me/audience") &&
    !changeInfo.url.includes("medium.com/me/stats") &&
    !changeInfo.url.includes("medium.com/me/partner/dashboard")
  ) {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

// Open publications page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("publications.html") });
});
