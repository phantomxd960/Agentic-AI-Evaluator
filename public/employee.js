// Employee Portal Controller
import { simpleMarkdownParser } from './hr.js';
import { getAuthHeaders, getCurrentUser } from './app.js';

let api = null;
let selectedFiles = [];
let activeSubmission = null;

export function initEmployee(apiHelper) {
  api = apiHelper;

  // Initialize dropdown
  loadAssignments();

  // Listeners
  document.getElementById('employee-assignment-select').addEventListener('change', handleAssignmentSelect);
  
  // Drag and drop events
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  });

  // Submit files
  document.getElementById('submission-upload-form').addEventListener('submit', handleUploadSubmit);

  // Chat send events
  document.getElementById('btn-chat-send').addEventListener('click', handleSendMessage);
  document.getElementById('chat-input-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Finalize grading
  document.getElementById('btn-employee-finalize').addEventListener('click', handleFinalizeSubmission);
  
  // Restart new submission
  document.getElementById('btn-restart-submission').addEventListener('click', restartSubmissionPortal);

  // Global listener for new assignments published by HR
  window.addEventListener('assignment-created', loadAssignments);
}

// Load assignments dropdown
export async function loadAssignments() {
  const select = document.getElementById('employee-assignment-select');
  try {
    const list = await api.get('/api/assignments');
    
    // Clear list
    select.innerHTML = '<option value="" disabled selected>Select an assignment to begin...</option>';
    
    if (list.length === 0) {
      select.innerHTML = '<option value="" disabled>No assignments published by HR yet.</option>';
      return;
    }

    list.forEach(assign => {
      const opt = document.createElement('option');
      opt.value = assign.id;
      opt.textContent = assign.title;
      select.appendChild(opt);
    });

  } catch (err) {
    console.error('Error loading assignments:', err);
    select.innerHTML = '<option value="" disabled>Error loading assignments</option>';
  }
}

// Handle assignment dropdown change
async function handleAssignmentSelect(e) {
  const id = e.target.value;
  const detailsBox = document.getElementById('employee-assignment-details');
  
  detailsBox.classList.add('hidden');
  
  try {
    const assign = await api.get(`/api/assignments/${id}`);
    
    document.getElementById('employee-assignment-title').textContent = assign.title;
    document.getElementById('employee-assignment-description').textContent = assign.description;
    
    detailsBox.classList.remove('hidden');
    
    // Reset selection file state
    selectedFiles = [];
    renderFilesList();
    
    // Autofill name from current user session
    const user = getCurrentUser();
    if (user) {
      document.getElementById('employee-name-input').value = user.username;
    }
    
    validateForm();
    
    // Check if employee already has a submission for this assignment
    checkActiveSubmission(id);
  } catch (err) {
    console.error('Error loading assignment details:', err);
  }
}

// Check if there is already a submission for the current candidate name and assignment
async function checkActiveSubmission(assignmentId) {
  try {
    const subs = await api.get(`/api/submissions?assignmentId=${assignmentId}`);
    
    if (subs.length > 0) {
      // Find latest submission
      const latest = subs[0];
      activeSubmission = latest;
      transitionToConsoleState(latest);
    } else {
      // Show upload state
      document.getElementById('employee-state-upload').classList.remove('hidden');
      document.getElementById('employee-state-chat').classList.add('hidden');
      document.getElementById('employee-state-graded').classList.add('hidden');
    }
  } catch (err) {
    console.log('No active submission to restore.', err);
  }
}

// File select functions
function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    addFiles(e.target.files);
  }
}

function addFiles(filesList) {
  for (let i = 0; i < filesList.length; i++) {
    const file = filesList[i];
    // Check duplicates
    if (!selectedFiles.some(f => f.name === file.name)) {
      selectedFiles.push(file);
    }
  }
  renderFilesList();
  validateForm();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFilesList();
  validateForm();
}

