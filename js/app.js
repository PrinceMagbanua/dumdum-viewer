/* =====================================================================
   Dumdum Viewer — main app logic
   Everything runs client-side. Nothing is ever uploaded anywhere.
   ===================================================================== */

(function () {
  "use strict";

  const HAS_FSA = "showOpenFilePicker" in window && "showDirectoryPicker" in window;
  const HISTORY_KEY = "history-list";
  const MAX_HISTORY = 15;
  const VALID_EXT = /\.(md|markdown|txt)$/i;

  const els = {
    sidebar: document.getElementById("sidebar"),
    sidebarHandle: document.getElementById("sidebar-handle"),
    sidebarHandleArrow: document.getElementById("sidebar-handle-arrow"),
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
    emptyState: document.getElementById("empty-state"),
    markdownEditor: document.getElementById("markdown-editor"),
    dropZone: document.getElementById("drop-zone"),
    dragOverlay: document.getElementById("drag-overlay"),
    dragOverlayEmoji: document.getElementById("drag-overlay-emoji"),
    dragOverlayText: document.getElementById("drag-overlay-text"),
    tourTooltip: document.getElementById("tour-tooltip"),
    tourArrow: document.getElementById("tour-arrow"),
    tourEmoji: document.getElementById("tour-emoji"),
    tourTitle: document.getElementById("tour-title"),
    tourBody: document.getElementById("tour-body"),
    tourDots: document.getElementById("tour-dots"),
    tourNext: document.getElementById("tour-next"),
    tourSkip: document.getElementById("tour-skip"),
    tourDontShow: document.getElementById("tour-dont-show"),
  };

  let hasFile = false;
  let editorInstance = null;

  /* --------------------------- THEME --------------------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dumdum-theme", theme);
    document.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeValue === theme);
    });
    els.markdownEditor.classList.toggle("toastui-editor-dark", theme === "dark");
  }

  (function initTheme() {
    applyTheme(localStorage.getItem("dumdum-theme") || "light");
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

  /* --------------------------- SIDEBAR --------------------------- */
  function setSidebarCollapsed(collapsed) {
    els.sidebar.classList.toggle("collapsed", collapsed);
    els.sidebarHandle.classList.toggle("expanded", !collapsed);
    els.sidebarHandleArrow.textContent = collapsed ? "›" : "‹";
    els.sidebarHandle.title = collapsed ? "Show your files" : "Hide your files";
    localStorage.setItem("dumdum-sidebar-collapsed", collapsed ? "true" : "false");
  }

  els.sidebarHandle.addEventListener("click", () => {
    setSidebarCollapsed(!els.sidebar.classList.contains("collapsed"));
  });

  /* --------------------------- EDITOR (Toast UI) --------------------------- */
  function ensureEditor() {
    if (editorInstance) return editorInstance;
    editorInstance = new toastui.Editor({
      el: els.markdownEditor,
      height: "70vh",
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      usageStatistics: false,
    });
    return editorInstance;
  }

  /* --------------------------- RENDERING --------------------------- */
  function showFile(name, text) {
    hasFile = true;
    els.emptyState.classList.add("hidden");
    els.markdownEditor.classList.remove("hidden");
    els.currentFileIcon.textContent = "📄";
    els.currentFileName.textContent = name;
    els.currentFileName.title = name;

    const editor = ensureEditor();
    editor.setMarkdown(text);

    setSidebarCollapsed(false);
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
  async function openFilePicker() {
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
  }

  els.openFileBtn.addEventListener("click", openFilePicker);
  els.emptyState.addEventListener("click", openFilePicker);

  /* --------------------------- OPEN FILE (fallback, no FSA support) --------------------------- */
  els.fallbackInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    showFile(file.name, text);
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
      if (handle.kind === "file" && VALID_EXT.test(name)) {
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
    setSidebarCollapsed(false);
  }

  async function restoreLastFolder() {
    try {
      const dirHandle = await window.dumdumDb.idbGet("last-folder");
      if (!dirHandle) return;
      const perm = await dirHandle.queryPermission({ mode: "read" });
      if (perm === "granted") {
        await loadFolder(dirHandle);
      } else {
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
  }

  /* --------------------------- DRAG & DROP --------------------------- */
  let dragDepth = 0;

  function extractNamesFromDataTransfer(dataTransfer) {
    const names = [];
    if (dataTransfer.items) {
      for (const item of dataTransfer.items) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry && entry.name) {
          names.push(entry.name);
        } else if (item.type) {
          names.push(""); // unknown name, can't validate ahead of drop
        }
      }
    }
    return names;
  }

  function showDragOverlay(valid) {
    els.dragOverlay.classList.remove("hidden");
    els.dropZone.classList.toggle("drag-over", valid);
    els.dropZone.classList.toggle("drag-invalid", !valid);
    if (valid) {
      els.dragOverlayEmoji.textContent = "📄";
      els.dragOverlayText.textContent = "Drop it here!";
    } else {
      els.dragOverlayEmoji.textContent = "🤨";
      els.dragOverlayText.textContent = "Wait, this isn't a Markdown file?";
    }
  }

  function hideDragOverlay() {
    dragDepth = 0;
    els.dragOverlay.classList.add("hidden");
    els.dropZone.classList.remove("drag-over", "drag-invalid");
  }

  els.dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    const names = extractNamesFromDataTransfer(e.dataTransfer);
    const allValid = names.length === 0 || names.every((n) => n === "" || VALID_EXT.test(n));
    showDragOverlay(allValid);
  });

  els.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  els.dropZone.addEventListener("dragleave", (e) => {
    dragDepth--;
    if (dragDepth <= 0) hideDragOverlay();
  });

  els.dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    hideDragOverlay();

    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    if (!VALID_EXT.test(file.name)) {
      alert("🤨 Wait, this isn't a Markdown file? Please drop a .md, .markdown, or .txt file.");
      return;
    }

    let handle = null;
    try {
      if (e.dataTransfer.items && e.dataTransfer.items[0] && e.dataTransfer.items[0].getAsFileSystemHandle) {
        handle = await e.dataTransfer.items[0].getAsFileSystemHandle();
      }
    } catch (err) {
      handle = null;
    }

    const text = await file.text();
    showFile(file.name, text);
    await addToHistory({ name: file.name, time: Date.now(), handle });
  });

  /* --------------------------- GUIDED TOOLTIP TOUR --------------------------- */
  const TOUR_STEPS = [
    {
      target: "#sidebar-handle",
      placement: "right",
      emoji: "👋",
      title: "Welcome to Dumdum Viewer!",
      body: "This tiny guided tour points out each feature right where it lives. Click this tab any time to show or hide your file list.",
    },
    {
      target: "#open-file-btn",
      placement: "right",
      emoji: "📂",
      title: "Opening files",
      body: "Open a single Markdown file, or use 'Open a Folder' to browse everything in a project at once. You can also just drag a file onto the page!",
    },
    {
      target: "#recent-list",
      placement: "right",
      emoji: "🕒",
      title: "Recent Files",
      body: "Every file you open is remembered here, even after closing your browser. Click any of them to jump straight back in.",
    },
    {
      target: "#theme-picker-btn",
      placement: "bottom",
      emoji: "🎨",
      title: "Pick a Theme",
      body: "Switch between Daylight, Midnight, Cozy Cream, and Ocean Calm — pick whatever's easiest on your eyes.",
    },
    {
      target: "#help-btn",
      placement: "bottom",
      emoji: "❓",
      title: "Need this again?",
      body: "Once you open a file, a small toolbar appears with formatting tools plus a WYSIWYG/Markdown switch in the corner. Click HELP! any time to replay this tour.",
    },
  ];

  let tourStep = 0;
  let tourActive = false;
  let sidebarWasCollapsedBeforeTour = false;
  let currentHighlighted = null;

  function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const tip = els.tourTooltip;
    tip.style.visibility = "hidden";
    tip.classList.remove("hidden");
    const tipRect = tip.getBoundingClientRect();
    const step = TOUR_STEPS[tourStep];
    let top, left;
    const gap = 16;

    switch (step.placement) {
      case "right":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + gap;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - gap;
        break;
      case "bottom":
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      default:
        top = rect.bottom + gap;
        left = rect.left;
    }

    top = Math.max(12, Math.min(top, window.innerHeight - tipRect.height - 12));
    left = Math.max(12, Math.min(left, window.innerWidth - tipRect.width - 12));

    tip.style.top = top + "px";
    tip.style.left = left + "px";
    tip.style.visibility = "visible";

    const arrowClass = { right: "left", left: "right", bottom: "top" }[step.placement] || "top";
    els.tourArrow.className = "tour-arrow " + arrowClass;
    if (arrowClass === "left" || arrowClass === "right") {
      els.tourArrow.style.top = Math.max(14, rect.top + rect.height / 2 - top - 7) + "px";
      els.tourArrow.style.left = "";
    } else {
      els.tourArrow.style.left = Math.max(14, rect.left + rect.width / 2 - left - 7) + "px";
      els.tourArrow.style.top = "";
    }
  }

  function renderTourStep() {
    const step = TOUR_STEPS[tourStep];
    if (currentHighlighted) currentHighlighted.classList.remove("tour-highlight");

    const target = document.querySelector(step.target);
    if (!target) {
      nextTourStep();
      return;
    }
    target.classList.add("tour-highlight");
    currentHighlighted = target;

    els.tourEmoji.textContent = step.emoji;
    els.tourTitle.textContent = step.title;
    els.tourBody.textContent = step.body;
    els.tourDots.innerHTML = "";
    TOUR_STEPS.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === tourStep) dot.classList.add("active");
      els.tourDots.appendChild(dot);
    });
    els.tourNext.textContent = tourStep === TOUR_STEPS.length - 1 ? "Got it! 🎉" : "Next →";

    positionTooltip(target);
  }

  function nextTourStep() {
    if (tourStep >= TOUR_STEPS.length - 1) {
      closeTour();
    } else {
      tourStep++;
      renderTourStep();
    }
  }

  function openTour() {
    tourActive = true;
    tourStep = 0;
    sidebarWasCollapsedBeforeTour = els.sidebar.classList.contains("collapsed");
    setSidebarCollapsed(false);
    renderTourStep();
    window.addEventListener("resize", repositionIfActive);
    window.addEventListener("scroll", repositionIfActive, true);
  }

  function repositionIfActive() {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStep];
    const target = document.querySelector(step.target);
    if (target) positionTooltip(target);
  }

  function closeTour() {
    tourActive = false;
    els.tourTooltip.classList.add("hidden");
    if (currentHighlighted) currentHighlighted.classList.remove("tour-highlight");
    currentHighlighted = null;
    window.removeEventListener("resize", repositionIfActive);
    window.removeEventListener("scroll", repositionIfActive, true);
    if (!hasFile) setSidebarCollapsed(sidebarWasCollapsedBeforeTour);
    if (els.tourDontShow.checked) {
      localStorage.setItem("dumdum-hide-tour", "true");
    }
  }

  els.tourNext.addEventListener("click", nextTourStep);
  els.tourSkip.addEventListener("click", closeTour);
  els.helpBtn.addEventListener("click", openTour);

  /* --------------------------- INIT --------------------------- */
  (async function init() {
    const savedCollapsed = localStorage.getItem("dumdum-sidebar-collapsed");
    setSidebarCollapsed(savedCollapsed === null ? true : savedCollapsed === "true");

    await renderHistory();
    await restoreLastFolder();

    if (localStorage.getItem("dumdum-hide-tour") !== "true") {
      openTour();
    }
  })();
})();
