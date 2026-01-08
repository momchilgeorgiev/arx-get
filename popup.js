// Popup script - handles UI and coordinates download

const downloadBtn = document.getElementById('download-btn');
const whitespaceSelect = document.getElementById('whitespace-option');
const statusDiv = document.getElementById('status');
const paperList = document.getElementById('paper-list');
const bulkDownloadBtn = document.getElementById('bulk-download-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const bulkEmpty = document.getElementById('bulk-empty');
const paperCount = document.getElementById('paper-count');
const selectedCount = document.getElementById('selected-count');

let paperItems = [];
let selectedIds = new Set();
let activeScholarTab = false;
let scholarScanFailed = false;

// Load saved whitespace preference
chrome.storage.sync.get(['whitespaceOption'], (result) => {
  if (result.whitespaceOption) {
    whitespaceSelect.value = result.whitespaceOption;
  }
});

// Save whitespace preference when changed
whitespaceSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ whitespaceOption: whitespaceSelect.value });
});

function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 3000);
  }
}

function applyWhitespaceReplacement(text, option) {
  switch (option) {
    case 'underscore':
      return text.replace(/\s+/g, '_');
    case 'hyphen':
      return text.replace(/\s+/g, '-');
    case 'space':
    default:
      return text;
  }
}

function extractArxivIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(abs|pdf)\/(.+)$/);
    if (!match) {
      return null;
    }

    let idPart = match[2];
    if (idPart.endsWith('.pdf')) {
      idPart = idPart.slice(0, -4);
    }

    return idPart || null;
  } catch (error) {
    return null;
  }
}

function isArxivUrl(url) {
  return Boolean(url && (url.includes('arxiv.org/abs/') || url.includes('arxiv.org/pdf/')));
}

function resolveArxivUrlFromTab(tab) {
  const candidates = [tab.url, tab.pendingUrl].filter(Boolean);

  for (const candidate of candidates) {
    if (isArxivUrl(candidate)) {
      return candidate;
    }

    try {
      const parsed = new URL(candidate);
      const fileParam = parsed.searchParams.get('file');
      if (fileParam && isArxivUrl(fileParam)) {
        return fileParam;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

function normalizePaperTitle(title) {
  if (!title) {
    return null;
  }

  return title
    .replace(/\s+/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/:/g, '')
    .trim();
}

// Fetch title from abstract page (for PDF pages)
async function fetchTitleFromAbsPage(arxivId) {
  try {
    const absUrl = `https://arxiv.org/abs/${arxivId}`;
    const response = await fetch(absUrl);
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const citationMeta = doc.querySelector('meta[name="citation_title"]');
    if (citationMeta && citationMeta.content) {
      return citationMeta.content.trim();
    }

    const ogMeta = doc.querySelector('meta[property="og:title"]');
    if (ogMeta && ogMeta.content) {
      return ogMeta.content.trim();
    }

    const h1 = doc.querySelector('h1.title');
    if (h1) {
      return h1.textContent.replace(/^Title:\s*/i, '').trim();
    }

    return null;
  } catch (error) {
    console.error('Error fetching title:', error);
    return null;
  }
}

function buildFilename(title, arxivId) {
  const normalizedTitle = normalizePaperTitle(title);
  if (!normalizedTitle) {
    return `${arxivId}.pdf`;
  }

  const whitespaceOption = whitespaceSelect.value;
  const processedTitle = applyWhitespaceReplacement(normalizedTitle, whitespaceOption);
  return `${processedTitle}.pdf`;
}

function isScholarUrl(url) {
  return Boolean(url && url.includes('scholar.google.com'));
}

async function sendDownloadRequest(url, filename) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'downloadPDF',
      url,
      filename
    }, (downloadResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else if (downloadResponse && downloadResponse.success) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: downloadResponse?.error || 'Unknown error' });
      }
    });
  });
}

