// Medium Audience Stats - Service Worker
// Badge updates when audience or earnings data is available

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "MAS_DATA_READY" || !sender.tab) return;

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
});

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
