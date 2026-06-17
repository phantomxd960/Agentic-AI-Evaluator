import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, hashPassword } from './src/db.js';
import { aiService } from './src/ai.js';
import { compileSubmissionContent } from './src/extractor.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url} | User-Role: ${req.headers['x-user-role'] || 'none'} | Username: ${req.headers['x-username'] || 'none'}`);
  
  const originalSend = res.send;
  res.send = function (body) {
    console.log(`[HTTP] ${req.method} ${req.url} -> Status: ${res.statusCode}`);
    return originalSend.apply(res, arguments);
  };
  
  next();
});

// Configure Multer storage to preserve original file extensions
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const originalExt = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${originalExt}`);
  }
});

const upload = multer({ storage: storage });

// Initialize database before setting up routes
await db.init();

// --- AUTH API ENDPOINTS ---

// Register employee
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const cleanUsername = username.trim().toLowerCase();
    const existingUser = await db.getUser(cleanUsername);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const newUser = await db.createUser(cleanUsername, password, 'employee');
    res.status(201).json({ username: newUser.username, role: newUser.role });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// Login (Employee & HR)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = await db.getUser(cleanUsername);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const inputHash = hashPassword(password);
    if (inputHash !== user.password_hash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      username: user.username,
      role: user.role
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});


// --- REST API ENDPOINTS ---

// 1. Assignments
app.get('/api/assignments', async (req, res) => {
  try {
    const list = await db.getAssignments();
    res.json(list);
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

app.get('/api/assignments/:id', async (req, res) => {
  try {
    const assignment = await db.getAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.json(assignment);
  } catch (err) {
    console.error('Error fetching assignment:', err);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

app.post('/api/assignments', async (req, res) => {
  try {
    // HR Authorization Filter
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'hr') {
      return res.status(403).json({ error: 'Forbidden: Only HR administrators can publish assignments.' });
    }

    const { title, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    const newAssignment = await db.createAssignment(title, description);
    res.status(201).json(newAssignment);
  } catch (err) {
    console.error('Error creating assignment:', err);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// 2. Submissions
app.get('/api/submissions', async (req, res) => {
  try {
    const assignmentId = req.query.assignmentId || null;
    
    // Auth Filtering
    const userRole = req.headers['x-user-role'];
    const username = req.headers['x-username'];
    
    let filterUsername = null;
    if (userRole === 'employee') {
      filterUsername = username; // Employees can ONLY see their own submissions
    }

    const list = await db.getSubmissions(assignmentId, filterUsername);
    res.json(list);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

app.get('/api/submissions/:id', async (req, res) => {
  try {
    const submission = await db.getSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Auth Filtering: Employees cannot view other candidate submissions
    const userRole = req.headers['x-user-role'];
    const username = req.headers['x-username'];
    if (userRole === 'employee' && submission.employee_username !== username) {
      return res.status(403).json({ error: 'Access Denied: You cannot view this submission.' });
    }

    res.json(submission);
  } catch (err) {
    console.error('Error fetching submission:', err);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Employee uploads a solution
app.post('/api/submissions', upload.array('files'), async (req, res) => {
  try {
    const { assignmentId, employeeName } = req.body;
    const employeeUsername = req.headers['x-username'] || req.body.employeeUsername;

    if (!assignmentId || !employeeName) {
      return res.status(400).json({ error: 'assignmentId and employeeName are required' });
    }

    if (!employeeUsername) {
      return res.status(400).json({ error: 'Authentication required to upload solutions' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one solution file must be uploaded' });
    }

    // Get assignment details
    const assignment = await db.getAssignment(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Keep track of original file names mapped to local paths
    const filePaths = files.map(file => ({
      originalName: file.originalname,
      tempPath: file.path
    }));

    // Compile submission text contents
    const absolutePaths = filePaths.map(f => f.tempPath);
    const compiledContent = await compileSubmissionContent(absolutePaths);

    // Initial AI analysis and first chat questions
    console.log(`Starting AI analysis for submission from: ${employeeName} (${employeeUsername})...`);
    const aiResult = await aiService.analyzeSubmission(assignment, compiledContent);
    console.log('AI initial analysis finished.');

    // Create the submission records in the DB
    const initialChat = [
      {
        sender: 'ai',
        text: aiResult.initialMessage,
        timestamp: new Date().toISOString()
      }
    ];

    const submission = await db.createSubmission(assignmentId, employeeName, employeeUsername, filePaths);
    await db.updateSubmissionChat(submission.id, initialChat);
    const updatedSubmission = await db.updateSubmissionStatus(submission.id, aiResult.status);

    res.status(201).json(updatedSubmission);
  } catch (err) {
    console.error('Error creating submission:', err);
    res.status(500).json({ error: 'Failed to create submission. Check your API key config.' });
  }
});

// Send a chat message to AI Evaluator
app.post('/api/submissions/:id/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const submission = await db.getSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Auth Filtering: Check if employee owns the submission
    const userRole = req.headers['x-user-role'];
    const username = req.headers['x-username'];
    if (userRole === 'employee' && submission.employee_username !== username) {
      return res.status(403).json({ error: 'Access Denied: You cannot chat on this submission.' });
    }

    if (submission.status === 'Graded') {
      return res.status(400).json({ error: 'Submission has already been graded. Chat is locked.' });
    }

    const assignment = await db.getAssignment(submission.assignment_id);

    // Add employee's message to chat history
    const updatedHistory = [
      ...submission.chat_history,
      {
        sender: 'employee',
        text: message,
        timestamp: new Date().toISOString()
      }
    ];

    await db.updateSubmissionChat(submission.id, updatedHistory);

    // Get compiled file contents for prompt context
    const absolutePaths = submission.file_paths.map(f => f.tempPath);
    const compiledContent = await compileSubmissionContent(absolutePaths);

    // Process chat response via AI Agent
    console.log(`Processing AI reply to chat from ${submission.employee_name}...`);
    const aiResponse = await aiService.processChatMessage(
      assignment,
      compiledContent,
      updatedHistory,
      message
    );

    // Add AI message to chat history
    const finalHistory = [
      ...updatedHistory,
      {
        sender: 'ai',
        text: aiResponse.aiMessage,
        timestamp: new Date().toISOString()
      }
    ];

    await db.updateSubmissionChat(submission.id, finalHistory);

    // Update status if AI has questions or is done
    let status = submission.status;
    if (aiResponse.canGrade) {
      status = 'Action Required'; // Keep action required but employee is informed they can grade
    }
    const finalSubmission = await db.updateSubmissionStatus(submission.id, status);

    res.json({
      submission: finalSubmission,
      aiResponse: {
        aiMessage: aiResponse.aiMessage,
        canGrade: aiResponse.canGrade
      }
    });
  } catch (err) {
    console.error('Error during AI chat processing:', err);
    res.status(500).json({ error: 'Failed to process chat message.' });
  }
});

// Finalize grading
app.post('/api/submissions/:id/finalize', async (req, res) => {
  try {
    const submission = await db.getSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Auth Filtering: Check if owner or HR
    const userRole = req.headers['x-user-role'];
    const username = req.headers['x-username'];
    if (userRole === 'employee' && submission.employee_username !== username) {
      return res.status(403).json({ error: 'Access Denied: You cannot grade this submission.' });
    }

    if (submission.status === 'Graded') {
      return res.json(submission); // Already graded
    }

    const assignment = await db.getAssignment(submission.assignment_id);

    // Get compiled file contents for context
    const absolutePaths = submission.file_paths.map(f => f.tempPath);
    const compiledContent = await compileSubmissionContent(absolutePaths);

    console.log(`Generating final grade for submission of ${submission.employee_name}...`);
    const grading = await aiService.generateFinalGrade(
      assignment,
      compiledContent,
      submission.chat_history
    );
    console.log(`AI graded: ${grading.grade}`);

    // Commit grade to database
    const gradedSubmission = await db.gradeSubmission(
      submission.id,
      grading.grade,
      grading.feedback
    );

    res.json(gradedSubmission);
  } catch (err) {
    console.error('Error finalising submission grade:', err);
    res.status(500).json({ error: 'Failed to generate final grade report.' });
  }
});

// Fallback index.html for single-page routing if needed
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  Agentic AI Work Evaluator Server Running!`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`===================================================`);
});
