// Medium Audience Stats - Content Script (ISOLATED world)
// Orchestrates: DOM creation, script injection, data bridging

(function () {
  "use strict";

  const TAG = "[Medium Audience Stats]";
  let overlayOpen = false;
  let audienceData = null;
  let statsData = null;
  let dashboardReady = false;

  // --- Page Detection ---

  function getCurrentPage() {
    const path = window.location.pathname;
    if (path.startsWith("/me/stats")) return "stats";
    if (path.startsWith("/me/partner/dashboard")) return "stats";
    if (path.startsWith("/me/audience")) return "audience";
    return null;
  }

  // --- Session Storage (optional, best-effort) ---

  const hasSessionStorage = !!(
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.session
  );

  function saveToSession(key, data) {
    if (!hasSessionStorage) return;
    try {
      chrome.storage.session.set({ [key]: data }, () => {
        if (chrome.runtime.lastError) {
          console.warn(TAG, "Session save error:", chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      // Silently ignore -- session storage is optional
    }
  }

  function loadFromSession() {
    if (!hasSessionStorage) return;
    try {
      chrome.storage.session.get(["mas_audience", "mas_stats"], (result) => {
        if (chrome.runtime.lastError) {
          console.warn(TAG, "Session load error:", chrome.runtime.lastError.message);
          return;
        }
        if (result && result.mas_audience && !audienceData) {
          console.log(TAG, "Loaded cached audience data from session");
          audienceData = result.mas_audience;
        }
        if (result && result.mas_stats && !statsData) {
          console.log(TAG, "Loaded cached stats data from session");
          statsData = result.mas_stats;
        }
      });
    } catch (e) {
      // Silently ignore
    }
  }

  // --- DOM Creation ---

  function createToggleButton() {
    const page = getCurrentPage();
    const btn = document.createElement("button");
    btn.className = "mas-toggle-btn";
    btn.textContent = page === "stats" ? "Earnings Stats" : "Audience Stats";
    btn.addEventListener("click", toggleOverlay);
    document.body.appendChild(btn);
    return btn;
  }

  function createOverlay() {
    const backdrop = document.createElement("div");
    backdrop.className = "mas-backdrop";
    backdrop.addEventListener("click", closeOverlay);
    document.body.appendChild(backdrop);

    const overlay = document.createElement("div");
    overlay.className = "mas-overlay";
    overlay.id = "mas-overlay";

    const header = document.createElement("div");
    header.className = "mas-header";
    header.innerHTML = `
      <span class="mas-header-title">Medium Stats</span>
      <div class="mas-header-controls">
        <div class="mas-date-controls" id="mas-audience-date-controls">
          <label>From</label>
          <select id="mas-start-date"></select>
          <label>To</label>
          <select id="mas-end-date"></select>
        </div>
        <button class="mas-close-btn" id="mas-close-btn">&times;</button>
      </div>
    `;
    overlay.appendChild(header);

    const content = document.createElement("div");
    content.className = "mas-content";
    content.id = "mas-content";
    content.innerHTML = '<div class="mas-loading">Loading data...</div>';
    overlay.appendChild(content);

    document.body.appendChild(overlay);

    document.getElementById("mas-close-btn").addEventListener("click", closeOverlay);

    return { overlay, backdrop, content };
  }

  // --- Overlay Control ---

  let elements = null;

  function toggleOverlay() {
    if (overlayOpen) {
      closeOverlay();
    } else {
      openOverlay();
    }
  }

  function openOverlay() {
    if (!elements) {
      elements = createOverlay();
    }
    overlayOpen = true;
    elements.overlay.classList.add("mas-open");
    elements.backdrop.classList.add("mas-visible");
    document.body.style.overflow = "hidden";

    const page = getCurrentPage();
    const hasCurrentData = page === "stats" ? statsData : audienceData;

    if (!hasCurrentData) {
      window.postMessage({ type: "MAS_REQUEST_DATA" }, window.location.origin);
    } else if (dashboardReady) {
      renderCurrentData();
    }
    // If data exists but dashboard not ready yet, injectScripts() callback handles it
  }

  function closeOverlay() {
    if (!elements) return;
    overlayOpen = false;
    elements.overlay.classList.remove("mas-open");
    elements.backdrop.classList.remove("mas-visible");
    document.body.style.overflow = "";
  }

  function renderCurrentData() {
    window.postMessage(
      {
        type: "MAS_RENDER_DASHBOARD",
        audienceData: audienceData,
        statsData: statsData,
        activePage: getCurrentPage(),
      },
      window.location.origin
    );
  }

  // --- Script Injection ---

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(src);
      script.onload = () => {
        console.log(TAG, `Loaded: ${src}`);
        resolve();
      };
      script.onerror = (e) => {
        console.error(TAG, `Failed to load: ${src}`, e);
        reject(new Error(`Failed to load ${src}`));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function injectScripts() {
    try {
      await injectScript("lib/chart.umd.min.js");
      await injectScript("lib/chartjs-adapter-date-fns.bundle.min.js");
      await injectScript("dashboard.js");
      dashboardReady = true;
      console.log(TAG, "All scripts loaded");

      // If data arrived before scripts loaded, trigger render now
      if (overlayOpen && (audienceData || statsData)) {
        renderCurrentData();
      }
    } catch (err) {
      console.error(TAG, "Script injection failed:", err);
      showError("Failed to load dashboard scripts.");
    }
  }

  // --- Message Handling ---

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (!event.data || !event.data.type) return;

    switch (event.data.type) {
      case "MAS_AUDIENCE_DATA":
        console.log(TAG, "Received audience data");
        audienceData = event.data.data;
        saveToSession("mas_audience", audienceData);

        try {
          chrome.runtime.sendMessage({
            type: "MAS_DATA_READY",
            page: "audience",
            followerCount: audienceData.totals.followers,
          });
        } catch (e) {
          // Extension context may be invalidated
        }

        if (overlayOpen && dashboardReady) {
          renderCurrentData();
        }
        break;

      case "MAS_STATS_DATA":
        console.log(TAG, "Received stats/earnings data");
        statsData = event.data.data;
        saveToSession("mas_stats", statsData);

        try {
          chrome.runtime.sendMessage({
            type: "MAS_DATA_READY",
            page: "stats",
            totalEarnings: statsData.aggregates.totalEarnings,
            articleCount: statsData.aggregates.articleCount,
          });
        } catch (e) {
          // Extension context may be invalidated
        }

        if (overlayOpen && dashboardReady) {
          renderCurrentData();
        }
        break;

      case "MAS_EXTRACTION_ERROR":
        console.error(TAG, "Extraction error:", event.data.error);
        if (event.data.cacheDebug) {
          console.log(TAG, "=== CACHE DEBUG INFO ===");
          console.log(TAG, "Total keys:", event.data.cacheDebug.totalKeys);
          console.log(TAG, "Prefixes:", JSON.stringify(event.data.cacheDebug.prefixes));
          console.log(TAG, "TypeNames:", JSON.stringify(event.data.cacheDebug.typeNames));
          console.log(TAG, "ROOT_QUERY stats keys:", JSON.stringify(event.data.cacheDebug.rootQueryStatsKeys));
          console.log(TAG, "=== END DEBUG ===");
        }
        if (overlayOpen) {
          showError(event.data.error);
        }
        break;
    }
  });

  function showError(msg) {
    const content = document.getElementById("mas-content");
    if (content) {
      content.innerHTML = `<div class="mas-error">${msg}</div>`;
    }
  }

  // --- Keyboard handler ---

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlayOpen) {
      closeOverlay();
    }
  });

  // --- Initialize ---

  async function init() {
    console.log(TAG, "Content script initializing on", getCurrentPage());

    loadFromSession();
    createToggleButton();

    await injectScript("extractor.js");
    await injectScripts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
