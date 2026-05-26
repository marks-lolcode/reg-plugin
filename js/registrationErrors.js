// ============================================================================
// Registration Failure Error Handling
// ============================================================================
// Manages error messages for failed registration forwarding attempts.
// Stores error state in chrome.storage.local and displays user-friendly alerts
// in the popup when the forwarding process fails.
// ============================================================================

// Error message templates - user-friendly language for common failure scenarios
const ERROR_MESSAGES = {
  NO_VALID_EVENT: {
    title: "No event found",
    detail: "We couldn't locate your current event. Please make sure you're viewing the correct account page.",
    action: "Try refreshing the page and clicking the extension icon again"
  },
  
  NO_SUCCEEDED_REGISTRATION: {
    title: "No active registrations found",
    detail: "This attendee doesn't have any confirmed registrations for the current event.",
    action: "Verify the attendee is registered for this event in Neon"
  },
  
  NAVIGATION_FAILED: {
    title: "Navigation error",
    detail: "We couldn't navigate to the registration page automatically.",
    action: "Navigate to the event registrations page manually and try again"
  },
  
  SCRIPT_INJECTION_FAILED: {
    title: "Unable to read account data",
    detail: "The extension encountered a technical issue reading the page.",
    action: "Refresh the page and try clicking the extension icon again"
  },
  
  TIMEOUT: {
    title: "Request took too long",
    detail: "The page didn't load quickly enough. This can happen if you're on a slow connection.",
    action: "Wait a moment and try again"
  },
  
  UNKNOWN_ERROR: {
    title: "Something went wrong",
    detail: "An unexpected error occurred while processing your request.",
    action: "Try refreshing the page and try again. If the problem persists, contact IT"
  }
};

/**
 * Log an error and store it for display in the popup
 * @param {string} errorType - Key from ERROR_MESSAGES (e.g., 'NO_VALID_EVENT')
 * @param {Error|string} originalError - The underlying error object or message
 * @param {Object} context - Additional context data (accountId, eventIds, etc)
 */
async function recordRegistrationError(errorType, originalError, context = {}) {
  const timestamp = Date.now();
  
  // Log to console with full error details for debugging
  console.error(
    `[RegistrationError] ${errorType}`,
    {
      message: originalError?.message || originalError,
      stack: originalError?.stack,
      context
    }
  );

  // Get the user-friendly message template
  const messageTemplate = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;

  // Build the error object that will be displayed in the popup
  const errorState = {
    type: errorType,
    timestamp,
    title: messageTemplate.title,
    detail: messageTemplate.detail,
    action: messageTemplate.action,
    // Store original error details for IT support
    debugInfo: {
      originalMessage: originalError?.message || String(originalError),
      context
    }
  };

  // Store in chrome.storage.local so the popup can read and display it
  await chrome.storage.local.set({ REGISTRATION_ERROR: errorState });

  return errorState;
}

/**
 * Clear any stored error from chrome.storage
 * Call this when the user dismisses the error or successfully completes an action
 */
async function clearRegistrationError() {
  console.log('[RegistrationError] Clearing error state');
  await chrome.storage.local.remove('REGISTRATION_ERROR');
}

/**
 * Retrieve the current error state from storage
 * @returns {Object|null} The error object if one exists, null otherwise
 */
async function getRegistrationError() {
  const result = await chrome.storage.local.get('REGISTRATION_ERROR');
  return result.REGISTRATION_ERROR || null;
}