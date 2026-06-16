// HR view controller

let api = null;
let currentSubmission = null;

// Initialize HR module
export function initHR(apiHelper) {
  api = apiHelper;

  // Event Listeners
  document.getElementById('btn-new-assignment').addEventListener('click', openAssignmentModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeAssignmentModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeAssignmentModal);
  document.getElementById('assignment-creation-form').addEventListener('submit', handleCreateAssignment);
  
  // Drawer events
  document.getElementById('btn-close-drawer').addEventListener('click', closeReviewDrawer);
  document.getElementById('tab-btn-transcript').addEventListener('click', () => switchDrawerTab('transcript'));
  document.getElementById('tab-btn-report').addEventListener('click', () => switchDrawerTab('report'));
  
  // Force grading action in drawer
  document.getElementById('btn-drawer-force-grade').addEventListener('click', handleForceGrading);
}

// Load HR Dashboard data
export async function loadHRDashboard() {
  try {
    const submissions = await api.get('/api/submissions');
    renderStats(submissions);
    renderSubmissionsTable(submissions);
  } catch (err) {
    console.error('Error loading HR data:', err);
  }
}

// Render Stats Cards
function renderStats(submissions) {
  const total = submissions.length;
  const pending = submissions.filter(s => s.status === 'Action Required').length;
  const graded = submissions.filter(s => s.status === 'Graded').length;

  document.getElementById('stat-total-submissions').textContent = total;
  document.getElementById('stat-pending-clarifications').textContent = pending;
  document.getElementById('stat-graded').textContent = graded;
}

