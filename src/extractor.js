import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Extract text from a file based on its extension.
 * @param {string} filePath Absolute path to the file
 * @returns {Promise<string>} The extracted text content
 */
export async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    switch (ext) {
      case '.pdf': {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text || '[Empty PDF file]';
      }

      case '.docx': {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || '[Empty Word Document]';
      }

      // Plain text and code file extensions
      case '.txt':
      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
      case '.py':
      case '.java':
      case '.cpp':
      case '.c':
      case '.h':
      case '.cs':
      case '.html':
      case '.css':
      case '.json':
      case '.xml':
      case '.yaml':
      case '.yml':
      case '.md':
      case '.sql':
      case '.sh':
      case '.bat': {
        return fs.readFileSync(filePath, 'utf8');
      }

      default:
        // Try reading other unknown files as text, or return a placeholder if they seem binary
        const buffer = fs.readFileSync(filePath);
        // Basic heuristic to check if it's binary
        const isBinary = buffer.slice(0, 50).some(byte => byte === 0);
        if (isBinary) {
          return `[Binary File: ${path.basename(filePath)} (${buffer.length} bytes) - Cannot extract plain text directly]`;
        }
        return buffer.toString('utf8');
    }
  } catch (err) {
    console.error(`Error extracting text from ${filePath}:`, err);
    return `[Error extracting content from ${path.basename(filePath)}: ${err.message}]`;
  }
}

/**
 * Extracts and compiles content from multiple files into a single structured text string.
 * @param {Array<string>} filePaths Array of absolute file paths
 * @returns {Promise<string>} Compiled text structure
 */
export async function compileSubmissionContent(filePaths) {
  let compiled = '';
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const content = await extractTextFromFile(filePath);
    compiled += `\n\n--- FILE: ${fileName} ---\n`;
    compiled += content;
    compiled += `\n--- END OF FILE: ${fileName} ---\n`;
  }
  return compiled;
}