async function getPaperInfoFromTab(tab) {
  const resolvedUrl = resolveArxivUrlFromTab(tab);
  if (!resolvedUrl) {
    return null;
  }

  let response = null;
  if (isArxivUrl(tab.url) || isArxivUrl(tab.pendingUrl)) {
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'getPaperInfo' });
    } catch (error) {
      response = null;
    }
  }

  const arxivId = response?.arxivId || extractArxivIdFromUrl(resolvedUrl);
  if (!arxivId) {
    return null;
  }

  return {
    arxivId,
    title: response?.title || null,
    pdfUrl: response?.pdfUrl || `https://arxiv.org/pdf/${arxivId}.pdf`,
    absUrl: response?.absUrl || `https://arxiv.org/abs/${arxivId}`
  };
}

async function getScholarPapersFromTab(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getScholarPapers' });
    const papers = Array.isArray(response?.papers) ? response.papers : [];
    return papers.map((paper) => ({
      arxivId: paper.arxivId,
      title: paper.title || null,
      pdfUrl: paper.pdfUrl,
      absUrl: paper.absUrl,
      sourceLabel: 'Google Scholar',
      titleFetched: Boolean(paper.title)
    }));
  } catch (error) {
    return null;
  }
}

async function loadPaperItems() {
  const tabs = await chrome.tabs.query({ currentWindow: true });

  const items = [];
  for (const tab of tabs) {
    const info = await getPaperInfoFromTab(tab);
    if (info) {
      items.push({
        ...info,
        sourceLabel: 'Open tab',
        titleFetched: Boolean(info.title)
      });
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeScholarTab = Boolean(activeTab && isScholarUrl(activeTab.url));
  scholarScanFailed = false;
  if (activeScholarTab) {
    const scholarPapers = await getScholarPapersFromTab(activeTab);
    if (scholarPapers) {
      items.push(...scholarPapers);
    } else {
      scholarScanFailed = true;
    }
  }

  const deduped = new Map();
  items.forEach((item) => {
    if (!item.arxivId) {
      return;
    }

    const existing = deduped.get(item.arxivId);
    if (!existing) {
      deduped.set(item.arxivId, item);
    } else if (!existing.title && item.title) {
      existing.title = item.title;
      existing.titleFetched = true;
    }
  });

  return Array.from(deduped.values());
}

function updateSelectionUI() {
  const total = paperItems.length;
  const selected = selectedIds.size;

  paperCount.textContent = `(${total})`;
  selectedCount.textContent = `${selected} selected`;
  bulkDownloadBtn.disabled = selected === 0;
  selectAllBtn.disabled = total === 0;
  selectAllBtn.textContent = selected === total && total > 0 ? 'Clear selection' : 'Select all';
}

function renderPaperList() {
  paperList.innerHTML = '';
  bulkEmpty.style.display = paperItems.length === 0 ? 'block' : 'none';
  paperList.style.display = paperItems.length === 0 ? 'none' : 'block';
  if (paperItems.length === 0) {
    if (activeScholarTab) {
      bulkEmpty.textContent = scholarScanFailed
        ? 'Could not read this Google Scholar page. Reload the tab and try again.'
        : 'No arXiv links found on this Google Scholar page.';
    } else {
      bulkEmpty.textContent = 'No open arXiv tabs found. If you are on Google Scholar, open a results page and try again.';
    }
  }

  paperItems.forEach((item) => {
    const label = document.createElement('label');
    label.className = 'paper-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedIds.has(item.arxivId);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedIds.add(item.arxivId);
      } else {
        selectedIds.delete(item.arxivId);
      }
      updateSelectionUI();
    });

    const textWrapper = document.createElement('div');
    textWrapper.className = 'paper-text';

    const title = document.createElement('div');
    title.className = 'paper-title';
    if (item.title) {
      title.textContent = item.title;
    } else if (item.titleFetched) {
      title.textContent = 'Title unavailable';
    } else {
      title.textContent = 'Fetching title...';
    }

    const meta = document.createElement('div');
    meta.className = 'paper-meta';
    const sourceLabel = item.sourceLabel ? ` • ${item.sourceLabel}` : '';
    meta.textContent = `${item.arxivId}${sourceLabel}`;

    textWrapper.appendChild(title);
    textWrapper.appendChild(meta);

    label.appendChild(checkbox);
    label.appendChild(textWrapper);
    paperList.appendChild(label);
  });

  updateSelectionUI();
}

