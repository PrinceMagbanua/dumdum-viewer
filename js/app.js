/* =====================================================================
   Dumdum Viewer — main app logic
   Everything runs client-side. Nothing is ever uploaded anywhere.
   ===================================================================== */

(function () {
  "use strict";

  const HAS_FSA = "showOpenFilePicker" in window && "showDirectoryPicker" in window;
  const HISTORY_KEY = "history-list";
  const MAX_HISTORY = 15;

  const els = {
    themeBtn: document.getElementById("theme-picker-btn"),
    themePopover: document.getElementById("theme-popover"),
    helpBtn: document.getElementById("help-btn"),
    openFileBtn: document.getElementById("open-file-btn"),
    openFolderBtn: document.getElementById("open-folder-btn"),
    fsaWarning: document.getElementById("fsa-warning"),
    fallbackInput: document.getElementById("fallback-file-input"),
    recentList: document.getElementById("recent-list"),
    clearHistoryBtn: document.getElementById("clear-history-btn"),
    folderSection: document.getElementById("folder-section"),
    folderNameLabel: document.getElementById("folder-name-label"),
    folderFileList: document.getElementById("folder-file-list"),
    currentFileIcon: document.getElementById("current-file-icon"),
    currentFileName: document.getElementById("current-file-name"),
    toggleRendered: document.getElementById("toggle-rendered"),
    togglePlain: document.getElementById("toggle-plain"),
    emptyState: document.getElementById("empty-state"),
    renderedView: document.getElementById("rendered-view"),
    plainView: document.getElementById("plain-view"),
    overlay: document.getElementById("onboarding-overlay"),
    obEmoji: document.getElementById("ob-emoji"),
    obTitle: document.getElementById("ob-title"),
    obBody: document.getElementById("ob-body"),
    obDots: document.getElementById("ob-dots"),
    obNext: document.getElementById("ob-next"),
    obSkip: document.getElementById("ob-skip"),
    obDontShow: document.getElementById("ob-dont-show"),
  };

  let currentText = "";
  let currentMode = localStorage.getItem("dumdum-view-mode") || "rendered";

  /* --------------------------- THEME --------------------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dumdum-theme", theme);
    document.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeValue === theme);
    });
  }

  (function initTheme() {
    const saved = localStorage.getItem("dumdum-theme") || "light";
    applyTheme(saved);
  })();

  els.themeBtn.addEventListener("click", () => {
    els.themePopover.classList.toggle("hidden");
  });

  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themeValue);
      els.themePopover.classList.add("hidden");
    });
  });

  document.addEventListener("click", (e) => {
    if (!els.themePopover.contains(e.target) && e.target !== els.themeBtn) {
      els.themePopover.classList.add("hidden");
    }
  });

  /* --------------------------- VIEW TOGGLE --------------------------- */
  function setMode(mode) {
    currentMode = mode;
    localStorage.setItem("dumdum-view-mode", mode);
    els.toggleRendered.classList.toggle("active", mode === "rendered");
    els.togglePlain.classList.toggle("active", mode === "plain");
    els.renderedView.classList.toggle("hidden", mode !== "rendered");
    els.plainView.classList.toggle("hidden", mode !== "plain");
  }

  els.toggleRendered.addEventListener("click", () => setMode("rendered"));
  els.togglePlain.addEventListener("click", () => setMode("plain"));

  /* --------------------------- RENDERING --------------------------- */
  function showFile(name, text) {
    currentText = text;
    els.emptyState.classList.add("hidden");
    els.currentFileIcon.textContent = "📄";
    els.currentFileName.textContent = name;

    els.plainView.textContent = text;

    try {
      const rawHtml = marked.parse(text);
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      els.renderedView.innerHTML = cleanHtml;
    } catch (err) {
      els.renderedView.innerHTML = "<p><em>Couldn't format this file. Showing plain text instead.</em></p>";
      setMode("plain");
    }

    els.renderedView.classList.toggle("hidden", currentMode !== "rendered");
    els.plainView.classList.toggle("hidden", currentMode !== "plain");
    setMode(currentMode);
  }

  /* --------------------------- HISTORY --------------------------- */
  async function getHistory() {
    const list = await window.dumdumDb.idbGet(HISTORY_KEY);
    return Array.isArray(list) ? list : [];
  }

  async function saveHistory(list) {
    await window.dumdumDb.idbSet(HISTORY_KEY, list);
  }

  async function addToHistory(entry) {
    let list = await getHistory();
    // Remove any existing entry that points at the same file name (simple de-dupe)
    list = list.filter((item) => item.name !== entry.name);
    list.unshift(entry);
    if (list.length > MAX_HISTORY) list = list.slice(0, MAX_HISTORY);
    await saveHistory(list);
    await renderHistory();
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    return days + "d ago";
  }

  async function renderHistory() {
    const list = await getHistory();
    els.recentList.innerHTML = "";
    if (list.length === 0) {
      els.recentList.innerHTML = '<li class="empty-state">Nothing yet — open a file to get started!</li>';
      return;
    }
    for (const entry of list) {
      const li = document.createElement("li");
      li.className = "recent-item";
      li.innerHTML = `<span>📄</span><span class="ri-name">${escapeHtml(entry.name)}</span><span class="ri-time">${timeAgo(entry.time)}</span>`;
      li.title = "Click to reopen " + entry.name;
      li.addEventListener("click", () => openHistoryEntry(entry));
      els.recentList.appendChild(li);
    }
  }

  async function openHistoryEntry(entry) {
    if (!entry.handle) {
      alert("This browser can't reopen files automatically. Please use 'Open a Markdown File' again.");
      return;
    }
    try {
      const perm = await ensurePermission(entry.handle);
      if (!perm) {
        alert("Permission was not granted to reopen this file.");
        return;
      }
      const file = await entry.handle.getFile();
      const text = await file.text();
      showFile(file.name, text);
      await addToHistory({ name: file.name, time: Date.now(), handle: entry.handle });
    } catch (err) {
      alert("Couldn't reopen that file. It may have been moved or deleted.\n\n" + err.message);
    }
  }

  async function ensurePermission(handle) {
    const opts = { mode: "read" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  els.clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("Clear your recent files list? This won't delete any actual files.")) return;
    await saveHistory([]);
    await renderHistory();
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* --------------------------- OPEN FILE (File System Access API) --------------------------- */
  els.openFileBtn.addEventListener("click", async () => {
    if (!HAS_FSA) {
      els.fallbackInput.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown or text files",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".txt"] },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      showFile(file.name, text);
      await addToHistory({ name: file.name, time: Date.now(), handle });
    } catch (err) {
      if (err.name !== "AbortError") {
        alert("Something went wrong opening that file.\n\n" + err.message);
      }
    }
  });

  /* --------------------------- OPEN FILE (fallback, no FSA support) --------------------------- */
  els.fallbackInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    showFile(file.name, text);
    // Can't persist a plain <input> file across reloads — no handle to store.
    await addToHistory({ name: file.name, time: Date.now(), handle: null });
    e.target.value = "";
  });

  /* --------------------------- OPEN FOLDER --------------------------- */
  els.openFolderBtn.addEventListener("click", async () => {
    if (!HAS_FSA) {
      alert("Folder access needs a Chromium-based browser like Chrome or Edge. You can still open single files!");
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker();
      await window.dumdumDb.idbSet("last-folder", dirHandle);
      await loadFolder(dirHandle);
    } catch (err) {
      if (err.name !== "AbortError") {
        alert("Something went wrong opening that folder.\n\n" + err.message);
      }
    }
  });

  async function loadFolder(dirHandle) {
    const granted = await ensurePermission(dirHandle);
    if (!granted) return;

    els.folderSection.style.display = "block";
    els.folderNameLabel.textContent = dirHandle.name;
    els.folderFileList.innerHTML = "";

    const mdFiles = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === "file" && /\.(md|markdown|txt)$/i.test(name)) {
        mdFiles.push({ name, handle });
      }
    }
    mdFiles.sort((a, b) => a.name.localeCompare(b.name));

    if (mdFiles.length === 0) {
      els.folderFileList.innerHTML = '<li class="empty-state">No Markdown files found in this folder.</li>';
      return;
    }

    for (const { name, handle } of mdFiles) {
      const li = document.createElement("li");
      li.className = "recent-item";
      li.innerHTML = `<span>📄</span><span class="ri-name">${escapeHtml(name)}</span>`;
      li.addEventListener("click", async () => {
        const file = await handle.getFile();
        const text = await file.text();
        showFile(file.name, text);
        await addToHistory({ name: file.name, time: Date.now(), handle });
      });
      els.folderFileList.appendChild(li);
    }
  }

  async function restoreLastFolder() {
    try {
      const dirHandle = await window.dumdumDb.idbGet("last-folder");
      if (!dirHandle) return;
      const perm = await dirHandle.queryPermission({ mode: "read" });
      if (perm === "granted") {
        await loadFolder(dirHandle);
      } else {
        // Don't prompt automatically on load (needs a user gesture) —
        // just show the folder name with a re-connect option.
        els.folderSection.style.display = "block";
        els.folderNameLabel.textContent = dirHandle.name + " (click a file to reconnect)";
        els.folderFileList.innerHTML =
          '<li class="recent-item" id="reconnect-folder">🔌 Click to reconnect this folder</li>';
        document.getElementById("reconnect-folder").addEventListener("click", () => loadFolder(dirHandle));
      }
    } catch (err) {
      /* no folder stored yet, or handle stale — ignore */
    }
  }

  if (!HAS_FSA) {
    els.fsaWarning.classList.remove("hidden");
    els.openFolderBtn.disabled = false; // keep clickable to show the explainer alert
  }

  /* --------------------------- ONBOARDING GUIDE --------------------------- */
  const ONBOARDING_STEPS = [
    {
      emoji: "👋",
      title: "Welcome to Dumdum Viewer!",
      body: "This is a super simple way to read Markdown (.md) files. No technical know-how needed. Let's take a 30-second tour.",
    },
    {
      emoji: "📂",
      title: "Opening files",
      body: "Use the buttons on the left — 'Open a Markdown File' for one file, or 'Open a Folder' to browse everything in a project folder at once.",
    },
    {
      emoji: "🕒",
      title: "Recent Files",
      body: "Every file you open is remembered here, even after you close your browser. Click any of them to jump straight back in.",
    },
    {
      emoji: "🖼️🔤",
      title: "Pretty View vs. Plain Text",
      body: "Use the big switch at the top of the page. 'Pretty View' shows the file nicely formatted. 'Plain Text' shows exactly what's typed, symbols and all — handy for copying.",
    },
    {
      emoji: "🎨",
      title: "Pick a Theme",
      body: "Click the 🎨 Theme button up top to switch between Daylight, Midnight, Cozy Cream, and Ocean Calm. Pick whatever's easiest on your eyes.",
    },
    {
      emoji: "❓",
      title: "Need this again?",
      body: "Just click the ❓ HELP! button in the top corner any time you want to see this guide again. You're all set — happy reading!",
    },
  ];

  let obStep = 0;

  function renderOnboardingStep() {
    const step = ONBOARDING_STEPS[obStep];
    els.obEmoji.textContent = step.emoji;
    els.obTitle.textContent = step.title;
    els.obBody.textContent = step.body;
    els.obDots.innerHTML = "";
    ONBOARDING_STEPS.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === obStep) dot.classList.add("active");
      els.obDots.appendChild(dot);
    });
    els.obNext.textContent = obStep === ONBOARDING_STEPS.length - 1 ? "Got it! 🎉" : "Next →";
  }

  function openOnboarding() {
    obStep = 0;
    renderOnboardingStep();
    els.overlay.classList.remove("hidden");
  }

  function closeOnboarding() {
    els.overlay.classList.add("hidden");
    if (els.obDontShow.checked) {
      localStorage.setItem("dumdum-hide-onboarding", "true");
    }
  }

  els.obNext.addEventListener("click", () => {
    if (obStep === ONBOARDING_STEPS.length - 1) {
      closeOnboarding();
    } else {
      obStep++;
      renderOnboardingStep();
    }
  });

  els.obSkip.addEventListener("click", closeOnboarding);
  els.helpBtn.addEventListener("click", openOnboarding);

  /* --------------------------- INIT --------------------------- */
  (async function init() {
    setMode(currentMode);
    await renderHistory();
    await restoreLastFolder();

    if (localStorage.getItem("dumdum-hide-onboarding") !== "true") {
      openOnboarding();
    }
  })();
})();