function renderFilesList() {
  const container = document.getElementById('selected-files-list');
  const ul = document.getElementById('files-list-container');
  
  if (selectedFiles.length === 0) {
    container.classList.add('hidden');
    ul.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  ul.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'selected-file-item';
    
    const sizeKB = (file.size / 1024).toFixed(1);
    
    li.innerHTML = `
      <div class="file-name-meta">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-primary)">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>${escapeHtml(file.name)} <span style="color:var(--text-muted)">(${sizeKB} KB)</span></span>
      </div>
      <button type="button" class="btn-remove-file" data-idx="${index}">&times;</button>
    `;
    
    li.querySelector('.btn-remove-file').addEventListener('click', () => removeFile(index));
    ul.appendChild(li);
  });
}

function validateForm() {
  const name = document.getElementById('employee-name-input').value.trim();
  const btn = document.getElementById('btn-submit-solution');
  
  if (name.length > 0 && selectedFiles.length > 0) {
    btn.removeAttribute('disabled');
  } else {
    btn.setAttribute('disabled', 'true');
  }
}

// Watch name input
document.getElementById('employee-name-input').addEventListener('input', validateForm);

// Submit files to the server
async function handleUploadSubmit(e) {
  e.preventDefault();
  
  const assignmentId = document.getElementById('employee-assignment-select').value;
  const employeeName = document.getElementById('employee-name-input').value.trim();
  
  if (!assignmentId || !employeeName || selectedFiles.length === 0) return;

  const btn = document.getElementById('btn-submit-solution');
  const loader = document.getElementById('upload-loader');
  
  // Disable button, show loading
  btn.disabled = true;
  loader.classList.remove('hidden');
  btn.querySelector('span').textContent = 'AI is reading your work...';

  const formData = new FormData();
  formData.append('assignmentId', assignmentId);
  formData.append('employeeName', employeeName);
  
  selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  try {
    // Perform file upload with security authorization headers
    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: {
        ...getAuthHeaders()
      },
      body: formData
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Upload failed');
    }
    
    const submission = await response.json();
    activeSubmission = submission;
    
    // Transition UI
    transitionToConsoleState(submission);
    
    // Notify stats reload
    window.dispatchEvent(new CustomEvent('submission-made'));
  } catch (err) {
    alert('AI Analysis failed. Make sure your GEMINI_API_KEY is configured in your .env file!\n\nDetails: ' + err.message);
    btn.disabled = false;
    loader.classList.add('hidden');
    btn.querySelector('span').textContent = 'Submit to AI Evaluator';
  }
}

// Transition console states based on submission status
function transitionToConsoleState(sub) {
  const stateUpload = document.getElementById('employee-state-upload');
  const stateChat = document.getElementById('employee-state-chat');
  const stateGraded = document.getElementById('employee-state-graded');
  
  stateUpload.classList.add('hidden');
  stateChat.classList.add('hidden');
  stateGraded.classList.add('hidden');

  if (sub.status === 'Graded') {
    // Show Graded State
    document.getElementById('employee-final-grade').textContent = sub.grade;
    
    const reportFeedback = document.getElementById('employee-final-feedback');
    if (window.marked && window.marked.parse) {
      reportFeedback.innerHTML = window.marked.parse(sub.feedback);
    } else {
      reportFeedback.innerHTML = simpleMarkdownParser(sub.feedback);
    }
    
    stateGraded.classList.remove('hidden');
  } else {
    // Show Chat State
    document.getElementById('employee-display-name').textContent = sub.employee_name;
    document.getElementById('employee-submission-status').textContent = sub.status;
    
    // Status Badge classes
    const statusBadge = document.getElementById('employee-submission-status');
    statusBadge.className = 'status-badge';
    if (sub.status === 'Reviewing') statusBadge.classList.add('status-reviewing');
    if (sub.status === 'Action Required') statusBadge.classList.add('status-action');

    // Populate file list
    const fileUl = document.getElementById('employee-display-files');
    fileUl.innerHTML = '';
    sub.file_paths.forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.originalName;
      fileUl.appendChild(li);
    });

    renderChatMessages(sub.chat_history);
    stateChat.classList.remove('hidden');
  }
}

