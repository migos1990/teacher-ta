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
 * Returns priority tier, subcategory, summary, tone, and confidence.
 * @param {string} emailBody - The email body text.
 * @param {string} senderInfo - The sender's name/email.
 * @param {string} context - The brain file context.
 * @return {Object} Categorization result with category, subcategory, summary, suggestedTone, confidence.
 */
function categorizeEmail(emailBody, senderInfo, context) {
  var replyLang = getConfig('REPLY_LANGUAGE') || 'English';

  var systemPrompt = 'You are an email categorization assistant for a university professor. ' +
    'Analyze the incoming email and categorize it.\n\n' +
    'Context about the professor\'s course and policies:\n' + context + '\n\n' +
    'Respond with ONLY a valid JSON object (no markdown, no code fences) with these fields:\n' +
    '- "category": one of "URGENT", "ROUTINE", or "EXCLUDED"\n' +
    '- "subcategory": one of "GRADE_APPEAL", "EXTENSION_REQUEST", "REC_LETTER", ' +
    '"RESEARCH_INQUIRY", "OFFICE_HOURS", "ACADEMIC_INTEGRITY", "ADVISING", ' +
    '"COURSE_LOGISTICS", "ADMINISTRATIVE", "OTHER"\n' +
    '- "summary": a brief 1-2 sentence summary of the email (write the summary in ' + replyLang + ')\n' +
    '- "suggestedTone": one of "formal", "warm", "empathetic", "direct"\n' +
    '- "confidence": a number from 0.0 to 1.0 indicating how confident you are in the categorization\n\n' +
    'URGENT: grade appeals, academic integrity issues, accommodation requests, ' +
    'emails from administration or department leadership, safety or wellness concerns, complaints\n' +
    'ROUTINE: extension requests, office hours questions, recommendation letter requests, ' +
    'advising questions, course logistics, homework questions, research inquiries, progress updates\n' +
    'EXCLUDED: marketing, newsletters, automated notifications, spam';

  var userMessage = 'From: ' + senderInfo + '\n\nEmail body:\n' + emailBody;

  var response = callClaude(systemPrompt, userMessage, 300);
  if (!response) {
    return { category: 'ROUTINE', subcategory: 'OTHER', summary: 'Unable to categorize', suggestedTone: 'warm', confidence: 0.0 };
  }

  try {
    var parsed = JSON.parse(response);
    return {
      category: parsed.category || 'ROUTINE',
      subcategory: parsed.subcategory || 'OTHER',
      summary: parsed.summary || '',
      suggestedTone: parsed.suggestedTone || 'warm',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
    };
  } catch (e) {
    logError('categorizeEmail parse', e);
    return { category: 'ROUTINE', subcategory: 'OTHER', summary: response.substring(0, 100), suggestedTone: 'warm', confidence: 0.0 };
  }
}

/**
 * Get subcategory-specific drafting instructions for university email types.
 * @param {string} subcategory - The email subcategory.
 * @return {string} Instructions for Claude, or empty string.
 */
function getSubcategoryInstructions(subcategory) {
  var instructions = {
    'GRADE_APPEAL': 'This is a grade appeal. Acknowledge the student\'s concern seriously. ' +
      'Explain the general appeals process or offer to review the work together during office hours. ' +
      'Do NOT commit to changing any grade in this email.',
    'EXTENSION_REQUEST': 'This is a deadline extension request. Be empathetic about their situation. ' +
      'Reference the course late policy from the knowledge base if available. ' +
      'If granting, state the new deadline clearly. If deferring, explain the process.',
    'REC_LETTER': 'This is a recommendation letter request. Ask for: the deadline, ' +
      'the program or position they are applying to, and any supporting materials they can share ' +
      '(resume, statement of purpose, transcript). Confirm or politely decline availability.',
    'ACADEMIC_INTEGRITY': 'THIS IS A SENSITIVE TOPIC. Do NOT discuss specific allegations, ' +
      'evidence, or outcomes in email. Ask the student to schedule an in-person or video meeting. ' +
      'Reference the university academic integrity policy in general terms only.',
    'RESEARCH_INQUIRY': 'This is a research opportunity inquiry. Be encouraging but realistic ' +
      'about current availability. Ask about their background, interests, and relevant coursework.',
    'OFFICE_HOURS': 'Reference the professor\'s current office hours schedule from the knowledge base. ' +
      'If the student needs a different time, suggest they email to arrange an appointment.',
    'ADVISING': 'This is an academic advising question. Be helpful and reference academic policies ' +
      'or degree requirements if known from the knowledge base. For complex advising matters, ' +
      'suggest scheduling a meeting.',
    'COURSE_LOGISTICS': 'This is about course logistics (schedule, materials, assignments). ' +
      'Be clear and concise. Reference the syllabus or knowledge base for factual answers.',
    'ADMINISTRATIVE': 'This is an administrative matter. Respond professionally and formally.'
  };
  return instructions[subcategory] || '';
}

