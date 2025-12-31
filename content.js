// Content script - extracts paper title from arXiv abstract pages

function extractPaperInfo() {
  const url = window.location.href;
  let arxivId = null;
  let paperTitle = null;

  // Extract arXiv ID from URL
  const idMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/([\d.]+)/);
  if (idMatch) {
    arxivId = idMatch[1];
  }

  // Only try to extract title from abstract pages
  // PDF pages are binary files with no usable DOM
  if (url.includes('/abs/')) {
    // Method 1: citation_title meta tag (most reliable, no "Title:" prefix)
    const citationMeta = document.querySelector('meta[name="citation_title"]');
    if (citationMeta && citationMeta.content) {
      paperTitle = citationMeta.content;
    }

    // Method 2: og:title meta tag (fallback)
    if (!paperTitle) {
      const ogMeta = document.querySelector('meta[property="og:title"]');
      if (ogMeta && ogMeta.content) {
        paperTitle = ogMeta.content;
      }
    }

    // Method 3: h1.title element (fallback, has "Title:" prefix)
    if (!paperTitle) {
      const h1 = document.querySelector('h1.title');
      if (h1) {
        paperTitle = h1.textContent.replace(/^Title:\s*/i, '').trim();
      }
    }
  }

  // Clean up title - remove invalid filename characters
  if (paperTitle) {
    paperTitle = paperTitle
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/[<>:"/\\|?*]/g, '')   // Remove invalid filename chars
      .replace(/:/g, '')              // Remove colons (colon in title becomes empty)
      .trim();
  }

  return {
    arxivId: arxivId,
    title: paperTitle,
    pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : null,
    absUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : null
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPaperInfo') {
    try {
      const info = extractPaperInfo();
      sendResponse(info);
    } catch (error) {
      console.error('Error extracting paper info:', error);
      sendResponse({ arxivId: null, title: null, pdfUrl: null, absUrl: null });
    }
  }
  return true;
});
