// Background service worker - handles downloads and filename override

// Store pending downloads with their custom filenames
const pendingDownloads = new Map();

// Listen for filename determination - this is where we override the filename
// This is necessary because Chrome ignores the filename parameter in downloads.download()
// if any extension uses onDeterminingFilename
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Check if this is one of our managed downloads
  if (pendingDownloads.has(downloadItem.id)) {
    const customFilename = pendingDownloads.get(downloadItem.id);

    // Clean up
    pendingDownloads.delete(downloadItem.id);

    // Override the filename
    suggest({
      filename: customFilename,
      conflictAction: 'uniquify'
    });

    return true;
  }

  // Not our download, let Chrome handle it normally
  suggest();
});

// Listen for download requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadPDF') {
    const { url, filename } = request;

    // Start the download
    chrome.downloads.download({
      url: url,
      saveAs: false  // Auto-download, don't show save dialog
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else if (downloadId) {
        // Store the custom filename for this download ID
        // onDeterminingFilename will be called shortly
        pendingDownloads.set(downloadId, filename);
        sendResponse({ success: true, downloadId: downloadId });
      } else {
        sendResponse({ success: false, error: 'No download ID returned' });
      }
    });

    return true; // Keep message channel open for async response
  }
});
