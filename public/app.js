import { initHR, loadHRDashboard } from './hr.js';
import { initEmployee, loadAssignments } from './employee.js';

// Central API fetch helper
const apiHelper = {
  async get(url) {
    const res = await fetch(url);
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
        'Content-Type': 'application/json'
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
    
    // Load Employee assignments
    loadAssignments();
  });

  btnHr.addEventListener('click', () => {
    btnHr.classList.add('active');
    btnEmployee.classList.remove('active');
    
    secHr.classList.add('active');
    secEmployee.classList.remove('active');
    secHr.classList.remove('hidden');
    secEmployee.classList.add('hidden');
    
    // Load HR log list
    loadHRDashboard();
  });

  // Background update listener when submissions are made in Employee Portal
  window.addEventListener('submission-made', () => {
    if (secHr.classList.contains('active')) {
      loadHRDashboard();
    }
  });
}

// Check Backend Connection Status
async function checkConnectivity() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('api-status-text');

  try {
    // Attempt assignments fetch as a simple health check
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
  // Init sub-modules
  initHR(apiHelper);
  initEmployee(apiHelper);
  
  // Set up view router
  setupRouting();
  
  // Health checks
  checkConnectivity();
  setInterval(checkConnectivity, 15000); // Poll every 15s
  
  console.log('GradeAI Web App initialized.');
});
