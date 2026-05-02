const { Ollama } = require('ollama');

const ollama = new Ollama({ host: 'http://68.183.88.46:11434' });
const MODEL = 'llama3.2:3b';

/**
 * Generate non-streaming content
 */
const generateContent = async (prompt) => {
  try {
    const response = await ollama.generate({
      model: MODEL,
      prompt: prompt,
    });
    return response.response;
  } catch (error) {
    console.error('Error generating content with Ollama:', error);
    throw error;
  }
};

/**
 * Generate streaming content
 */
const generateStream = async (prompt) => {
  try {
    return await ollama.generate({
      model: MODEL,
      prompt: prompt,
      stream: true,
    });
  } catch (error) {
    console.error('Error starting Ollama stream:', error);
    throw error;
  }
};

module.exports = {
  generateContent,
  generateStream,
};