// Render Chat log
function renderChatMessages(chatHistory) {
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  
  chatHistory.forEach(msg => {
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = `chat-bubble-container ${msg.sender === 'ai' ? 'ai' : 'employee'}`;
    
    const senderName = msg.sender === 'ai' ? 'AI Evaluator' : 'You';
    
    bubbleContainer.innerHTML = `
      <span class="chat-sender-label">${senderName}</span>
      <div class="chat-bubble">${escapeHtml(msg.text)}</div>
    `;
    container.appendChild(bubbleContainer);
  });
  
  container.scrollTop = container.scrollHeight;
}

// Send Message handler
async function handleSendMessage() {
  const textInput = document.getElementById('chat-input-text');
  const message = textInput.value.trim();
  
  if (!message || !activeSubmission) return;

  // Clear input
  textInput.value = '';
  
  // Render employee's bubble locally first for responsiveness
  appendLocalBubble('employee', message);
  
  // Append a temporary typing indicator for AI response
  showTypingIndicator();

  try {
    const res = await api.post(`/api/submissions/${activeSubmission.id}/chat`, { message });
    
    activeSubmission = res.submission;
    
    // Remove typing indicator and render complete conversation
    hideTypingIndicator();
    renderChatMessages(activeSubmission.chat_history);
    
    // Update status badge
    const statusBadge = document.getElementById('employee-submission-status');
    statusBadge.textContent = activeSubmission.status;
    statusBadge.className = 'status-badge';
    if (activeSubmission.status === 'Reviewing') statusBadge.classList.add('status-reviewing');
    if (activeSubmission.status === 'Action Required') statusBadge.classList.add('status-action');

    // If AI indicated it's ready to grade, notify in chat or pulse the finalize button
    if (res.aiResponse.canGrade) {
      pulseFinalizeButton();
    }
  } catch (err) {
    hideTypingIndicator();
    alert('Failed to send message: ' + err.message);
  }
}

function appendLocalBubble(sender, text) {
  const container = document.getElementById('chat-messages');
  const bubbleContainer = document.createElement('div');
  bubbleContainer.className = `chat-bubble-container ${sender === 'ai' ? 'ai' : 'employee'}`;
  
  bubbleContainer.innerHTML = `
    <span class="chat-sender-label">${sender === 'ai' ? 'AI Evaluator' : 'You'}</span>
    <div class="chat-bubble">${escapeHtml(text)}</div>
  `;
  container.appendChild(bubbleContainer);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator() {
  const container = document.getElementById('chat-messages');
  
  const indicator = document.createElement('div');
  indicator.id = 'chat-typing-indicator';
  indicator.className = 'chat-bubble-container ai';
  
  indicator.innerHTML = `
    <span class="chat-sender-label">AI Evaluator</span>
    <div class="chat-bubble" style="padding: 10px 14px;">
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
  const el = document.getElementById('chat-typing-indicator');
  if (el) el.remove();
}

function pulseFinalizeButton() {
  const btn = document.getElementById('btn-employee-finalize');
  btn.classList.add('pulse-animation');
}

// Finalize grading handler
async function handleFinalizeSubmission() {
  if (!activeSubmission) return;

  const btn = document.getElementById('btn-employee-finalize');
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> <span>Grading...</span>';

  try {
    const gradedSub = await api.post(`/api/submissions/${activeSubmission.id}/finalize`);
    activeSubmission = gradedSub;
    transitionToConsoleState(gradedSub);
    
    // Dispatch event to update HR logs in background
    window.dispatchEvent(new CustomEvent('submission-made'));
  } catch (err) {
    alert('AI Grading failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

// Restart button to submit a new work
function restartSubmissionPortal() {
  activeSubmission = null;
  selectedFiles = [];
  
  // Clear forms
  document.getElementById('submission-upload-form').reset();
  
  // Clear file lists
  renderFilesList();
  
  // Reset assignment details
  const detailsBox = document.getElementById('employee-assignment-details');
  detailsBox.classList.add('hidden');
  
  // Reset dropdown
  document.getElementById('employee-assignment-select').value = '';
  
  // Reset UI back to upload state
  document.getElementById('employee-state-upload').classList.remove('hidden');
  document.getElementById('employee-state-chat').classList.add('hidden');
  document.getElementById('employee-state-graded').classList.add('hidden');
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
