# arx-get

A Chrome/Brave extension that downloads arXiv PDFs with their actual paper titles instead of numeric IDs.

## The Problem

When you download a paper from arXiv, you get a file like:
```
2401.02524v2.pdf
```

With **arx-get**, you get:
```
Comprehensive_Exploration_of_Synthetic_Data_Generation_A_Survey.pdf
```

## Installation

1. Open Chrome/Brave and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `arxiv-pdf-downloader` folder
5. Done!

## Usage

1. Navigate to any arXiv paper:
   - Abstract page: `https://arxiv.org/abs/2401.02524`
   - PDF page: `https://arxiv.org/pdf/2401.02524`

2. Click the **arx-get** extension icon

3. Choose your whitespace preference:
   - **Underscore**: `Paper_Title_Here.pdf`
   - **Hyphen**: `Paper-Title-Here.pdf`
   - **Keep spaces**: `Paper Title Here.pdf`

4. Click **Download PDF**

Your preference is saved automatically for future downloads.

## Features

- ✅ Works on both abstract and PDF pages
- ✅ Extracts actual paper titles from metadata
- ✅ Customizable whitespace handling
- ✅ Falls back to arXiv ID if title unavailable
- ✅ Lightweight and fast

## Privacy

This extension:
- Only works on arxiv.org
- Does not collect or transmit any data
- Only stores your whitespace preference locally

## License

MIT
