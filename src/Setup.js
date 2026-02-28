/**
 * Setup.js — One-time setup: properties, labels, triggers, roster sheet
 *
 * Run runFullSetup() from the Apps Script editor (select it in the function
 * dropdown and click Run). It will prompt for OAuth authorization on first run.
 * No CLI tools required — everything runs in the browser.
 */

/**
 * Store all configuration values in ScriptProperties.
 *
 * >>> BEFORE RUNNING: Replace the placeholder values below with your own <<<
 *
 *   ANTHROPIC_API_KEY  - Your Anthropic API key from console.anthropic.com
 *   BRAIN_DOC_ID       - Google Doc ID of your "brain file" (the long string
 *                        in the URL between /d/ and /edit)
 *   DRIVE_FOLDER_ID    - (Optional) Google Drive folder ID with supplemental
 *                        PDFs and Slides. Leave as '' to skip.
 *   TEACHER_EMAIL      - The Gmail address the bot runs on
 *   TEACHER_NAME       - Your name, used as the email signature (e.g., "Louis Migault")
 *   REPLY_LANGUAGE     - Language for replies (e.g., "French", "English"). Default: English
 *   SCHOOL_TIMEZONE    - Your timezone (default: America/New_York)
 *                        Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
 *
 * @param {Object} [config] - Optional config overrides.
 */
function setupScriptProperties(config) {
  var defaults = {
    ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY',   // <-- replace
    BRAIN_DOC_ID: 'YOUR_BRAIN_DOC_ID',             // <-- replace
    DRIVE_FOLDER_ID: '',                            // <-- optional
    TEACHER_EMAIL: 'YOUR_EMAIL',                    // <-- replace
    TEACHER_NAME: 'YOUR_NAME',                      // <-- replace (used as email signature)
    REPLY_LANGUAGE: 'English',                      // <-- change to 'French', etc.
    CLAUDE_MODEL: CLAUDE_MODEL,
    SCHOOL_TIMEZONE: 'America/New_York'             // <-- change if needed
  };
  var props = config || defaults;
  var scriptProps = PropertiesService.getScriptProperties();
  Object.keys(props).forEach(function(key) {
    if (props[key]) {
      scriptProps.setProperty(key, props[key]);
    }
  });
  console.log('Script properties configured successfully.');
  console.log('IMPORTANT: Edit setupScriptProperties() with your actual values before running.');
}

/**
 * Create all Gmail labels used by the bot.
 * Uses getOrCreateLabel from GmailHelper.js.
 */
function createLabels() {
  var labelNames = [
    LABEL_NAMES.PROCESSED,
    LABEL_NAMES.NEEDS_REVIEW,
    LABEL_NAMES.URGENT,
    LABEL_NAMES.ROUTINE,
    LABEL_NAMES.EXCLUDED
  ];
  labelNames.forEach(function(name) {
    getOrCreateLabel(name);
    console.log('Label ready: ' + name);
  });
  console.log('All labels created/verified.');
}

/**
 * Create the Student Roster spreadsheet with two tabs.
 * Stores the spreadsheet ID in ScriptProperties.
 * @return {string} The URL of the created spreadsheet.
 */
function createRosterSheet() {
  var ss = SpreadsheetApp.create('Gmail Reply Bot — Student Roster');

  // Set up Student Roster tab (Sheet1 is already there)
  var rosterSheet = ss.getSheets()[0];
  rosterSheet.setName('Student Roster');
  rosterSheet.appendRow([
    'Student Name', 'Student Email', 'Parent Email',
    'Grade', 'Section', 'Status', 'Notes'
  ]);
  rosterSheet.getRange('1:1').setFontWeight('bold');
  rosterSheet.setFrozenRows(1);

  // Set up Exclusions tab
  var exclusionSheet = ss.insertSheet('Exclusions');
  exclusionSheet.appendRow(['Email Address', 'Reason', 'Date Added']);
  exclusionSheet.getRange('1:1').setFontWeight('bold');
  exclusionSheet.setFrozenRows(1);

  // Store the spreadsheet ID
  var ssId = ss.getId();
  PropertiesService.getScriptProperties().setProperty('ROSTER_SHEET_ID', ssId);

  var url = ss.getUrl();
  console.log('Roster spreadsheet created: ' + url);
  console.log('Spreadsheet ID stored in ScriptProperties as ROSTER_SHEET_ID');
  return url;
}

/**
 * Create time-based triggers for processEmails.
 * Deletes any existing triggers for that function first.
 */
function createTriggers() {
  var timezone = getConfig('SCHOOL_TIMEZONE') || 'America/New_York';

  // Delete existing triggers for processEmails
  var existingTriggers = ScriptApp.getProjectTriggers();
  existingTriggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processEmails') {
      ScriptApp.deleteTrigger(trigger);
      console.log('Deleted existing trigger for processEmails');
    }
  });

  // Create three daily triggers: 8 AM, 12 PM, 6 PM
  var hours = [8, 12, 18];
  hours.forEach(function(hour) {
    ScriptApp.newTrigger('processEmails')
      .timeBased()
      .atHour(hour)
      .nearMinute(0)
      .everyDays(1)
      .inTimezone(timezone)
      .create();
    console.log('Trigger created for processEmails at ' + hour + ':00 ' + timezone);
  });

  console.log('All triggers installed.');
}

/**
 * Run the complete setup sequence.
 * Call this from the Apps Script editor after pasting all code files.
 *
 * IMPORTANT: Before running, edit setupScriptProperties() above
 * with your actual Anthropic API key, Brain Doc ID, etc.
 */
function runFullSetup() {
  console.log('=== Starting Full Setup ===');

  // Step 1: Store configuration
  console.log('\n--- Step 1: Script Properties ---');
  setupScriptProperties();

  // Step 2: Create Gmail labels
  console.log('\n--- Step 2: Gmail Labels ---');
  createLabels();

  // Step 3: Create roster spreadsheet
  console.log('\n--- Step 3: Roster Spreadsheet ---');
  var sheetUrl = createRosterSheet();

  // Step 4: Install triggers
  console.log('\n--- Step 4: Time-based Triggers ---');
  createTriggers();

  console.log('\n=== Setup Complete ===');
  console.log('Roster spreadsheet: ' + sheetUrl);
  console.log('\nNext steps:');
  console.log('1. Open the roster spreadsheet and add your students');
  console.log('2. Add exclusion emails if needed');
  console.log('3. Send a test email to yourself');
  console.log('4. Run processEmails() manually to test');
  console.log('5. Check Drafts folder for the generated reply');
}
