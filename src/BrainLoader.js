/**
 * BrainLoader.js — Google Doc, PDF, Slides text extraction
 */

var MAX_CONTEXT_CHARS = 15000;

/**
 * Retrieve cached text for a Drive file.
 * @param {string} fileId - The Drive file ID.
 * @param {number} lastUpdated - The file's last-modified timestamp (ms).
 * @return {string|null} Cached text, or null if not cached / stale.
 */
function getCachedFileText(fileId, lastUpdated) {
  var raw = PropertiesService.getScriptProperties().getProperty('_CACHE_' + fileId);
  if (!raw) return null;
  try {
    var entry = JSON.parse(raw);
    if (entry.ts === lastUpdated) return entry.text;
  } catch (e) {
    // Corrupted cache entry — treat as miss
  }
  return null;
}

/**
 * Store extracted text for a Drive file in the cache.
 * @param {string} fileId - The Drive file ID.
 * @param {number} lastUpdated - The file's last-modified timestamp (ms).
 * @param {string} text - The extracted text to cache.
 */
function setCachedFileText(fileId, lastUpdated, text) {
  var value = JSON.stringify({ ts: lastUpdated, text: text });
  PropertiesService.getScriptProperties().setProperty('_CACHE_' + fileId, value);
}

/**
 * Load the brain file Google Doc and return its full text.
 * @return {string} The document text content.
 */
function loadBrainDoc() {
  var docId = getConfig('BRAIN_DOC_ID');
  if (!docId) {
    console.log('No BRAIN_DOC_ID configured — skipping brain doc');
    return '';
  }

  try {
    var doc = DocumentApp.openById(docId);
    var text = doc.getBody().getText();
    console.log('Loaded brain doc: ' + text.length + ' chars');
    return text;
  } catch (e) {
    logError('loadBrainDoc', e);
    return '';
  }
}

/**
 * Load all files from the configured Drive folder and extract text.
 * Supports Google Docs, PDFs, and Google Slides.
 * @return {string} Combined text from all files in the folder.
 */
function loadDriveFolder() {
  var folderId = getConfig('DRIVE_FOLDER_ID');
  if (!folderId) {
    return '';
  }

  try {
    var folder = DriveApp.getFolderById(folderId);
    var files = folder.getFiles();
    var texts = [];

    while (files.hasNext()) {
      var file = files.next();
      var mimeType = file.getMimeType();
      var fileName = file.getName();
      var fileId = file.getId();
      var lastUpdated = file.getLastUpdated().getTime();
      var fileText = '';

      try {
        // Check cache first — skip extraction if file hasn't changed
        var cached = getCachedFileText(fileId, lastUpdated);
        if (cached !== null) {
          fileText = cached;
          console.log('Cache hit: ' + fileName + ' (' + fileText.length + ' chars)');
        } else if (mimeType === MimeType.GOOGLE_DOCS) {
          fileText = DocumentApp.openById(fileId).getBody().getText();
        } else if (mimeType === MimeType.PDF) {
          fileText = extractPDFText(fileId);
        } else if (mimeType === MimeType.GOOGLE_SLIDES) {
          fileText = extractSlidesText(fileId);
        } else {
          console.log('Skipping unsupported file type: ' + fileName + ' (' + mimeType + ')');
          continue;
        }

        if (fileText) {
          // Cache the extracted text for future runs
          if (cached === null) {
            setCachedFileText(fileId, lastUpdated, fileText);
            console.log('Cached text for: ' + fileName + ' (' + fileText.length + ' chars)');
          }
          texts.push('--- ' + fileName + ' ---\n' + fileText);
        }
      } catch (fileErr) {
        logError('loadDriveFolder/' + fileName, fileErr);
      }
    }

    return texts.join('\n\n');
  } catch (e) {
    logError('loadDriveFolder', e);
    return '';
  }
}

/**
 * Extract text from a PDF file. Checks the Drive API v2 actual MIME type
 * first — if Drive auto-converted the PDF to a Google Doc, exports as
 * plain text directly. Only uses OCR for genuine PDF files.
 * @param {string} fileId - The Drive file ID of the PDF.
 * @return {string} Extracted text content.
 */
