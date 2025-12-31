// Popup script - handles UI and coordinates download

const downloadBtn = document.getElementById('download-btn');
const whitespaceSelect = document.getElementById('whitespace-option');
const statusDiv = document.getElementById('status');

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

// Fetch title from abstract page (for PDF pages)
async function fetchTitleFromAbsPage(arxivId) {
  try {
    const absUrl = `https://arxiv.org/abs/${arxivId}`;
    const response = await fetch(absUrl);
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try citation_title meta tag (most reliable)
    const citationMeta = doc.querySelector('meta[name="citation_title"]');
    if (citationMeta && citationMeta.content) {
      return citationMeta.content.trim();
    }

    // Try og:title
    const ogMeta = doc.querySelector('meta[property="og:title"]');
    if (ogMeta && ogMeta.content) {
      return ogMeta.content.trim();
    }

    // Try h1.title
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

downloadBtn.addEventListener('click', async () => {
  try {
    downloadBtn.disabled = true;
    showStatus('Getting paper info...', 'info');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we're on an arXiv page
    if (!tab.url || (!tab.url.includes('arxiv.org/abs/') && !tab.url.includes('arxiv.org/pdf/'))) {
      showStatus('Please navigate to an arXiv paper page', 'error');
      downloadBtn.disabled = false;
      return;
    }

    // Get paper info from content script
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'getPaperInfo' });
    } catch (error) {
      showStatus('Please refresh the page and try again', 'error');
      downloadBtn.disabled = false;
      return;
    }

    if (!response || !response.pdfUrl) {
      showStatus('Could not extract paper information', 'error');
      downloadBtn.disabled = false;
      return;
    }

    let paperTitle = response.title;

    // If no title (e.g., on PDF page), fetch from abstract page
    if (!paperTitle && response.arxivId) {
      showStatus('Fetching title...', 'info');
      paperTitle = await fetchTitleFromAbsPage(response.arxivId);
    }

    // Determine filename
    let filename;
    if (paperTitle) {
      // Clean up title and apply whitespace preference
      paperTitle = paperTitle
        .replace(/\s+/g, ' ')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/:/g, '')
        .trim();

      const whitespaceOption = whitespaceSelect.value;
      const processedTitle = applyWhitespaceReplacement(paperTitle, whitespaceOption);
      filename = `${processedTitle}.pdf`;
    } else {
      // Fallback to arXiv ID
      filename = `${response.arxivId}.pdf`;
    }

    showStatus('Downloading...', 'info');

    // Send download request to background script
    chrome.runtime.sendMessage({
      action: 'downloadPDF',
      url: response.pdfUrl,
      filename: filename
    }, (downloadResponse) => {
      if (chrome.runtime.lastError) {
        showStatus('Download failed: ' + chrome.runtime.lastError.message, 'error');
      } else if (downloadResponse && downloadResponse.success) {
        showStatus('Download started!', 'success');
      } else {
        showStatus('Download failed: ' + (downloadResponse?.error || 'Unknown error'), 'error');
      }
      downloadBtn.disabled = false;
    });

  } catch (error) {
    console.error('Download error:', error);
    showStatus('Error: ' + error.message, 'error');
    downloadBtn.disabled = false;
  }
});
