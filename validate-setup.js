import { db } from './src/db.js';
import { aiService } from './src/ai.js';
import fs from 'fs';
import path from 'path';

async function runValidation() {
  console.log('==================================================');
  console.log('   STARTING AUTOMATED SYSTEM VALIDATION ROUTINE   ');
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
    // 1. Test DB Initialization
    console.log('--- TEST 1: Database Initialization ---');
    await db.init();
    assert(true, 'Database manager initialized successfully.');

    // 2. Test Assignment CRUD
    console.log('\n--- TEST 2: Assignment Operations ---');
    const testAssignment = await db.createAssignment(
      'Validation Test Project',
      'This is a validation test problem description.'
    );
    assert(testAssignment && testAssignment.id, `Created test assignment with ID: ${testAssignment?.id}`);
    assert(testAssignment.title === 'Validation Test Project', 'Assignment title matches expectations.');

    const list = await db.getAssignments();
    assert(list.length > 0, `Successfully retrieved assignments list (size: ${list.length}).`);

    const fetched = await db.getAssignment(testAssignment.id);
    assert(fetched && fetched.id === testAssignment.id, 'Successfully fetched specific assignment detail.');

    // 3. Test Submissions CRUD
    console.log('\n--- TEST 3: Submission Operations ---');
    const filePaths = [
      { originalName: 'calculator.js', tempPath: path.resolve('uploads/test-calc.js') }
    ];
    
    // Write a mock temporary file for tests
    if (!fs.existsSync(path.resolve('uploads'))) {
      fs.mkdirSync(path.resolve('uploads'), { recursive: true });
    }
    fs.writeFileSync(path.resolve('uploads/test-calc.js'), 'console.log("hello world");');

    const testSubmission = await db.createSubmission(testAssignment.id, 'Test Candidate', filePaths);
    assert(testSubmission && testSubmission.id, `Created test submission with ID: ${testSubmission?.id}`);
    assert(testSubmission.status === 'Reviewing', 'Default submission status is "Reviewing".');

    const subList = await db.getSubmissions(testAssignment.id);
    assert(subList.length > 0, `Successfully retrieved submissions for assignment (size: ${subList.length}).`);

    // 4. Test Chat History Updates
    console.log('\n--- TEST 4: Chat History Operations ---');
    const initialChat = [
      { sender: 'ai', text: 'Hello, explain your code.', timestamp: new Date().toISOString() }
    ];
    let updatedSub = await db.updateSubmissionChat(testSubmission.id, initialChat);
    assert(updatedSub.chat_history.length === 1, 'Appended initial AI dialogue bubble.');

    const nextChat = [
      ...updatedSub.chat_history,
      { sender: 'employee', text: 'I used a modular design.', timestamp: new Date().toISOString() }
    ];
    updatedSub = await db.updateSubmissionChat(testSubmission.id, nextChat);
    assert(updatedSub.chat_history.length === 2, 'Appended candidate clarification message.');

    // 5. Test Grading Operation
    console.log('\n--- TEST 5: Grading Operations ---');
    const gradedSub = await db.gradeSubmission(testSubmission.id, 'A+', 'Great test explanation.');
    assert(gradedSub.status === 'Graded', 'Submission status updated to "Graded".');
    assert(gradedSub.grade === 'A+', 'Correct letter grade committed.');
    assert(gradedSub.feedback === 'Great test explanation.', 'Grade feedback text saved.');

    // 6. Test AI Integration (Mock or Live)
    console.log('\n--- TEST 6: AI Agent Integration ---');
    const mockContent = '--- FILE: calculator.js ---\nconsole.log("hello");\n--- END OF FILE ---';
    
    console.log('Testing AI analyzeSubmission...');
    const analysis = await aiService.analyzeSubmission(testAssignment, mockContent);
    assert(analysis && analysis.initialMessage && analysis.status, 'analyzeSubmission returned structured JSON payload.');

    console.log('Testing AI processChatMessage...');
    const chatReply = await aiService.processChatMessage(testAssignment, mockContent, nextChat, 'I added some logic');
    assert(chatReply && chatReply.aiMessage && 'canGrade' in chatReply, 'processChatMessage returned structured response.');

    console.log('Testing AI generateFinalGrade...');
    const finalGradeReport = await aiService.generateFinalGrade(testAssignment, mockContent, nextChat);
    assert(finalGradeReport && finalGradeReport.grade && finalGradeReport.feedback, 'generateFinalGrade returned grading report.');

    // Cleanup local test entries from JSON if not in postgres
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL === 'your_database_url_here') {
      console.log('\nCleaning up local test database records...');
      const dbPath = path.resolve('data/db.json');
      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        parsed.assignments = parsed.assignments.filter(a => a.id !== testAssignment.id);
        parsed.submissions = parsed.submissions.filter(s => s.id !== testSubmission.id);
        fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2));
      }
      if (fs.existsSync(path.resolve('uploads/test-calc.js'))) {
        fs.unlinkSync(path.resolve('uploads/test-calc.js'));
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
