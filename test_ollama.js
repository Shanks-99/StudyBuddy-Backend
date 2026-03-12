const axios = require('axios');

const testOllama = async () => {
    const prompt = `You are a quiz generator. Generate exactly 5 multiple choice questions about "Machine Learning" at medium difficulty level. 
Strictly follow this JSON format:
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Explanation"
  }
]
Do not include any markdown formatting like \`\`\`json or \`\`\`. Return ONLY the raw JSON array.`;

    try {
        console.log("Sending request to Ollama...");
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: 'gemma3:latest',
            prompt: prompt,
            stream: false
        });

        console.log("Response received:");
        console.log(response.data.response);
    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("Data:", error.response.data);
        }
    }
};

testOllama();
