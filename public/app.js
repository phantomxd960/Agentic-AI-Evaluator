import { initHR, loadHRDashboard } from './hr.js';
import { initEmployee, loadAssignments } from './employee.js';
import { getCurrentUser, getAuthHeaders } from './session.js';

// Central API fetch helper (updated with authorization headers)
const apiHelper = {
  async get(url) {
    const res = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network response error' }));
      throw new Error(err.error || `GET request failed for ${url}`);
    }
    return await res.json();
  },

  async post(url, data = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network response error' }));
      throw new Error(err.error || `POST request failed for ${url}`);
    }
    return await res.json();
  }
};

// Mode Routing Configuration
function setupRouting() {
  const btnEmployee = document.getElementById('nav-btn-employee');
  const btnHr = document.getElementById('nav-btn-hr');
  
  const secEmployee = document.getElementById('section-employee');
  const secHr = document.getElementById('section-hr');

  btnEmployee.addEventListener('click', () => {
    btnEmployee.classList.add('active');
    btnHr.classList.remove('active');
    
    secEmployee.classList.add('active');
    secHr.classList.remove('active');
    secEmployee.classList.remove('hidden');
    secHr.classList.add('hidden');
    
    loadAssignments();
  });

  btnHr.addEventListener('click', () => {
    btnHr.classList.add('active');
    btnEmployee.classList.remove('active');
    
    secHr.classList.add('active');
    secEmployee.classList.remove('active');
    secHr.classList.remove('hidden');
    secEmployee.classList.add('hidden');
    
    loadHRDashboard();
  });

  // Background update listener when submissions are made in Employee Portal
  window.addEventListener('submission-made', () => {
    if (secHr.classList.contains('active')) {
      loadHRDashboard();
    }
  });

  // Logout listener
  document.getElementById('btn-logout').addEventListener('click', logoutUser);
}

// User Authentication Orchestration
let isRegisterMode = false;

function setupAuthentication() {
  const tabEmployee = document.getElementById('tab-login-employee');
  const tabHr = document.getElementById('tab-login-hr');
  
  const panelEmployee = document.getElementById('panel-employee-login');
  const panelHr = document.getElementById('panel-hr-login');
  
  const linkToggle = document.getElementById('link-toggle-register');
  const hintText = document.getElementById('auth-hint-text');
  const btnEmpSubmit = document.getElementById('btn-employee-auth-submit');
  
  // Toggle Employee / HR Tabs
  tabEmployee.addEventListener('click', () => {
    tabEmployee.classList.add('active');
    tabHr.classList.remove('active');
    panelEmployee.classList.add('active');
    panelHr.classList.remove('active');
  });

  tabHr.addEventListener('click', () => {
    tabHr.classList.add('active');
    tabEmployee.classList.remove('active');
    panelHr.classList.add('active');
    panelEmployee.classList.remove('active');
  });

  // Toggle Register / Login mode
  linkToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
      hintText.textContent = 'Already have an account?';
      linkToggle.textContent = 'Log In';
      btnEmpSubmit.querySelector('span').textContent = 'Register Account';
    } else {
      hintText.textContent = 'New candidate?';
      linkToggle.textContent = 'Register Account';
      btnEmpSubmit.querySelector('span').textContent = 'Log In';
    }
  });

  // Form Submissions
  document.getElementById('form-employee-auth').addEventListener('submit', handleEmployeeAuth);
  document.getElementById('form-hr-auth').addEventListener('submit', handleHrAuth);
}

// Handle Employee Auth (Login or Register)
async function handleEmployeeAuth(e) {
  e.preventDefault();
  const username = document.getElementById('input-emp-username').value.trim();
  const password = document.getElementById('input-emp-password').value;
  
  const btn = document.getElementById('btn-employee-auth-submit');
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>';

  try {
    if (isRegisterMode) {
      // Create user account
      await apiHelper.post('/api/auth/register', { username, password });
      console.log('Employee registered:', username);
    }
    
    // Log in
    const session = await apiHelper.post('/api/auth/login', { username, password });
    loginSuccess(session);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

// Handle HR Administrator Auth
async function handleHrAuth(e) {
  e.preventDefault();
  const email = document.getElementById('input-hr-email').value.trim();
  const password = document.getElementById('input-hr-password').value;

  const btn = e.target.querySelector('button[type="submit"]');
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>';

  try {
    // HR credentials login
    const session = await apiHelper.post('/api/auth/login', { username: email, password });
    loginSuccess(session);
  } catch (err) {
    alert(err.message || 'Invalid administrator password.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

// On Authentication Success
function loginSuccess(userSession) {
  localStorage.setItem('currentUser', JSON.stringify(userSession));
  
  // Hide login screen
  document.getElementById('login-overlay').classList.remove('active');
  
  // Configure sidebar Profile box
  const profileBox = document.getElementById('sidebar-profile-box');
  document.getElementById('user-display-name').textContent = userSession.username;
  document.getElementById('user-display-role').textContent = userSession.role;
  profileBox.classList.remove('hidden');

  // Configure Navigation elements based on User Roles
  const btnEmployee = document.getElementById('nav-btn-employee');
  const btnHr = document.getElementById('nav-btn-hr');

  if (userSession.role === 'hr') {
    btnHr.classList.remove('hidden');
    btnEmployee.classList.add('hidden');
    
    // Trigger HR dashboard view
    btnHr.click();
  } else {
    btnEmployee.classList.remove('hidden');
    btnHr.classList.add('hidden');
    
    // Trigger Employee Portal view
    btnEmployee.click();
  }
}

// Log Out User
function logoutUser() {
  localStorage.removeItem('currentUser');
  
  // Clear forms
  document.getElementById('form-employee-auth').reset();
  document.getElementById('form-hr-auth').reset();
  
  // Hide dashboards, reveal login
  document.getElementById('sidebar-profile-box').classList.add('hidden');
  document.getElementById('nav-btn-employee').classList.add('hidden');
  document.getElementById('nav-btn-hr').classList.add('hidden');
  
  document.getElementById('section-employee').classList.add('hidden');
  document.getElementById('section-hr').classList.add('hidden');
  
  document.getElementById('login-overlay').classList.add('active');
  
  // Reset modes
  isRegisterMode = false;
  document.getElementById('auth-hint-text').textContent = 'New candidate?';
  document.getElementById('link-toggle-register').textContent = 'Register Account';
  document.getElementById('btn-employee-auth-submit').querySelector('span').textContent = 'Log In';
}

// Check Backend Connection Status
async function checkConnectivity() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('api-status-text');

  try {
    await apiHelper.get('/api/assignments');
    dot.style.backgroundColor = 'var(--color-graded)';
    dot.style.boxShadow = '0 0 8px var(--color-graded)';
    text.textContent = 'Server Connected';
  } catch (err) {
    dot.style.backgroundColor = '#ef4444';
    dot.style.boxShadow = '0 0 8px #ef4444';
    text.textContent = 'Server Offline';
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Init modules
  initHR(apiHelper);
  initEmployee(apiHelper);
  
  // Routing & Auth configurations
  setupRouting();
  setupAuthentication();
  
  // Check session persistence
  const cachedUser = getCurrentUser();
  if (cachedUser) {
    loginSuccess(cachedUser);
  } else {
    document.getElementById('login-overlay').classList.add('active');
  }

  // Connectivity
  checkConnectivity();
  setInterval(checkConnectivity, 15000);
  
  console.log('GradeAI Web App initialized.');
});
