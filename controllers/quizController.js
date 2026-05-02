const Quiz = require("../models/Quiz");
const { generateContent } = require("../services/ollamaService");
const { createNotification } = require("./notificationController");

// Helper: extract complete question objects from potentially truncated JSON
function extractQuestions(text) {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/```json/g, '').replace(/```/g, '').trim();

    // Try full parse first
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
        try {
            const arr = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
            if (Array.isArray(arr)) return arr;
        } catch (_) { /* fall through to manual extraction */ }
    }

    // Manual extraction: find complete {...} blocks (handles truncated JSON)
    const questions = [];
    let depth = 0, start = -1;
    for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (cleaned[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                try {
                    const obj = JSON.parse(cleaned.substring(start, i + 1));
                    if (obj.question && Array.isArray(obj.options)) {
                        questions.push(obj);
                    }
                } catch (_) { /* skip malformed object */ }
                start = -1;
            }
        }
    }
    return questions;
}

// Generate a small batch of questions
async function generateBatch(topic, difficulty, count) {
    const prompt = `You are a strict JSON API. Generate ${count} multiple choice questions about "${topic}" at ${difficulty} difficulty level.
Return ONLY a valid JSON array of objects. Do NOT return anything else. No markdown formatting (\`\`\`json).
Example format:
[
  {
    "question": "What does HTML stand for?",
    "options": ["Hyper Text Markup Language", "Hyperlinks and Text Markup Language", "Home Tool Markup Language", "Hyper Tool Markup Language"],
    "correctAnswer": 0,
    "explanation": "HTML stands for Hyper Text Markup Language."
  }
]`;

    const rawText = await generateContent(prompt);
    return extractQuestions(rawText);
}

// AI-POWERED QUIZ GENERATION
exports.generateQuiz = async (req, res) => {
    const io = req.app.get("io");
    try {
        const { topic, difficulty, numQuestions: rawNum } = req.body;
        const numQuestions = parseInt(rawNum) || 5;
        const instructorId = req.user.id;

        io.emit("quiz_generation_start", { topic, difficulty });
        console.log(`Generating quiz: topic=${topic}, difficulty=${difficulty}, numQuestions=${numQuestions}`);

        // Generate in batches of 3 to avoid model token limit truncation
        const BATCH_SIZE = 3;
        const allQuestions = [];
        const totalBatches = Math.ceil(numQuestions / BATCH_SIZE);

        for (let batch = 0; batch < totalBatches; batch++) {
            const remaining = numQuestions - allQuestions.length;
            const batchCount = Math.min(BATCH_SIZE, remaining);

            io.emit("quiz_generation_progress", {
                message: `Generating questions (batch ${batch + 1}/${totalBatches})...`
            });
            console.log(`Batch ${batch + 1}/${totalBatches}: generating ${batchCount} questions...`);

            const batchQuestions = await generateBatch(topic, difficulty, batchCount);
            console.log(`Batch ${batch + 1} returned ${batchQuestions.length} questions`);

            allQuestions.push(...batchQuestions);

            if (allQuestions.length >= numQuestions) break;
        }

        if (allQuestions.length === 0) {
            io.emit("quiz_generation_error", { error: "AI failed to generate any valid questions" });
            return res.status(500).json({
                msg: "AI failed to generate any valid questions. Please try again."
            });
        }

        // Trim to requested count
        const questions = allQuestions.slice(0, numQuestions);
        console.log(`Total valid questions: ${questions.length}/${numQuestions}`);

        io.emit("quiz_generation_progress", { message: "Saving quiz to database..." });
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

        await createNotification(
            instructorId,
            "Quiz Generated",
            `Your AI quiz on "${topic}" has been successfully generated with ${questions.length} questions.`,
            "system",
            "/instructor-quizzes"
        );

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
