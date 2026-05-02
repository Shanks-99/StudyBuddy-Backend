const { generateStream } = require("../services/ollamaService");

/**
 * Generate notes from text message
 */
const generateNotes = async (req, res) => {
    console.log("📝 [Notes] Received generation request");
    try {
        const content = req.body.message || "";

        if (!content || content.trim() === "") {
            console.warn("⚠️ [Notes] Empty content received");
            return res.status(400).json({
                error: "Please provide a message"
            });
        }

        console.log(`📝 [Notes] Generating notes using Ollama service`);

        // Create strict prompt for Ollama
        const prompt = `You are a precise study assistant. Answer the user's request exactly as asked. 
If they ask for a specific length (e.g., 2 lines, short, long), strictly adhere to it. 
Do not add unnecessary conversational filler like "Here are your notes" or "Sure!". 
Just provide the content directly.

User Request: ${content}

Response:`;

        console.log("⏳ [Notes] Sending request to Ollama...");

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Call Ollama API with streaming via service
        const stream = await generateStream(prompt);

        console.log("✅ [Notes] Ollama stream started");

        for await (const part of stream) {
            if (part.response) {
                res.write(part.response);
            }
            if (part.done) {
                console.log("✅ [Notes] Generation complete");
            }
        }

        res.end();

    } catch (error) {
        console.error("❌ [Notes] Error generating notes:", error.message);

        if (!res.headersSent) {
            if (error.code === 'ECONNREFUSED') {
                return res.status(500).json({
                    error: "Cannot connect to Ollama. Please make sure Ollama is running.",
                    hint: "Run 'ollama serve' in your terminal",
                });
            }

            res.status(500).json({
                error: "Failed to generate notes",
                message: error.message,
            });
        } else {
            res.end();
        }
    }
};

module.exports = {
    generateNotes,
};
