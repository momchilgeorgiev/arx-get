// Content script - extracts paper info from arXiv and Google Scholar pages

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

function extractArxivPaperInfo() {
  const url = window.location.href;
  const arxivId = extractArxivIdFromUrl(url);
  let paperTitle = null;

  if (url.includes('/abs/')) {
    const citationMeta = document.querySelector('meta[name="citation_title"]');
    if (citationMeta && citationMeta.content) {
      paperTitle = citationMeta.content;
    }

    if (!paperTitle) {
      const ogMeta = document.querySelector('meta[property="og:title"]');
      if (ogMeta && ogMeta.content) {
        paperTitle = ogMeta.content;
      }
    }

    if (!paperTitle) {
      const h1 = document.querySelector('h1.title');
      if (h1) {
        paperTitle = h1.textContent.replace(/^Title:\s*/i, '').trim();
      }
    }
  }

  return {
    arxivId: arxivId,
    title: normalizePaperTitle(paperTitle),
    pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : null,
    absUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : null
  };
}

function extractScholarPapersFromPage() {
  const results = document.querySelectorAll('.gs_r');
  const papersById = new Map();

  function addPaper(arxivId, titleText) {
    if (!arxivId) {
      return;
    }

    const existing = papersById.get(arxivId);
    const normalizedTitle = normalizePaperTitle(titleText);
    const title = normalizedTitle || existing?.title || null;

    papersById.set(arxivId, {
      arxivId,
      title: title,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
      absUrl: `https://arxiv.org/abs/${arxivId}`
    });
  }

  results.forEach((result) => {
    const titleElement = result.querySelector('.gs_rt');
    const titleLink = titleElement ? titleElement.querySelector('a') : null;
    const titleText = titleLink ? titleLink.textContent : titleElement?.textContent;

    const links = result.querySelectorAll('a[href*="arxiv.org/abs/"], a[href*="arxiv.org/pdf/"]');
    links.forEach((link) => {
      const arxivId = extractArxivIdFromUrl(link.href);
      addPaper(arxivId, titleText);
    });
  });

  if (papersById.size === 0) {
    const links = document.querySelectorAll('a[href*="arxiv.org/abs/"], a[href*="arxiv.org/pdf/"]');
    links.forEach((link) => {
      const arxivId = extractArxivIdFromUrl(link.href);
      addPaper(arxivId, link.textContent);
    });
  }

  return Array.from(papersById.values());
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPaperInfo') {
    try {
      const info = extractArxivPaperInfo();
      sendResponse(info);
    } catch (error) {
      console.error('Error extracting paper info:', error);
      sendResponse({ arxivId: null, title: null, pdfUrl: null, absUrl: null });
    }
  }

  if (request.action === 'getScholarPapers') {
    try {
      const papers = extractScholarPapersFromPage();
      sendResponse({ papers });
    } catch (error) {
      console.error('Error extracting Scholar papers:', error);
      sendResponse({ papers: [] });
    }
  }

  return true;
});
