import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const IS_MOCK_AI = !API_KEY || API_KEY === 'your_gemini_api_key_here' || API_KEY.trim() === '';

let aiClient = null;
if (!IS_MOCK_AI) {
  try {
    aiClient = new GoogleGenAI({ apiKey: API_KEY });
    console.log('Gemini AI Client initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize GoogleGenAI client:', err);
  }
} else {
  console.log('Gemini AI Key is not configured. Running in high-fidelity Mock AI mode.');
}

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Call Gemini API helper with JSON enforcement
 */
async function callGemini(systemInstruction, promptContent) {
  if (IS_MOCK_AI || !aiClient) {
    throw new Error('Gemini API key not configured.');
  }

  const maxRetries = 3;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await aiClient.models.generateContent({
        model: MODEL_NAME,
        contents: promptContent,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: systemInstruction,
          temperature: 0.2,
        }
      });

      const text = response.text;
      return JSON.parse(text);
    } catch (err) {
      console.error(`Gemini API Call failed (attempt ${attempt}/${maxRetries}):`, err.message || err);
      
      const isTransient = err.status === 503 || err.status === 429 || 
                          (err.message && (err.message.includes('503') || err.message.includes('temporary') || err.message.includes('demand') || err.message.includes('429')));
      
      if (isTransient && attempt < maxRetries) {
        console.warn(`[Gemini API] Transient error detected. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2.5; // Exponential backoff (1s -> 2.5s)
      } else {
        throw err;
      }
    }
  }
}

export const aiService = {
  /**
   * Analyze submission files and generate the initial chat message with clarifying questions.
   */
  async analyzeSubmission(assignment, submissionContent) {
    const systemInstruction = `You are an expert AI work evaluator. An employee has submitted a solution for a company problem statement. Your job is to review their solution files against the problem statement.
You must understand why they implemented it this way. Be collaborative and constructive.
Review the files, identify any gaps, interesting design choices, or potential bugs, and prepare 1 to 3 clarifying questions to ask the employee.
You must output a JSON object with the following fields:
{
  "analysis": "Your detailed internal analysis of the submission, highlighting strengths, gaps, and points of interest.",
  "initialMessage": "A polite and friendly starting message to the employee. Praise their effort, summarize what you see, and then ask the 1-3 questions to clarify their implementation decisions.",
  "status": "This should be 'Action Required' if you have questions to clarify, or 'Graded' if the submission is absolutely complete and no interaction is needed (normally it should be 'Action Required')."
}`;

    const promptContent = `
Problem Statement Title: ${assignment.title}
Problem Statement Description:
${assignment.description}

Employee Submitted Solution Files Content:
${submissionContent}
`;

    if (IS_MOCK_AI) {
      // High-fidelity Mock Response
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
      
      const containsCalculator = assignment.title.toLowerCase().includes('calculator') || assignment.description.toLowerCase().includes('calculator');
      
      if (containsCalculator) {
        return {
          analysis: "The employee submitted a web calculator implementation. The basic functions (addition, subtraction, multiplication, division) are implemented in JavaScript. However, looking at the code, there is no validation for division by zero, and the history log is kept in local memory which will clear on page refresh. These are good points to query.",
          initialMessage: "Hi! Thanks for submitting your Calculator Project. I reviewed your files and noticed you've structured the interface nicely using vanilla HTML and CSS. Before I finalize your grade, I'd like to ask a couple of quick questions to understand your design choices:\n\n1. I noticed that dividing by zero yields 'Infinity' in JavaScript. Was this an intentional design decision, or did you plan to add validation?\n2. Currently, the calculation history is stored in an in-memory array, which resets when the page is reloaded. How would you modify your implementation to persist this history across page refreshes?",
          status: "Action Required"
        };
      }

      return {
        analysis: "Submission received and analyzed. The solution is structurally sound but has some open design assumptions that should be validated through employee dialogue.",
        initialMessage: "Hello! Thank you for submitting your work. I have reviewed your submission files. To help me understand your thought process and implementation decisions better, could you please clarify the following:\n\n1. What was the main technical challenge you faced while implementing this solution, and how did you resolve it?\n2. If you had an additional week to work on this project, what features or refinements would you prioritize, and why?",
        status: "Action Required"
      };
    }

    return await callGemini(systemInstruction, promptContent);
  },

  /**
   * Process employee response in the chat dialogue.
   */
  async processChatMessage(assignment, submissionContent, chatHistory, newMessage) {
    const systemInstruction = `You are an expert AI work evaluator. You are in the middle of a chat conversation with an employee about their project submission.
Read the problem statement, the submission content, the chat history, and the new message from the employee.
Evaluate if the employee's explanations are sufficient to resolve the questions.
If you need more details, ask a follow-up question. If they have answered your questions and you have enough information to grade their work, set 'canGrade' to true.
Output a JSON object with the following fields:
{
  "analysis": "Your thoughts on the employee's response and whether it resolves your queries.",
  "aiMessage": "Your response to the employee. If you have more questions, ask them. If you are satisfied and ready to grade, say something like: 'Thank you for the clarifications! I now have a solid understanding of your solution. I will finalize your evaluation and generate the grade report now.'",
  "canGrade": true_or_false
}`;

    const formattedHistory = chatHistory.map(m => `${m.sender === 'employee' ? 'Employee' : 'AI Evaluator'}: ${m.text}`).join('\n');

    const promptContent = `
Problem Statement Title: ${assignment.title}
Problem Statement Description:
${assignment.description}

Employee Submitted Solution Files Content:
${submissionContent}

--- CHAT CONVERSATION HISTORY ---
${formattedHistory}
Employee's Latest Message: ${newMessage}
`;

    if (IS_MOCK_AI) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const lowerMessage = newMessage.toLowerCase();
      if (lowerMessage.includes('localstorage') || lowerMessage.includes('persist') || lowerMessage.includes('history') || lowerMessage.includes('zero') || lowerMessage.includes('error') || lowerMessage.length > 25) {
        return {
          analysis: "The employee provided a logical explanation. They clarified that local storage could be used to persist data, and that displaying 'Error' was a design preference. The explanation shows a good grasp of the web stack. We can proceed to grade.",
          aiMessage: "Thank you for the detailed clarification! Using localStorage is indeed a perfect solution for persisting history on the client-side, and adding validation for division by zero makes the user experience much more robust. I have all the context I need now. I will go ahead and generate your final grade report.",
          canGrade: true
        };
      }

      return {
        analysis: "The employee's response is somewhat brief. Let's prompt them once more for a bit more detail on their design considerations before grading.",
        aiMessage: "Thanks for your response! That makes sense. Could you share a bit more about how you would structure the code to support that change? Specifically, where would you invoke the storage saving and loading logic?",
        canGrade: false
      };
    }

    return await callGemini(systemInstruction, promptContent);
  },

  /**
   * Generate the final grade and comprehensive written feedback.
   */
  async generateFinalGrade(assignment, submissionContent, chatHistory) {
    const systemInstruction = `You are an expert AI work evaluator. You have completed the interactive evaluation chat with the employee.
Review the problem statement, the submission content, and the chat history (which demonstrates the employee's depth of understanding of their work).
Grade the submission on a scale of A, B, C, D, F (with +/- if appropriate).
Evaluate using these criteria:
1. Correctness & Completeness: Does the solution solve the problem?
2. Design & Code Quality: Is it well-structured and written?
3. Understanding: Did the employee demonstrate a deep understanding of their implementation, decisions, and trade-offs in the chat?
Output a JSON object with the following fields:
{
  "grade": "The letter grade (e.g., 'A+', 'A', 'B-', 'C', 'F')",
  "feedback": "Detailed, formatted markdown feedback. It must include:
    - **Summary**: Overview of the project and grading outcome.
    - **Strengths**: What was done well in the code/submission.
    - **Chat Evaluation**: Review of how well the employee explained their choices in the chat.
    - **Areas for Improvement**: Recommendations for future work."
}`;

    const formattedHistory = chatHistory.map(m => `${m.sender === 'employee' ? 'Employee' : 'AI Evaluator'}: ${m.text}`).join('\n');

    const promptContent = `
Problem Statement Title: ${assignment.title}
Problem Statement Description:
${assignment.description}

Employee Submitted Solution Files Content:
${submissionContent}

--- CHAT CONVERSATION HISTORY ---
${formattedHistory}
`;

    if (IS_MOCK_AI) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const containsCalculator = assignment.title.toLowerCase().includes('calculator') || assignment.description.toLowerCase().includes('calculator');
      
      if (containsCalculator) {
        return {
          grade: "A-",
          feedback: `### Evaluation Report: Calculator Project

#### Summary
The employee has successfully submitted a fully functional web-based calculator. The solution demonstrates solid front-end foundations with clean HTML semantic structure and a well-designed CSS skin. Through the clarifying chat, the employee showed a strong understanding of web concepts, particularly client-side state management.

#### Strengths
- **Sleek UI Styling**: The interface has a modern glassmorphic look with responsive buttons.
- **Clean Event Listeners**: The math logic is cleanly separated from UI rendering in JS.
- **Robust Basic Math**: Standard operations (+, -, *, /) work flawlessly.

#### Chat Evaluation
During our conversation, the employee clearly explained their design choices:
- Proposed a solid plan to use \`localStorage\` to persist calculation history.
- Correctly identified that validation for dividing by zero should return an error message rather than letting JavaScript yield \`Infinity\`.
This dialogue proved that the employee understands the limitations of the current codebase and knows how to implement enterprise-ready improvements.

#### Areas for Improvement
- **Input Validation**: Restrict typing multiple decimals in a single number (e.g. \`1.2.3\`).
- **Data Persistence**: Implement client-side storage (\`localStorage\`) to preserve the history panel as discussed in our chat.`
        };
      }

      return {
        grade: "B+",
        feedback: `### Evaluation Report: Project Submission

#### Summary
The submission resolves the core objectives outlined in the problem statement. The code and supporting files are well-organized and document the core features. The interactive session highlighted the employee's solid conceptual understanding of the architecture.

#### Strengths
- **Structure**: Clear file layout and modular design.
- **Documentation**: Code comments explain complex math or business logic.

#### Chat Evaluation
The employee engaged constructively, answering questions about code modularity and potential extensions. They clearly explained their developer choices and showed a mature attitude toward technical trade-offs.

#### Areas for Improvement
- **Edge Cases**: Expand test coverage for unusual input bounds.
- **Scalability**: Consider refactoring helper methods into separate library utility modules.`
      };
    }

    return await callGemini(systemInstruction, promptContent);
  }
};
