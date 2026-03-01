/**
 * Config.js — Constants and configuration helpers
 */

var LABEL_NAMES = {
  PROCESSED: 'AutoReply/Processed',
  NEEDS_REVIEW: 'AutoReply/NeedsReview',
  URGENT: 'AutoReply/Urgent',
  ROUTINE: 'AutoReply/Routine',
  EXCLUDED: 'AutoReply/Excluded',
  GRADE_APPEAL: 'AutoReply/GradeAppeal',
  EXTENSION_REQUEST: 'AutoReply/ExtensionRequest',
  REC_LETTER: 'AutoReply/RecLetter',
  RESEARCH_INQUIRY: 'AutoReply/Research',
  OFFICE_HOURS: 'AutoReply/OfficeHours',
  ACADEMIC_INTEGRITY: 'AutoReply/AcademicIntegrity',
  ADVISING: 'AutoReply/Advising',
  ADMINISTRATIVE: 'AutoReply/Administrative'
};

var CONFIDENCE_THRESHOLD = 0.7;

var SEARCH_QUERY = 'label:inbox -label:AutoReply/Processed newer_than:1d';

var BATCH_SIZE = 10;

var MAX_RUNTIME_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

var CLAUDE_MODEL = 'claude-sonnet-4-20250514';

var ANTHROPIC_API_VERSION = '2023-06-01';

var ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Get a configuration value from ScriptProperties.
 * @param {string} key - The property key to retrieve.
 * @return {string|null} The property value, or null if not set.
 */
function getConfig(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
