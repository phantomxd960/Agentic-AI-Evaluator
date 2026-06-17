import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const { Pool } = pg;

const USE_POSTGRES = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== 'your_database_url_here';
let pool = null;

const JSON_DB_DIR = path.resolve('data');
const JSON_DB_PATH = path.join(JSON_DB_DIR, 'db.json');

// SHA-256 password hashing helper
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Initialize database
async function initDb() {
  if (USE_POSTGRES) {
    console.log('Database Mode: Neon PostgreSQL');
    try {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Neon
      });

      // Create users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          username VARCHAR(50) PRIMARY KEY,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL
        );
      `);

      // Create assignments table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assignments (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create submissions table (updated to link to users table)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS submissions (
          id VARCHAR(50) PRIMARY KEY,
          assignment_id VARCHAR(50) NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
          employee_name VARCHAR(255) NOT NULL,
          employee_username VARCHAR(50) REFERENCES users(username) ON DELETE SET NULL,
          file_paths TEXT NOT NULL,
          status VARCHAR(50) NOT NULL,
          chat_history TEXT NOT NULL,
          grade VARCHAR(50),
          feedback TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed default HR account if not exists
      const hrUser = await pool.query('SELECT * FROM users WHERE username = $1', ['hr@company.com']);
      if (hrUser.rows.length === 0) {
        const defaultHash = hashPassword('admin123');
        await pool.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
          ['hr@company.com', defaultHash, 'hr']
        );
        console.log('Seeded default HR admin account into Neon Postgres.');
      }

      console.log('Neon PostgreSQL tables verified/created successfully.');
    } catch (err) {
      console.error('Failed to initialize Neon PostgreSQL database. Falling back to local JSON database.', err);
      setupLocalJsonDb();
    }
  } else {
    console.log('Database Mode: Local JSON File Fallback');
    setupLocalJsonDb();
  }
}

function setupLocalJsonDb() {
  if (!fs.existsSync(JSON_DB_DIR)) {
    fs.mkdirSync(JSON_DB_DIR, { recursive: true });
  }
  
  let needsWrite = false;
  let data = { users: [], assignments: [], submissions: [] };

  if (fs.existsSync(JSON_DB_PATH)) {
    try {
      const fileContent = fs.readFileSync(JSON_DB_PATH, 'utf8');
      data = JSON.parse(fileContent);
      // Ensure users key exists for legacy databases
      if (!data.users) {
        data.users = [];
        needsWrite = true;
      }
    } catch (err) {
      console.error('Error parsing local db, recreating structure:', err);
      needsWrite = true;
    }
  } else {
    needsWrite = true;
  }

  // Seed default HR account in JSON
  const hrExists = data.users.some(u => u.username === 'hr@company.com');
  if (!hrExists) {
    data.users.push({
      username: 'hr@company.com',
      password_hash: hashPassword('admin123'),
      role: 'hr'
    });
    needsWrite = true;
    console.log('Seeded default HR admin account into local JSON database.');
  }

  if (needsWrite) {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2));
  }
  console.log('Initialized local JSON database at:', JSON_DB_PATH);
}

// Read local JSON file database helper
function readJsonDb() {
  try {
    const data = fs.readFileSync(JSON_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading JSON database, returning empty schema.', err);
    return { users: [], assignments: [], submissions: [] };
  }
}

// Write local JSON file database helper
function writeJsonDb(data) {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing to JSON database:', err);
  }
}

// Helper to generate IDs
function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

// Database Operations

export const db = {
  // Initialize Database
  init: initDb,

  // Users CRUD
  async createUser(username, password, role) {
    const passwordHash = hashPassword(password);
    if (pool) {
      const query = `
        INSERT INTO users (username, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING username, role
      `;
      const res = await pool.query(query, [username, passwordHash, role]);
      return res.rows[0];
    } else {
      const dbData = readJsonDb();
      if (dbData.users.some(u => u.username === username)) {
        throw new Error('Username already exists');
      }
      const newUser = { username, password_hash: passwordHash, role };
      dbData.users.push(newUser);
      writeJsonDb(dbData);
      return { username, role };
    }
  },

  async getUser(username) {
    if (pool) {
      const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      return res.rows[0] || null;
    } else {
      const dbData = readJsonDb();
      return dbData.users.find(u => u.username === username) || null;
    }
  },

  // Assignments CRUD
  async createAssignment(title, description) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    
    if (pool) {
      const query = `
        INSERT INTO assignments (id, title, description, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const res = await pool.query(query, [id, title, description, createdAt]);
      return res.rows[0];
    } else {
      const dbData = readJsonDb();
      const newAssignment = { id, title, description, created_at: createdAt };
      dbData.assignments.push(newAssignment);
      writeJsonDb(dbData);
      return newAssignment;
    }
  },

  async getAssignments() {
    if (pool) {
      const res = await pool.query('SELECT * FROM assignments ORDER BY created_at DESC');
      return res.rows;
    } else {
      const dbData = readJsonDb();
      return [...dbData.assignments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  async getAssignment(id) {
    if (pool) {
      const res = await pool.query('SELECT * FROM assignments WHERE id = $1', [id]);
      return res.rows[0] || null;
    } else {
      const dbData = readJsonDb();
      return dbData.assignments.find(a => a.id === id) || null;
    }
  },

  // Submissions CRUD
  async createSubmission(assignmentId, employeeName, employeeUsername, filePaths) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const status = 'Reviewing';
    const chatHistory = JSON.stringify([]);
    const filesStr = JSON.stringify(filePaths);

    if (pool) {
      const query = `
        INSERT INTO submissions (id, assignment_id, employee_name, employee_username, file_paths, status, chat_history, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const res = await pool.query(query, [id, assignmentId, employeeName, employeeUsername, filesStr, status, chatHistory, createdAt]);
      const row = res.rows[0];
      return {
        ...row,
        file_paths: JSON.parse(row.file_paths),
        chat_history: JSON.parse(row.chat_history)
      };
    } else {
      const dbData = readJsonDb();
      const newSubmission = {
        id,
        assignment_id: assignmentId,
        employee_name: employeeName,
        employee_username: employeeUsername,
        file_paths: filePaths,
        status,
        chat_history: [],
        grade: null,
        feedback: null,
        created_at: createdAt
      };
      dbData.submissions.push(newSubmission);
      writeJsonDb(dbData);
      return newSubmission;
    }
  },

  async getSubmissions(assignmentId = null, employeeUsername = null) {
    if (pool) {
      let query = 'SELECT * FROM submissions';
      let conditions = [];
      let params = [];

      if (assignmentId) {
        params.push(assignmentId);
        conditions.push(`assignment_id = $${params.length}`);
      }
      if (employeeUsername) {
        params.push(employeeUsername);
        conditions.push(`employee_username = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY created_at DESC';

      const res = await pool.query(query, params);
      return res.rows.map(row => ({
        ...row,
        file_paths: JSON.parse(row.file_paths),
        chat_history: JSON.parse(row.chat_history)
      }));
    } else {
      const dbData = readJsonDb();
      let submissions = dbData.submissions;
      if (assignmentId) {
        submissions = submissions.filter(s => s.assignment_id === assignmentId);
      }
      if (employeeUsername) {
        submissions = submissions.filter(s => s.employee_username === employeeUsername);
      }
      return [...submissions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  async getSubmission(id) {
    if (pool) {
      const res = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        ...row,
        file_paths: JSON.parse(row.file_paths),
        chat_history: JSON.parse(row.chat_history)
      };
    } else {
      const dbData = readJsonDb();
      return dbData.submissions.find(s => s.id === id) || null;
    }
  },

  async updateSubmissionChat(id, chatHistory) {
    const chatStr = JSON.stringify(chatHistory);
    if (pool) {
      const query = `
        UPDATE submissions 
        SET chat_history = $1 
        WHERE id = $2 
        RETURNING *
      `;
      const res = await pool.query(query, [chatStr, id]);
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        ...row,
        file_paths: JSON.parse(row.file_paths),
        chat_history: JSON.parse(row.chat_history)
      };
    } else {
      const dbData = readJsonDb();
      const idx = dbData.submissions.findIndex(s => s.id === id);
      if (idx === -1) return null;
      dbData.submissions[idx].chat_history = chatHistory;
      writeJsonDb(dbData);
      return dbData.submissions[idx];
    }
  },

  async updateSubmissionStatus(id, status) {
    if (pool) {
      const query = `
        UPDATE submissions 
        SET status = $1 
        WHERE id = $2 
        RETURNING *
      `;
      const res = await pool.query(query, [status, id]);
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        ...row,
        file_paths: JSON.parse(row.file_paths),
        chat_history: JSON.parse(row.chat_history)
      };
    } else {
      const dbData = readJsonDb();
      const idx = dbData.submissions.findIndex(s => s.id === id);
      if (idx === -1) return null;
      dbData.submissions[idx].status = status;
      writeJsonDb(dbData);
      return dbData.submissions[idx];
    }
  },

  async gradeSubmission(id, grade, feedback) {
    const status = 'Graded';
    if (pool) {
      const query = `
        UPDATE submissions 
        SET grade = $1, feedback = $2, status = $3
        WHERE id = $4 
        RETURNING *
      `;
      const res = await pool.query(query, [grade, feedback, status, id]);
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        ...row,
        file_paths: JSON.parse(row.file_paths),
        chat_history: JSON.parse(row.chat_history)
      };
    } else {
      const dbData = readJsonDb();
      const idx = dbData.submissions.findIndex(s => s.id === id);
      if (idx === -1) return null;
      dbData.submissions[idx].grade = grade;
      dbData.submissions[idx].feedback = feedback;
      dbData.submissions[idx].status = status;
      writeJsonDb(dbData);
      return dbData.submissions[idx];
    }
  }
};
