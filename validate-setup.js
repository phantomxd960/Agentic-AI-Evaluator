import { db } from './src/db.js';
import { aiService } from './src/ai.js';
import fs from 'fs';
import path from 'path';

async function runValidation() {
  console.log('==================================================');
  console.log('   STARTING AUTHENTICATED SYSTEM VALIDATION       ');
  console.log('==================================================\n');

  let passes = 0;
  let fails = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passes++;
    } else {
      console.log(`[FAIL] ${message}`);
      fails++;
    }
  }

  try {
    // 1. Database Initialization
    console.log('--- TEST 1: Database Setup & Seeding ---');
    await db.init();
    assert(true, 'Database successfully initialized.');
    
    const hrAdmin = await db.getUser('hr@company.com');
    assert(hrAdmin && hrAdmin.role === 'hr', 'Default HR Admin account seeded correctly.');

    // 2. User Authentication
    console.log('\n--- TEST 2: User Account Operations ---');
    const mockUsername = 'testcandidate_' + Math.random().toString(36).substring(7);
    const mockPassword = 'password123';
    
    const employee = await db.createUser(mockUsername, mockPassword, 'employee');
    assert(employee && employee.username === mockUsername && employee.role === 'employee', `Created employee account: ${mockUsername}`);

    const retrievedUser = await db.getUser(mockUsername);
    assert(retrievedUser && retrievedUser.password_hash !== mockPassword, 'Password is secure (hashed, not plain text).');

    // 3. Assignment Operations
    console.log('\n--- TEST 3: Assignment Creation ---');
    const testAssignment = await db.createAssignment(
      'System Validation Challenge',
      'Describe design patterns in ES6 web apps.'
    );
    assert(testAssignment && testAssignment.id, `Created test assignment with ID: ${testAssignment.id}`);

    // 4. Submission Operations with Ownership Scopes
    console.log('\n--- TEST 4: Secure Submission Operations ---');
    const filePaths = [
      { originalName: 'demo.txt', tempPath: path.resolve('uploads/test-demo.txt') }
    ];
    if (!fs.existsSync(path.resolve('uploads'))) {
      fs.mkdirSync(path.resolve('uploads'), { recursive: true });
    }
    fs.writeFileSync(path.resolve('uploads/test-demo.txt'), 'const x = 10;');

    // Link submission to username
    const submission = await db.createSubmission(
      testAssignment.id,
      'Test Candidate Name',
      mockUsername,
      filePaths
    );
    assert(submission && submission.id, `Submission registered successfully (ID: ${submission.id})`);
    assert(submission.employee_username === mockUsername, 'Submission links to the registered employee username.');

    // Query submissions under employee scope
    const empList = await db.getSubmissions(testAssignment.id, mockUsername);
    assert(empList.length === 1 && empList[0].id === submission.id, 'Candidate scoped query returned only their own submission.');

    // Query submissions under another user scope (should be empty)
    const otherList = await db.getSubmissions(testAssignment.id, 'random_candidate');
    assert(otherList.length === 0, 'Scoped queries isolate submissions from other candidate accounts.');

    // Query submissions under HR scope (all submissions)
    const hrList = await db.getSubmissions(testAssignment.id, null);
    assert(hrList.length > 0, 'HR administrator scoped query fetched all submissions.');

    // 5. Chat History updates
    console.log('\n--- TEST 5: Chat Dialogue Updates ---');
    const mockChat = [
      { sender: 'ai', text: 'Hello, why did you decide this?', timestamp: new Date().toISOString() }
    ];
    let chatSub = await db.updateSubmissionChat(submission.id, mockChat);
    assert(chatSub.chat_history.length === 1 && chatSub.chat_history[0].sender === 'ai', 'Dialogue initial message registered.');

    // 6. AI Agent evaluation
    console.log('\n--- TEST 6: AI Agent Prompting Structures ---');
    const content = '--- FILE: demo.txt ---\nconst x = 10;\n--- END OF FILE ---';
    
    console.log('Testing AI analyzeSubmission...');
    const analysis = await aiService.analyzeSubmission(testAssignment, content);
    assert(analysis && analysis.initialMessage && analysis.status, 'analyzeSubmission returned valid structure.');

    console.log('Testing AI processChatMessage...');
    const chatReply = await aiService.processChatMessage(testAssignment, content, mockChat, 'I needed it for demo.');
    assert(chatReply && chatReply.aiMessage && 'canGrade' in chatReply, 'processChatMessage returned valid structure.');

    console.log('Testing AI generateFinalGrade...');
    const finalGradeReport = await aiService.generateFinalGrade(testAssignment, content, mockChat);
    assert(finalGradeReport && finalGradeReport.grade && finalGradeReport.feedback, 'generateFinalGrade returned valid grading report.');

    // Clean up
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL === 'your_database_url_here') {
      console.log('\nCleaning up local test database records...');
      const dbPath = path.resolve('data/db.json');
      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        parsed.users = parsed.users.filter(u => u.username !== mockUsername);
        parsed.assignments = parsed.assignments.filter(a => a.id !== testAssignment.id);
        parsed.submissions = parsed.submissions.filter(s => s.id !== submission.id);
        fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2));
      }
      if (fs.existsSync(path.resolve('uploads/test-demo.txt'))) {
        fs.unlinkSync(path.resolve('uploads/test-demo.txt'));
      }
      console.log('Cleanup complete.');
    }

    console.log('\n==================================================');
    console.log(`VALIDATION FINISHED: ${passes} PASSES, ${fails} FAILS`);
    console.log('==================================================');

    if (fails > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err) {
    console.error('\n[FATAL ERROR DURING VALIDATION RUN]:', err);
    process.exit(1);
  }
}

runValidation();
