/**
 * Main.js — Entry point: processEmails()
 * Orchestrates the full email processing pipeline.
 */

/**
 * Build a brief conversation history from a thread's messages.
 * Includes the last few messages (truncated) so Claude understands
 * the conversation flow, not just the latest message.
 * @param {GmailMessage[]} messages - All messages in the thread.
 * @param {number} maxMessages - Max prior messages to include (default: 3).
 * @return {string} Formatted conversation history, or empty string for single-message threads.
 */
function buildConversationHistory(messages, maxMessages) {
  if (messages.length <= 1) return '';

  var max = maxMessages || 3;
  // Include messages before the last one (which is the email we're replying to)
  var startIdx = Math.max(0, messages.length - 1 - max);
  var endIdx = messages.length - 1;

  var history = '\n\n--- Prior conversation context ---\n';
  var maxPerMsg = Math.floor(2000 / Math.min(endIdx - startIdx, max));

  for (var m = startIdx; m < endIdx; m++) {
    var msg = messages[m];
    var msgBody = msg.getPlainBody() || msg.getBody();
    if (msgBody.length > maxPerMsg) {
      msgBody = msgBody.substring(0, maxPerMsg) + ' [truncated]';
    }
    history += 'From ' + msg.getFrom() + ':\n' + msgBody + '\n---\n';
  }

  return history;
}

/**
 * Main entry point. Called by time-based triggers 3x/day.
 * Processes unread inbox emails: categorizes, drafts replies, applies labels.
 */
function processEmails() {
  var startTime = Date.now();
  var stats = { processed: 0, drafts: 0, excluded: 0, errors: 0 };

  console.log('=== processEmails started at ' +
    Utilities.formatDate(new Date(), getConfig('SCHOOL_TIMEZONE') || 'America/New_York', 'yyyy-MM-dd HH:mm:ss') +
    ' ===');

  try {
    // Load context once for all emails
    var context = buildContextString();
    var roster = getStudentRoster();
    var exclusions = getExclusionList();
    var vipContacts = getVIPContacts();

    // Search for unprocessed threads
    var threads = searchUnprocessedThreads(BATCH_SIZE);
    if (threads.length === 0) {
      console.log('No unprocessed threads found. Exiting.');
      return;
    }

    console.log('Processing ' + threads.length + ' threads...');

    for (var i = 0; i < threads.length; i++) {
      // Check time limit before each iteration
      if (!isWithinTimeLimit(startTime, MAX_RUNTIME_MS)) {
        console.log('Approaching time limit — stopping after ' + stats.processed + ' threads');
        break;
      }

      var thread = threads[i];
      try {
        // Get the latest message in the thread
        var messages = thread.getMessages();
        var message = messages[messages.length - 1];
        var senderEmail = extractSenderEmail(message);
        var senderFrom = message.getFrom();

        console.log('Processing: ' + message.getSubject() + ' from ' + senderFrom);

        // Check exclusion list
        if (isExcluded(senderEmail, exclusions)) {
          console.log('Excluded sender: ' + senderEmail);
          applyCategory(thread, 'EXCLUDED');
          markAsProcessed(thread);
          stats.excluded++;
          stats.processed++;
          continue;
        }

        // Look up sender in VIP contacts and student roster
        var vipInfo = lookupVIP(senderEmail, vipContacts);
        var studentInfo = vipInfo ? null : lookupStudent(senderEmail, roster);
        if (vipInfo) {
          console.log('Matched VIP: ' + vipInfo['Name'] + ' (' + vipInfo['Role'] + ')');
        } else if (studentInfo) {
          console.log('Matched student: ' + studentInfo['Student Name']);
        }

        // Get email body text
        var emailBody = message.getPlainBody() || message.getBody();
        // Truncate very long emails
        if (emailBody.length > 10000) {
          emailBody = emailBody.substring(0, 10000) + '\n\n[Email truncated]';
        }

        // Note attachment presence so Claude is aware
        var attachments = message.getAttachments();
        if (attachments && attachments.length > 0) {
          emailBody += '\n\n[Attachments: ' + attachments.map(function(a) {
            return a.getName();
          }).join(', ') + ']';
        }

        // Build conversation history for multi-message threads
        var conversationHistory = buildConversationHistory(messages);
        if (conversationHistory) {
          emailBody = conversationHistory + '\n\nLatest message:\n' + emailBody;
        }

        // Categorize the email
        var categorization = categorizeEmail(emailBody, senderFrom, context);
        console.log('Category: ' + categorization.category +
          ' | Subcategory: ' + categorization.subcategory +
          ' | Confidence: ' + categorization.confidence +
          ' | Summary: ' + categorization.summary);

        // VIP override: force URGENT + formal for high-priority contacts
        if (vipInfo && String(vipInfo['Priority']).toUpperCase() === 'HIGH') {
          categorization.category = 'URGENT';
          categorization.suggestedTone = 'formal';
          console.log('VIP override: forced URGENT/formal for ' + vipInfo['Name']);
        }

        // Skip drafting for excluded emails
        if (categorization.category === 'EXCLUDED') {
          applyCategory(thread, categorization);
          markAsProcessed(thread);
          stats.excluded++;
          stats.processed++;
          continue;
        }

        // Draft a reply
        var replyText = draftReply(emailBody, senderFrom, studentInfo, vipInfo, context, categorization);

        // Prepend low-confidence warning for professor's attention
        if (categorization.confidence < CONFIDENCE_THRESHOLD) {
          replyText = '[LOW CONFIDENCE DRAFT — Please review carefully before sending. ' +
            'Confidence: ' + categorization.confidence + ']\n\n' + replyText;
        }

        var replyHtml = formatHtmlReply(replyText);

        // Create Gmail draft
        var draft = createDraftReply(message, replyHtml);
        if (draft) {
          stats.drafts++;
        }

        // Apply category and subcategory labels, then mark as processed
        applyCategory(thread, categorization);
        markAsProcessed(thread);
        stats.processed++;

      } catch (threadErr) {
        logError('processEmails/thread ' + i, threadErr);
        stats.errors++;
        // Still mark as processed to avoid reprocessing broken emails
        try {
          markAsProcessed(thread);
          stats.processed++;
        } catch (labelErr) {
          logError('processEmails/markFailed', labelErr);
        }
      }
    }

  } catch (e) {
    logError('processEmails', e);
    stats.errors++;
  }

  var elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('=== processEmails complete ===');
  console.log('Elapsed: ' + elapsed + 's | Processed: ' + stats.processed +
    ' | Drafts: ' + stats.drafts + ' | Excluded: ' + stats.excluded +
    ' | Errors: ' + stats.errors);
}
