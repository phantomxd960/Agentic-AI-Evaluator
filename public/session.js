// Independent Session & Auth Header Utility

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    return null;
  }
}

export function getAuthHeaders() {
  const user = getCurrentUser();
  if (user) {
    return {
      'x-user-role': user.role,
      'x-username': user.username
    };
  }
  return {};
}
