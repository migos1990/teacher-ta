/**
 * GmailHelper.js — Email search, draft creation, label management
 */

/**
 * Search for unprocessed email threads matching the configured query.
 * @param {number} [maxResults] - Maximum threads to return (default: BATCH_SIZE).
 * @return {GmailThread[]} Array of matching threads.
 */
function searchUnprocessedThreads(maxResults) {
  var max = maxResults || BATCH_SIZE;
  try {
    var threads = GmailApp.search(SEARCH_QUERY, 0, max);
    console.log('Found ' + threads.length + ' unprocessed threads');
    return threads;
  } catch (e) {
    logError('searchUnprocessedThreads', e);
    return [];
  }
}

/**
 * Get an existing Gmail label or create it if it doesn't exist.
 * @param {string} name - The full label name (e.g., "AutoReply/Processed").
 * @return {GmailLabel} The Gmail label object.
 */
function getOrCreateLabel(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
    console.log('Created label: ' + name);
  }
  return label;
}

/**
 * Create a draft reply to a specific message with HTML body.
 * @param {GmailMessage} message - The message to reply to.
 * @param {string} htmlBody - The HTML content for the reply.
 * @return {GmailDraft} The created draft.
 */
function createDraftReply(message, htmlBody) {
  try {
    var draft = message.createDraftReply('', {
      htmlBody: htmlBody
    });
    console.log('Draft created for message from: ' + message.getFrom());
    return draft;
  } catch (e) {
    logError('createDraftReply', e);
    return null;
  }
}

/**
 * Mark a thread as processed by adding the Processed label.
 * @param {GmailThread} thread - The thread to mark.
 */
function markAsProcessed(thread) {
  try {
    var label = getOrCreateLabel(LABEL_NAMES.PROCESSED);
    thread.addLabel(label);
  } catch (e) {
    logError('markAsProcessed', e);
  }
}

/**
 * Apply a category label (Urgent, Routine, or Excluded) to a thread.
 * @param {GmailThread} thread - The thread to label.
 * @param {string} category - One of "URGENT", "ROUTINE", or "EXCLUDED".
 */
function applyCategory(thread, category) {
  try {
    var labelName;
    switch (category.toUpperCase()) {
      case 'URGENT':
        labelName = LABEL_NAMES.URGENT;
        break;
      case 'ROUTINE':
        labelName = LABEL_NAMES.ROUTINE;
        break;
      case 'EXCLUDED':
        labelName = LABEL_NAMES.EXCLUDED;
        break;
      default:
        labelName = LABEL_NAMES.NEEDS_REVIEW;
    }
    var label = getOrCreateLabel(labelName);
    thread.addLabel(label);
  } catch (e) {
    logError('applyCategory', e);
  }
}

/**
 * Extract the sender email from a GmailMessage.
 * @param {GmailMessage} message - The Gmail message.
 * @return {string} The sender's email address.
 */
function extractSenderEmail(message) {
  return extractEmailAddress(message.getFrom());
}
