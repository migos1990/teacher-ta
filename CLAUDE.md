# Gmail Reply Bot — Google Apps Script

## What this project does
A Gmail automation bot for university professors that reads incoming student
and colleague emails, uses the Anthropic Claude API to categorize them (with
university-specific subcategories like grade appeals, extension requests,
recommendation letters, etc.) and draft context-aware replies, then creates
Gmail drafts for professor review. Runs 3x/day via time-based triggers.

## Tech stack
- Google Apps Script (V8 runtime, JavaScript only — no TypeScript)
- Local development via clasp CLI (`clasp push` to deploy)
- External API: Anthropic Messages API via UrlFetchApp
- Advanced Drive Service v2 enabled (for PDF OCR text extraction)

## Key architecture decisions
- All code lives in src/ directory (rootDir in .clasp.json)
- No npm dependencies — Apps Script has no module system; all files share
  a single global namespace. Do NOT use import/export statements.
- Every function in every file is globally accessible
- Use PropertiesService.getScriptProperties() for all secrets and config IDs
- 6-minute execution limit per run — process emails in batches of 5-10
- Use a time-check guard: if approaching 5 min, stop and let next trigger
  pick up remaining emails

## File responsibilities
- Config.js: LABEL_NAMES (priority + subcategory labels), SEARCH_QUERY constants,
  CONFIDENCE_THRESHOLD, getConfig() wrapper
- Main.js: processEmails() entry point, orchestrates the pipeline,
  buildConversationHistory() for thread context
- GmailHelper.js: searchUnprocessedThreads(), createDraftReply(),
  getOrCreateLabel(), markAsProcessed(), applyCategory() (supports subcategories)
- SheetHelper.js: getStudentRoster(), getExclusionList(), lookupStudent(),
  getVIPContacts(), lookupVIP()
- BrainLoader.js: loadBrainDoc(), loadDriveFolder(), extractPDFText(),
  extractSlidesText(), buildContextString()
- ClaudeAPI.js: callClaude(), categorizeEmail() (returns subcategory + confidence),
  draftReply() (subcategory-aware), getSubcategoryInstructions(), fetchWithRetry()
- Setup.js: setupScriptProperties(), createLabels(), createTriggers(),
  createRosterSheet() (university columns + VIP Contacts tab), runFullSetup()
- Utils.js: extractEmailAddress(), isWithinTimeLimit(), logError(), formatHtmlReply()

## Common commands
```bash
clasp push              # Push local code to Apps Script
clasp push --watch      # Watch mode — auto-push on file save
clasp open              # Open script in browser editor
clasp logs --watch      # Stream execution logs (requires GCP project)
clasp run processEmails # Remote-execute main function (requires setup)
```

## Conventions
- Use console.log() for logging (not Logger.log()) — shows in clasp logs
- Wrap all API calls in try/catch with retry logic
- Never hardcode IDs or keys — always read from PropertiesService
- Label names use "AutoReply/" prefix (e.g., "AutoReply/Processed")
- All date handling must use explicit timezone via Utilities.formatDate()

## Critical constraints
- Apps Script global namespace: no modules, no import/export
- UrlFetchApp.fetch() is synchronous — no async/await
- GmailApp.search() returns max 500 threads; use start/max params
- Labels can only be applied to threads, not individual messages
- Time-based triggers have ±15 min precision (atHour + nearMinute)
- PropertiesService values are strings only — JSON.stringify for objects
- Drive API v2 Files.insert with ocr:true for PDF text extraction
- Must delete temporary Google Docs created during PDF OCR