/**
 * Draft a reply to an email using Claude.
 * @param {string} emailBody - The original email body.
 * @param {string} senderInfo - The sender's name/email.
 * @param {Object|null} studentInfo - Student record from roster (or null).
 * @param {Object|null} vipInfo - VIP contact record (or null).
 * @param {string} context - The brain file context.
 * @param {Object} categorization - Result from categorizeEmail().
 * @return {string} The draft reply text.
 */
function draftReply(emailBody, senderInfo, studentInfo, vipInfo, context, categorization) {
  var senderContext = '';
  if (vipInfo) {
    senderContext = '\n\nSender is a colleague/administrator:\n' +
      '- Name: ' + (vipInfo['Name'] || 'Unknown') + '\n' +
      '- Role: ' + (vipInfo['Role'] || 'N/A') + '\n' +
      '- Notes: ' + (vipInfo['Notes'] || 'None') + '\n' +
      'Use a collegial, professional tone. Do not use a student-facing tone.';
  } else if (studentInfo) {
    senderContext = '\n\nStudent information from roster:\n' +
      '- Name: ' + (studentInfo['Student Name'] || 'Unknown') + '\n' +
      '- Year: ' + (studentInfo['Year'] || 'N/A') + '\n' +
      '- Major: ' + (studentInfo['Major'] || 'N/A') + '\n' +
      '- Student ID: ' + (studentInfo['Student ID'] || 'N/A') + '\n' +
      '- Advisor: ' + (studentInfo['Advisor'] || 'N/A') + '\n' +
      '- Status: ' + (studentInfo['Status'] || 'Active') + '\n' +
      '- Accommodation Notes: ' + (studentInfo['Accommodation Notes'] || 'None') + '\n' +
      '- Notes: ' + (studentInfo['Notes'] || 'None');
  } else {
    senderContext = '\n\nSender is not in any roster (unknown sender). ' +
      'Be professional and helpful. Do not share specific student information.';
  }

  var subcatInstructions = getSubcategoryInstructions(categorization.subcategory);
  var subcatBlock = subcatInstructions
    ? '\n\nSpecific guidance for this email type (' + categorization.subcategory + '):\n' + subcatInstructions
    : '';

  var teacherName = getConfig('TEACHER_NAME') || '';
  var replyLang = getConfig('REPLY_LANGUAGE') || 'English';

  var signOffInstruction = teacherName
    ? '- End with a sign-off followed by "' + teacherName + '" on the next line\n'
    : '- Sign off naturally (e.g., "Best regards," or "Thank you,")\n';

  var systemPrompt = 'You are drafting an email reply on behalf of a university professor. ' +
    'Write the ENTIRE reply in ' + replyLang + '. ' +
    'Write in the professor\'s voice — professional, ' + categorization.suggestedTone + ', ' +
    'and helpful. The professor will review and edit before sending.\n\n' +
    'Important guidelines:\n' +
    '- Write everything in ' + replyLang + ', including the greeting and sign-off\n' +
    '- Reference relevant policies, FAQs, or information from the knowledge base when applicable\n' +
    '- Personalize the response using student or sender info if available\n' +
    '- Keep the tone appropriate for the category (' + categorization.category + ')\n' +
    '- For URGENT emails, acknowledge the urgency and provide clear next steps\n' +
    '- For ROUTINE emails, be helpful and concise\n' +
    '- Do NOT include a subject line — this is a reply\n' +
    '- Do NOT include email headers (To, From, etc.)\n' +
    signOffInstruction +
    '- Do NOT include any additional email signature beyond the name\n\n' +
    'Professor\'s knowledge base and course context:\n' + context +
    senderContext +
    subcatBlock;

  var userMessage = 'Please draft a reply to this email.\n\n' +
    'From: ' + senderInfo + '\n' +
    'Category: ' + categorization.category + '\n' +
    'Subcategory: ' + (categorization.subcategory || 'OTHER') + '\n' +
    'Summary: ' + categorization.summary + '\n\n' +
    'Original email:\n' + emailBody;

  var response = callClaude(systemPrompt, userMessage, 1024);
  if (!response) {
    var fallback = replyLang.toLowerCase() === 'french'
      ? 'Merci pour votre message. Je vais l\'examiner et vous répondre dans les meilleurs délais.\n\nCordialement'
      : 'Thank you for your email. I will review this and get back to you shortly.\n\nBest regards';
    if (teacherName) fallback += '\n' + teacherName;
    return fallback;
  }

  return response;
}