// Render Submissions Table
function renderSubmissionsTable(submissions) {
  const tbody = document.getElementById('hr-submissions-tbody');
  
  if (submissions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center table-empty">No candidate submissions found yet.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  
  // Cache assignments mapping to titles
  const assignmentMap = {};

  submissions.forEach(sub => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    
    // Status badge class mapping
    let statusClass = 'status-reviewing';
    if (sub.status === 'Action Required') statusClass = 'status-action';
    if (sub.status === 'Graded') statusClass = 'status-graded';

    // Format date
    const date = new Date(sub.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    tr.innerHTML = `
      <td><strong>${escapeHtml(sub.employee_name)}</strong></td>
      <td class="sub-assignment-title" data-aid="${sub.assignment_id}">Loading title...</td>
      <td>${date}</td>
      <td><span class="status-badge ${statusClass}">${sub.status}</span></td>
      <td class="table-grade">${sub.grade ? sub.grade : '<span style="color:#6b7280;">—</span>'}</td>
      <td class="text-right">
        <button class="btn btn-secondary btn-sm btn-view-submission" data-sid="${sub.id}">
          Review
        </button>
      </td>
    `;

    // Row click opens drawer
    tr.addEventListener('click', (e) => {
      // Don't open if clicked specifically on the button (which also triggers)
      if (e.target.tagName !== 'BUTTON') {
        openReviewDrawer(sub.id);
      }
    });

    tr.querySelector('.btn-view-submission').addEventListener('click', () => {
      openReviewDrawer(sub.id);
    });

    tbody.appendChild(tr);
    
    // Fetch and cache assignment title asynchronously
    getAssignmentTitle(sub.assignment_id, tr.querySelector('.sub-assignment-title'));
  });
}

// Helper to fetch/display assignment title
const assignmentTitleCache = {};
async function getAssignmentTitle(id, element) {
  if (assignmentTitleCache[id]) {
    element.textContent = assignmentTitleCache[id];
    return;
  }
  try {
    const assignment = await api.get(`/api/assignments/${id}`);
    assignmentTitleCache[id] = assignment.title;
    element.textContent = assignment.title;
  } catch (err) {
    element.textContent = 'Unknown Assignment';
  }
}

// Assignment Modal functions
function openAssignmentModal() {
  const modal = document.getElementById('modal-assignment');
  modal.classList.add('active');
}

function closeAssignmentModal() {
  const modal = document.getElementById('modal-assignment');
  modal.classList.remove('active');
  document.getElementById('assignment-creation-form').reset();
}

async function handleCreateAssignment(e) {
  e.preventDefault();
  const title = document.getElementById('assignment-title-input').value;
  const description = document.getElementById('assignment-desc-input').value;

  try {
    await api.post('/api/assignments', { title, description });
    closeAssignmentModal();
    // Dispatch event to update assignment selectors
    window.dispatchEvent(new CustomEvent('assignment-created'));
    // Refresh stats if in HR view
    loadHRDashboard();
  } catch (err) {
    alert('Failed to publish problem statement: ' + err.message);
  }
}

// Drawer review functions
async function openReviewDrawer(submissionId) {
  const drawer = document.getElementById('drawer-review');
  drawer.classList.add('active');
  
  // Set loading state
  document.getElementById('drawer-candidate-name').textContent = 'Loading...';
  document.getElementById('drawer-assignment-title').textContent = '';
  document.getElementById('drawer-chat-log').innerHTML = '<p class="text-center table-empty">Loading transcript...</p>';
  document.getElementById('drawer-report-feedback').innerHTML = '<p class="text-center table-empty">Loading grade report...</p>';
  document.getElementById('drawer-grading-actions').classList.add('hidden');

  switchDrawerTab('transcript');

  try {
    const sub = await api.get(`/api/submissions/${submissionId}`);
    currentSubmission = sub;
    
    const assignment = await api.get(`/api/assignments/${sub.assignment_id}`);

    // Populate drawer elements
    document.getElementById('drawer-candidate-name').textContent = sub.employee_name;
    document.getElementById('drawer-assignment-title').textContent = assignment.title;
    
    // Status & date in report tab
    const statusBadge = document.getElementById('drawer-status-badge');
    statusBadge.textContent = sub.status;
    statusBadge.className = 'status-badge'; // clear other statuses
    if (sub.status === 'Reviewing') statusBadge.classList.add('status-reviewing');
    if (sub.status === 'Action Required') statusBadge.classList.add('status-action');
    if (sub.status === 'Graded') statusBadge.classList.add('status-graded');

    const formattedDate = new Date(sub.created_at).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    document.getElementById('drawer-date-display').textContent = formattedDate;

    // Chat transcript render
    renderDrawerTranscript(sub.chat_history);

    // Grade and report render
    const gradeDisplay = document.getElementById('drawer-grade-display');
    const reportFeedback = document.getElementById('drawer-report-feedback');
    const actionsBox = document.getElementById('drawer-grading-actions');

    if (sub.status === 'Graded') {
      gradeDisplay.textContent = sub.grade;
      gradeDisplay.parentElement.style.display = 'flex';
      
      // Use marked library if loaded, fallback to simple parser
      if (window.marked && window.marked.parse) {
        reportFeedback.innerHTML = window.marked.parse(sub.feedback);
      } else {
        reportFeedback.innerHTML = simpleMarkdownParser(sub.feedback);
      }
      actionsBox.classList.add('hidden');
    } else {
      gradeDisplay.textContent = '—';
      gradeDisplay.parentElement.style.display = 'flex';
      reportFeedback.innerHTML = `
        <div class="text-center table-empty" style="padding: 20px 0;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-action); margin-bottom:12px;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p><strong>Evaluation in Progress</strong></p>
          <p style="font-size:0.85rem; margin-top:4px;">The employee is currently collaborating with the AI Evaluator to explain their implementation choices.</p>
        </div>
      `;
      // Show "Force Grading" option to HR if they want to override the chat session
      actionsBox.classList.remove('hidden');
    }

  } catch (err) {
    console.error('Error opening submission in drawer:', err);
    document.getElementById('drawer-candidate-name').textContent = 'Error Loading Submission';
  }
}

function closeReviewDrawer() {
  const drawer = document.getElementById('drawer-review');
  drawer.classList.remove('active');
  currentSubmission = null;
}

// Drawer tabs helper
function switchDrawerTab(tabName) {
  document.getElementById('tab-btn-transcript').classList.toggle('active', tabName === 'transcript');
  document.getElementById('tab-btn-report').classList.toggle('active', tabName === 'report');
  
  document.getElementById('tab-content-transcript').classList.toggle('active', tabName === 'transcript');
  document.getElementById('tab-content-report').classList.toggle('active', tabName === 'report');
}

// Render Chat history in drawer
function renderDrawerTranscript(chatHistory) {
  const container = document.getElementById('drawer-chat-log');
  
  if (!chatHistory || chatHistory.length === 0) {
    container.innerHTML = '<p class="text-center table-empty">No chat history available. Submission has just been created.</p>';
    return;
  }

  container.innerHTML = '';
  chatHistory.forEach(msg => {
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = `chat-bubble-container ${msg.sender === 'ai' ? 'ai' : 'employee'}`;
    
    const senderName = msg.sender === 'ai' ? 'AI Evaluator' : 'Employee';
    
    bubbleContainer.innerHTML = `
      <span class="chat-sender-label">${senderName}</span>
      <div class="chat-bubble">${escapeHtml(msg.text)}</div>
    `;
    container.appendChild(bubbleContainer);
  });
  
  // scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Force grading handler
async function handleForceGrading() {
  if (!currentSubmission) return;
  
  const btn = document.getElementById('btn-drawer-force-grade');
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> <span>AI is evaluating...</span>';

  try {
    const updatedSub = await api.post(`/api/submissions/${currentSubmission.id}/finalize`);
    // Refresh display
    openReviewDrawer(updatedSub.id);
    loadHRDashboard();
  } catch (err) {
    alert('AI Grading failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

// Basic markdown-to-HTML formatter fallback
export function simpleMarkdownParser(markdownText) {
  if (!markdownText) return '';
  let html = markdownText
    // Headings
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    // Bold
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    // Bullet points
    .replace(/^\- (.*$)/gim, '<li>$1</li>');
  
  // Wrap list items in <ul>
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
  // Paragraphs
  html = html.replace(/([^>\r\n]+?)(\r\n|\n)/gim, '<p>$1</p>');
  
  return html;
}

// HTML Escaper helper
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
