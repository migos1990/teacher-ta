/**
 * ClaudeAPI.js — Anthropic Claude API integration via UrlFetchApp
 */

var MAX_RETRIES = 3;
var INITIAL_RETRY_DELAY_MS = 1000;
var MAX_RETRY_DELAY_MS = 30000;

/**
 * Call the Anthropic Messages API with retry logic.
 * @param {string} systemPrompt - The system prompt.
 * @param {string} userMessage - The user message content.
 * @param {number} [maxTokens] - Max tokens in the response (default: 1024).
 * @return {string|null} The assistant's text response, or null on failure.
 */
function callClaude(systemPrompt, userMessage, maxTokens) {
  var apiKey = getConfig('ANTHROPIC_API_KEY');
  if (!apiKey) {
    logError('callClaude', 'No ANTHROPIC_API_KEY configured');
    return null;
  }

  var model = getConfig('CLAUDE_MODEL') || CLAUDE_MODEL;
  var tokens = maxTokens || 1024;

  var payload = {
    model: model,
    max_tokens: tokens,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage }
    ]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  return fetchWithRetry(ANTHROPIC_API_URL, options);
}

/**
 * Fetch with exponential backoff retry logic.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The UrlFetchApp options.
 * @return {string|null} The response text content, or null on failure.
 */
function fetchWithRetry(url, options) {
  var delay = INITIAL_RETRY_DELAY_MS;

  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();

      if (code === 200) {
        var body = JSON.parse(response.getContentText());
        if (body.content && body.content.length > 0) {
          return body.content[0].text;
        }
        logError('fetchWithRetry', 'Unexpected response structure: ' + response.getContentText().substring(0, 200));
        return null;
      }

      // Rate limited or server error — retry
      if (code === 429 || code >= 500) {
        console.log('API returned ' + code + ', attempt ' + (attempt + 1) + '/' + (MAX_RETRIES + 1));
        if (attempt < MAX_RETRIES) {
          Utilities.sleep(delay);
          delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
          continue;
        }
      }

      // Client error — don't retry
      logError('fetchWithRetry', 'API error ' + code + ': ' + response.getContentText().substring(0, 300));
      return null;

    } catch (e) {
      logError('fetchWithRetry attempt ' + (attempt + 1), e);
      if (attempt < MAX_RETRIES) {
        Utilities.sleep(delay);
        delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      }
    }
  }

  logError('fetchWithRetry', 'All retries exhausted');
  return null;
}

/**
 * Categorize an email using Claude.
 * @param {string} emailBody - The email body text.
 * @param {string} senderInfo - The sender's name/email.
 * @param {string} context - The brain file context.
 * @return {Object} Categorization result: {category, summary, suggestedTone}.
 */
function categorizeEmail(emailBody, senderInfo, context) {
  var systemPrompt = 'You are an email categorization assistant for a teacher. ' +
    'Analyze the incoming email and categorize it.\n\n' +
    'Context about the teacher\'s class and policies:\n' + context + '\n\n' +
    'Respond with ONLY a valid JSON object (no markdown, no code fences) with these fields:\n' +
    '- "category": one of "URGENT", "ROUTINE", or "EXCLUDED"\n' +
    '- "summary": a brief 1-2 sentence summary of the email\n' +
    '- "suggestedTone": one of "formal", "warm", "empathetic", "direct"\n\n' +
    'URGENT: medical issues, safety concerns, immediate schedule conflicts, ' +
    'complaints, accommodation requests\n' +
    'ROUTINE: general questions, homework inquiries, supply lists, ' +
    'event details, progress updates\n' +
    'EXCLUDED: marketing, newsletters, automated notifications, spam';

  var userMessage = 'From: ' + senderInfo + '\n\nEmail body:\n' + emailBody;

  var response = callClaude(systemPrompt, userMessage, 256);
  if (!response) {
    return { category: 'ROUTINE', summary: 'Unable to categorize', suggestedTone: 'warm' };
  }

  try {
    var parsed = JSON.parse(response);
    return {
      category: parsed.category || 'ROUTINE',
      summary: parsed.summary || '',
      suggestedTone: parsed.suggestedTone || 'warm'
    };
  } catch (e) {
    logError('categorizeEmail parse', e);
    return { category: 'ROUTINE', summary: response.substring(0, 100), suggestedTone: 'warm' };
  }
}

/**
 * Draft a reply to an email using Claude.
 * @param {string} emailBody - The original email body.
 * @param {string} senderInfo - The sender's name/email.
 * @param {Object|null} studentInfo - Student record from roster (or null).
 * @param {string} context - The brain file context.
 * @param {Object} categorization - Result from categorizeEmail().
 * @return {string} The draft reply text.
 */
function draftReply(emailBody, senderInfo, studentInfo, context, categorization) {
  var studentContext = '';
  if (studentInfo) {
    studentContext = '\n\nStudent information from roster:\n' +
      '- Name: ' + (studentInfo['Student Name'] || 'Unknown') + '\n' +
      '- Grade: ' + (studentInfo['Grade'] || 'N/A') + '\n' +
      '- Section: ' + (studentInfo['Section'] || 'N/A') + '\n' +
      '- Status: ' + (studentInfo['Status'] || 'Active') + '\n' +
      '- Notes: ' + (studentInfo['Notes'] || 'None');
  }

  var teacherEmail = getConfig('TEACHER_EMAIL') || '';

  var systemPrompt = 'You are drafting an email reply on behalf of a teacher. ' +
    'Write in the teacher\'s voice — professional, ' + categorization.suggestedTone + ', ' +
    'and helpful. The teacher will review and edit before sending.\n\n' +
    'Important guidelines:\n' +
    '- Reference relevant policies, FAQs, or information from the knowledge base when applicable\n' +
    '- Personalize the response using student info if available\n' +
    '- Keep the tone appropriate for the category (' + categorization.category + ')\n' +
    '- For URGENT emails, acknowledge the urgency and provide clear next steps\n' +
    '- For ROUTINE emails, be helpful and concise\n' +
    '- Do NOT include a subject line — this is a reply\n' +
    '- Do NOT include email headers (To, From, etc.)\n' +
    '- Sign off naturally (e.g., "Best regards," or "Thank you,")\n' +
    '- Do NOT include the teacher\'s full email signature — the teacher will add it\n\n' +
    'Teacher\'s knowledge base and class context:\n' + context +
    studentContext;

  var userMessage = 'Please draft a reply to this email.\n\n' +
    'From: ' + senderInfo + '\n' +
    'Category: ' + categorization.category + '\n' +
    'Summary: ' + categorization.summary + '\n\n' +
    'Original email:\n' + emailBody;

  var response = callClaude(systemPrompt, userMessage, 1024);
  if (!response) {
    return 'Thank you for your email. I will review this and get back to you shortly.\n\nBest regards';
  }

  return response;
}