async function hydrateMissingTitles() {
  const pending = paperItems.map(async (item) => {
    if (item.title || !item.arxivId) {
      item.titleFetched = true;
      return item;
    }

    const fetchedTitle = await fetchTitleFromAbsPage(item.arxivId);
    if (fetchedTitle) {
      item.title = fetchedTitle;
    }
    item.titleFetched = true;

    return item;
  });

  await Promise.all(pending);
  renderPaperList();
}

async function refreshPaperList() {
  paperItems = await loadPaperItems();
  selectedIds = new Set();
  renderPaperList();
  await hydrateMissingTitles();
}

async function downloadPaper(item) {
  let title = item.title;
  if (!title && item.arxivId) {
    title = await fetchTitleFromAbsPage(item.arxivId);
  }

  const filename = buildFilename(title, item.arxivId);
  return sendDownloadRequest(item.pdfUrl, filename);
}

downloadBtn.addEventListener('click', async () => {
  try {
    downloadBtn.disabled = true;
    showStatus('Getting paper info...', 'info');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.url && isScholarUrl(tab.url)) {
      showStatus('Select papers from the list below', 'error');
      downloadBtn.disabled = false;
      return;
    }

    if (!tab?.url || (!tab.url.includes('arxiv.org/abs/') && !tab.url.includes('arxiv.org/pdf/'))) {
      showStatus('Please navigate to an arXiv paper page', 'error');
      downloadBtn.disabled = false;
      return;
    }

    const response = await getPaperInfoFromTab(tab);
    if (!response || !response.pdfUrl) {
      showStatus('Could not extract paper information', 'error');
      downloadBtn.disabled = false;
      return;
    }

    if (!response.title && response.arxivId) {
      showStatus('Fetching title...', 'info');
      response.title = await fetchTitleFromAbsPage(response.arxivId);
    }

    showStatus('Downloading...', 'info');
    const downloadResponse = await downloadPaper(response);
    if (downloadResponse.success) {
      showStatus('Download started!', 'success');
    } else {
      showStatus(`Download failed: ${downloadResponse.error}`, 'error');
    }
  } catch (error) {
    console.error('Download error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    downloadBtn.disabled = false;
  }
});

selectAllBtn.addEventListener('click', () => {
  if (paperItems.length === 0) {
    return;
  }

  if (selectedIds.size === paperItems.length) {
    selectedIds = new Set();
  } else {
    selectedIds = new Set(paperItems.map((item) => item.arxivId));
  }

  renderPaperList();
});

bulkDownloadBtn.addEventListener('click', async () => {
  const selectedItems = paperItems.filter((item) => selectedIds.has(item.arxivId));
  if (selectedItems.length === 0) {
    showStatus('No papers selected', 'error');
    return;
  }

  bulkDownloadBtn.disabled = true;
  downloadBtn.disabled = true;
  selectAllBtn.disabled = true;

  let successCount = 0;
  let failureCount = 0;

  for (let index = 0; index < selectedItems.length; index += 1) {
    const item = selectedItems[index];
    showStatus(`Downloading ${index + 1} of ${selectedItems.length}...`, 'info');
    const result = await downloadPaper(item);
    if (result.success) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  }

  if (failureCount > 0) {
    showStatus(`Started ${successCount}/${selectedItems.length} downloads`, 'error');
  } else {
    showStatus(`Started ${successCount}/${selectedItems.length} downloads`, 'success');
  }

  bulkDownloadBtn.disabled = selectedIds.size === 0;
  downloadBtn.disabled = false;
  selectAllBtn.disabled = paperItems.length === 0;
});

refreshPaperList();
