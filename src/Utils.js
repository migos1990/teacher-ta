/**
 * Utils.js — Logging, error handling, time checks, and formatting helpers
 */

/**
 * Extract an email address from a "Name <email>" format string.
 * @param {string} fromField - The From header value.
 * @return {string} The extracted email address.
 */
function extractEmailAddress(fromField) {
  if (!fromField) return '';
  var match = fromField.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  // If no angle brackets, the whole string might be just an email
  var emailMatch = fromField.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailMatch ? emailMatch[0].toLowerCase().trim() : fromField.toLowerCase().trim();
}

/**
 * Check if we are still within the allowed runtime.
 * @param {number} startTime - The start timestamp (ms since epoch).
 * @param {number} maxMs - Maximum allowed runtime in milliseconds.
 * @return {boolean} True if elapsed time is less than maxMs.
 */
function isWithinTimeLimit(startTime, maxMs) {
  return (Date.now() - startTime) < maxMs;
}

/**
 * Log an error with structured context.
 * @param {string} context - Where the error occurred.
 * @param {Error|string} error - The error object or message.
 */
function logError(context, error) {
  var message = error instanceof Error ? error.message : String(error);
  var stack = error instanceof Error ? error.stack : '';
  console.error('[AutoReply Error] ' + context + ': ' + message);
  if (stack) {
    console.error('[AutoReply Stack] ' + stack);
  }
}

/**
 * Convert plain text to basic HTML with paragraphs.
 * @param {string} text - Plain text reply content.
 * @return {string} HTML-formatted string.
 */
function formatHtmlReply(text) {
  if (!text) return '';
  var escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  var paragraphs = escaped.split(/\n\n+/);
  var html = paragraphs.map(function(p) {
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return html;
}
