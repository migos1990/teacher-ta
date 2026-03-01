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
 * Apply category labels to a thread.
 * Accepts either a string (backward compat) or a categorization object
 * with category and subcategory fields.
 * @param {GmailThread} thread - The thread to label.
 * @param {string|Object} categorization - Category string or {category, subcategory} object.
 */
function applyCategory(thread, categorization) {
  try {
    // Backward compat: accept a plain string
    if (typeof categorization === 'string') {
      categorization = { category: categorization };
    }

    // Apply priority label
    var priorityName = LABEL_NAMES[categorization.category] || LABEL_NAMES.NEEDS_REVIEW;
    var priorityLabel = getOrCreateLabel(priorityName);
    thread.addLabel(priorityLabel);

    // Apply subcategory label if present and known
    if (categorization.subcategory && LABEL_NAMES[categorization.subcategory]) {
      var subLabel = getOrCreateLabel(LABEL_NAMES[categorization.subcategory]);
      thread.addLabel(subLabel);
    }
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
