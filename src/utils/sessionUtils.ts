export const getOrCreateSessionId = () => {
  let sessionId = localStorage.getItem('anonymous_session_id');
  if (!sessionId) {
    sessionId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('anonymous_session_id', sessionId);
  }
  return sessionId;
};