function extractPDFText(fileId) {
  try {
    var fileMeta = Drive.Files.get(fileId);
    var actualMimeType = fileMeta.mimeType;
    console.log('extractPDFText: file ' + fileId + ' — DriveApp says PDF, Drive API says: ' + actualMimeType);

    // If Drive auto-converted this PDF to a Google Doc, the Drive API
    // reports the true type. Export as plain text — no OCR needed.
    if (actualMimeType === 'application/vnd.google-apps.document') {
      console.log('File is auto-converted Google Doc — exporting as plain text');
      var exportLinks = fileMeta.exportLinks;
      if (exportLinks && exportLinks['text/plain']) {
        var response = UrlFetchApp.fetch(exportLinks['text/plain'], {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
        });
        return response.getContentText();
      }
      // Fallback: read via DocumentApp
      return DocumentApp.openById(fileId).getBody().getText();
    }

    // Genuine PDF: download raw bytes and OCR
    var downloadUrl = fileMeta.downloadUrl;
    if (!downloadUrl) {
      console.log('No download URL for file ' + fileId + ' — skipping');
      return '';
    }

    var response = UrlFetchApp.fetch(downloadUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    var blob = response.getBlob();
    blob.setName('temp_ocr.pdf');
    blob.setContentType('application/pdf');

    var resource = {
      title: 'TEMP_OCR_' + new Date().getTime(),
      mimeType: 'application/pdf'
    };

    var tempDoc = Drive.Files.insert(resource, blob, {
      ocr: true,
      convert: true
    });

    var doc = DocumentApp.openById(tempDoc.id);
    var text = doc.getBody().getText();

    DriveApp.getFileById(tempDoc.id).setTrashed(true);

    return text;
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.indexOf('rate limit') !== -1 || msg.indexOf('Rate Limit') !== -1) {
      console.log('[AutoReply] OCR rate limited for file ' + fileId + ' — will retry next run');
    } else {
      logError('extractPDFText', e);
    }
    return '';
  }
}

/**
 * Extract text from a Google Slides presentation.
 * Iterates through all slides, shapes, and tables to concatenate text.
 * @param {string} presentationId - The Slides presentation ID.
 * @return {string} Combined text content from all slides.
 */
function extractSlidesText(presentationId) {
  try {
    var presentation = SlidesApp.openById(presentationId);
    var slides = presentation.getSlides();
    var texts = [];

    slides.forEach(function(slide, idx) {
      var slideTexts = [];
      slideTexts.push('Slide ' + (idx + 1) + ':');

      // Extract from page elements (shapes, text boxes)
      var elements = slide.getPageElements();
      elements.forEach(function(element) {
        try {
          if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
            var shape = element.asShape();
            var tf = shape.getText();
            if (tf) {
              var t = tf.asString().trim();
              if (t) slideTexts.push(t);
            }
          } else if (element.getPageElementType() === SlidesApp.PageElementType.TABLE) {
            var table = element.asTable();
            for (var row = 0; row < table.getNumRows(); row++) {
              var rowTexts = [];
              for (var col = 0; col < table.getNumColumns(); col++) {
                var cell = table.getCell(row, col);
                var cellText = cell.getText().asString().trim();
                if (cellText) rowTexts.push(cellText);
              }
              if (rowTexts.length > 0) slideTexts.push(rowTexts.join(' | '));
            }
          }
        } catch (elemErr) {
          // Skip elements that can't be read
        }
      });

      if (slideTexts.length > 1) {
        texts.push(slideTexts.join('\n'));
      }
    });

    return texts.join('\n\n');
  } catch (e) {
    logError('extractSlidesText', e);
    return '';
  }
}

/**
 * Build the full context string from brain doc and drive folder.
 * Truncates to MAX_CONTEXT_CHARS if needed.
 * @return {string} Combined context string.
 */
function buildContextString() {
  var parts = [];

  var brainText = loadBrainDoc();
  if (brainText) {
    parts.push('=== TEACHER KNOWLEDGE BASE ===\n' + brainText);
  }

  var folderText = loadDriveFolder();
  if (folderText) {
    parts.push('=== SUPPLEMENTAL MATERIALS ===\n' + folderText);
  }

  var combined = parts.join('\n\n');

  if (combined.length > MAX_CONTEXT_CHARS) {
    combined = combined.substring(0, MAX_CONTEXT_CHARS) + '\n\n[Context truncated at ' + MAX_CONTEXT_CHARS + ' characters]';
    console.log('Context truncated to ' + MAX_CONTEXT_CHARS + ' chars');
  }

  console.log('Total context length: ' + combined.length + ' chars');
  return combined;
}
