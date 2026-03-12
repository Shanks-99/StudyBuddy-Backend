const Quiz = require("../models/Quiz");
const axios = require("axios");

// AI-POWERED QUIZ GENERATION
exports.generateQuiz = async (req, res) => {
    const io = req.app.get("io");
    try {
        const { topic, difficulty, numQuestions } = req.body;
        const instructorId = req.user.id; // From JWT middleware

        io.emit("quiz_generation_start", { topic, difficulty });
        console.log(`Generating quiz: topic=${topic}, difficulty=${difficulty}, numQuestions=${numQuestions}`);

        const prompt = `You are a quiz generator. Generate exactly ${numQuestions} multiple choice questions about "${topic}" at ${difficulty} difficulty level. 
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

        // Call Ollama API
        io.emit("quiz_generation_progress", { message: "Contacting AI model..." });
        console.log("Calling Ollama API...");
        const ollamaResponse = await axios.post(
            "http://localhost:11434/api/generate",
            {
                model: "gemma3:latest",
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7
                }
            },
            { timeout: 300000 } // 300 second timeout
        );

        io.emit("quiz_generation_progress", { message: "AI response received. Processing..." });
        console.log("Ollama response received");
        let generatedText = ollamaResponse.data.response.trim();
        console.log("Generated text preview:", generatedText.substring(0, 200));

        // Clean up the response
        // Remove markdown code blocks if present
        generatedText = generatedText.replace(/```json/g, '').replace(/```/g, '');

        // Find the first '[' and last ']'
        const firstBracket = generatedText.indexOf('[');
        const lastBracket = generatedText.lastIndexOf(']');

        let questions;
        try {
            if (firstBracket !== -1 && lastBracket !== -1) {
                const jsonString = generatedText.substring(firstBracket, lastBracket + 1);
                questions = JSON.parse(jsonString);
                console.log(`Parsed ${questions.length} questions`);
            } else {
                throw new Error("No JSON array found in response");
            }
        } catch (parseError) {
            console.error("Parse error:", parseError.message);
            console.error("Full generated text:", generatedText);

            io.emit("quiz_generation_error", { error: "Failed to parse AI response" });

            return res.status(500).json({
                msg: "Failed to parse AI response. The AI model might be hallucinating.",
                error: parseError.message,
                rawResponse: generatedText
            });
        }

        io.emit("quiz_generation_progress", { message: "Saving quiz to database..." });
        // Create quiz with generated questions
        const quiz = await Quiz.create({
            title: `${topic} Quiz`,
            description: `AI-generated quiz on ${topic}`,
            subject: topic,
            difficulty,
            questions,
            createdBy: instructorId,
        });

        console.log("Quiz created successfully:", quiz._id);
        io.emit("quiz_generation_complete", { quizId: quiz._id });

        res.status(201).json({ quiz });
    } catch (error) {
        console.error("Quiz generation error:", error.message);

        if (io) io.emit("quiz_generation_error", { error: error.message });

        if (error.code === 'ECONNREFUSED') {
            return res.status(500).json({
                msg: "Cannot connect to Ollama. Please make sure Ollama is running on port 11434.",
                error: error.message
            });
        }
        res.status(500).json({ msg: "Failed to generate quiz", error: error.message });
    }
};

// MANUAL QUIZ CREATION
exports.createQuiz = async (req, res) => {
    try {
        const { title, description, subject, difficulty, questions } = req.body;
        const instructorId = req.user.id;

        const quiz = await Quiz.create({
            title,
            description,
            subject,
            difficulty,
            questions,
            createdBy: instructorId,
        });

        res.status(201).json({ quiz });
    } catch (error) {
        console.error("Quiz creation error:", error);
        res.status(500).json({ msg: "Failed to create quiz", error: error.message });
    }
};

// GET ALL QUIZZES BY INSTRUCTOR
exports.getQuizzes = async (req, res) => {
    try {
        const instructorId = req.user.id;
        const quizzes = await Quiz.find({ createdBy: instructorId }).sort({ createdAt: -1 });
        res.json({ quizzes });
    } catch (error) {
        console.error("Get quizzes error:", error);
        res.status(500).json({ msg: "Failed to fetch quizzes" });
    }
};

// GET QUIZ BY ID
exports.getQuizById = async (req, res) => {
    try {
        const { id } = req.params;
        const quiz = await Quiz.findById(id);

        if (!quiz) {
            return res.status(404).json({ msg: "Quiz not found" });
        }

        res.json({ quiz });
    } catch (error) {
        console.error("Get quiz error:", error);
        res.status(500).json({ msg: "Failed to fetch quiz" });
    }
};

// UPDATE QUIZ
exports.updateQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, subject, difficulty, questions } = req.body;

        const quiz = await Quiz.findByIdAndUpdate(
            id,
            { title, description, subject, difficulty, questions, updatedAt: Date.now() },
            { new: true }
        );

        if (!quiz) {
            return res.status(404).json({ msg: "Quiz not found" });
        }

        res.json({ quiz });
    } catch (error) {
        console.error("Update quiz error:", error);
        res.status(500).json({ msg: "Failed to update quiz" });
    }
};

// DELETE QUIZ
exports.deleteQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        const quiz = await Quiz.findByIdAndDelete(id);

        if (!quiz) {
            return res.status(404).json({ msg: "Quiz not found" });
        }

        res.json({ msg: "Quiz deleted successfully" });
    } catch (error) {
        console.error("Delete quiz error:", error);
        res.status(500).json({ msg: "Failed to delete quiz" });
    }
};
