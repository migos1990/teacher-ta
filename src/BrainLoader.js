/**
 * BrainLoader.js — Google Doc, PDF, Slides text extraction
 */

var MAX_CONTEXT_CHARS = 15000;

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
      var fileText = '';

      try {
        if (mimeType === MimeType.GOOGLE_DOCS) {
          fileText = DocumentApp.openById(file.getId()).getBody().getText();
        } else if (mimeType === MimeType.PDF) {
          fileText = extractPDFText(file.getId());
        } else if (mimeType === MimeType.GOOGLE_SLIDES) {
          fileText = extractSlidesText(file.getId());
        } else {
          console.log('Skipping unsupported file type: ' + fileName + ' (' + mimeType + ')');
          continue;
        }

        if (fileText) {
          texts.push('--- ' + fileName + ' ---\n' + fileText);
          console.log('Extracted text from: ' + fileName + ' (' + fileText.length + ' chars)');
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
 * Extract text from a PDF using Drive API v2 OCR conversion.
 * Creates a temporary Google Doc, reads text, then trashes the temp doc.
 * @param {string} fileId - The Drive file ID of the PDF.
 * @return {string} Extracted text content.
 */
function extractPDFText(fileId) {
  try {
    var pdfFile = DriveApp.getFileById(fileId);
    var blob = pdfFile.getBlob();
    var contentType = blob.getContentType();

    // If Drive auto-converted this PDF to a Google Doc, read it directly
    if (contentType !== 'application/pdf') {
      console.log('File ' + fileId + ' has content type ' + contentType + ' — reading as Doc instead of OCR');
      return DocumentApp.openById(fileId).getBody().getText();
    }

    // Use Drive API v2 to insert with OCR
    var resource = {
      title: 'TEMP_OCR_' + new Date().getTime(),
      mimeType: MimeType.GOOGLE_DOCS
    };

    var tempDoc = Drive.Files.insert(resource, blob, {
      ocr: true,
      convert: true
    });

    // Read the text from the temporary doc
    var doc = DocumentApp.openById(tempDoc.id);
    var text = doc.getBody().getText();

    // Trash the temporary doc
    DriveApp.getFileById(tempDoc.id).setTrashed(true);

    return text;
  } catch (e) {
    logError('extractPDFText', e);
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
