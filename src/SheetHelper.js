/**
 * SheetHelper.js — Student roster and exclusion list reading
 */

/**
 * Read the Student Roster tab and return an array of student objects.
 * Each object has keys matching the header row.
 * @return {Object[]} Array of student records.
 */
function getStudentRoster() {
  var sheetId = getConfig('ROSTER_SHEET_ID');
  if (!sheetId) {
    console.log('No ROSTER_SHEET_ID configured — returning empty roster');
    return [];
  }

  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Student Roster');
    if (!sheet) {
      console.log('Student Roster tab not found');
      return [];
    }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return []; // Only header row or empty

    var headers = data[0];
    var roster = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      // Skip empty rows
      if (!row[0] && !row[1]) continue;
      var record = {};
      headers.forEach(function(header, idx) {
        record[header] = row[idx] || '';
      });
      roster.push(record);
    }

    console.log('Loaded ' + roster.length + ' students from roster');
    return roster;
  } catch (e) {
    logError('getStudentRoster', e);
    return [];
  }
}

/**
 * Read the Exclusions tab and return an array of excluded email addresses.
 * @return {string[]} Array of lowercase email addresses.
 */
function getExclusionList() {
  var sheetId = getConfig('ROSTER_SHEET_ID');
  if (!sheetId) return [];

  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Exclusions');
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var exclusions = [];
    for (var i = 1; i < data.length; i++) {
      var email = data[i][0];
      if (email) {
        exclusions.push(String(email).toLowerCase().trim());
      }
    }

    console.log('Loaded ' + exclusions.length + ' exclusions');
    return exclusions;
  } catch (e) {
    logError('getExclusionList', e);
    return [];
  }
}

/**
 * Find a student record matching the sender email.
 * Checks both Student Email and Parent Email columns.
 * @param {string} email - The sender's email address.
 * @param {Object[]} roster - The student roster array.
 * @return {Object|null} The matching student record, or null.
 */
function lookupStudent(email, roster) {
  if (!email || !roster || roster.length === 0) return null;

  var lowerEmail = email.toLowerCase().trim();
  for (var i = 0; i < roster.length; i++) {
    var studentEmail = String(roster[i]['Student Email'] || '').toLowerCase().trim();
    var parentEmail = String(roster[i]['Parent Email'] || '').toLowerCase().trim();
    if (studentEmail === lowerEmail || parentEmail === lowerEmail) {
      return roster[i];
    }
  }
  return null;
}

/**
 * Check if an email is on the exclusion list.
 * @param {string} email - The email address to check.
 * @param {string[]} exclusions - Array of excluded email addresses.
 * @return {boolean} True if the email is excluded.
 */
function isExcluded(email, exclusions) {
  if (!email || !exclusions) return false;
  return exclusions.indexOf(email.toLowerCase().trim()) !== -1;
}
