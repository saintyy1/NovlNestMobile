/**
 * Translates technical Firebase/System errors into user-friendly messages.
 */
export const getFriendlyErrorMessage = (error: any, context?: string): string => {
  console.error(`[Error Context: ${context}]`, error);

  const message = error?.message || '';
  const code = error?.code || '';

  // 1. Document Size Limit (Firestore 1MB limit)
  if (
    message.includes('Maximum document size exceeded') ||
    message.includes('too large') ||
    (code === 'invalid-argument' && message.includes('size'))
  ) {
    return 'This novel has become too large to store more chapters in one go. Try adding fewer chapters at once, or contact support if the issue persists.';
  }

  // 2. Network/Connection Issues
  if (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    message.toLowerCase().includes('network request failed') ||
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('timeout')
  ) {
    return 'Connection issue. Please check your internet and try again.';
  }

  // 3. Permission/Auth Issues
  if (code === 'permission-denied') {
    return 'You don\'t have permission to perform this action. Make sure you are logged in as the author.';
  }

  if (code === 'unauthenticated') {
    return 'Your session has expired. Please log in again.';
  }

  // 4. Rate Limiting
  if (code === 'resource-exhausted') {
    return 'System is temporarily busy. Please wait a moment and try again.';
  }

  // 5. Specific context fallbacks
  if (context === 'add_chapter') return 'Failed to add chapters. Please check your connection or try again later.';
  if (context === 'edit_chapter') return 'Failed to update chapter. Your changes might be too large or there\'s a connection issue.';
  if (context === 'submit_work') return 'Failed to submit your work. Please try again.';

  return 'Something went wrong. Please try again or contact support if the problem persists.';
};
