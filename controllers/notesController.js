const axios = require("axios");

// Ollama configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:latest";

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

        console.log(`📝 [Notes] Generating notes with model: ${OLLAMA_MODEL}`);

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

        // Call Ollama API with streaming
        const response = await axios.post(
            `${OLLAMA_BASE_URL}/api/generate`,
            {
                model: OLLAMA_MODEL,
                prompt: prompt,
                stream: true,
            },
            {
                responseType: 'stream',
                timeout: 300000, // 5 minute timeout
            }
        );

        console.log("✅ [Notes] Ollama stream started");

        // Pipe Ollama stream to client
        response.data.on('data', (chunk) => {
            try {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    const json = JSON.parse(line);
                    if (json.response) {
                        res.write(json.response);
                    }
                    if (json.done) {
                        console.log("✅ [Notes] Generation complete");
                    }
                }
            } catch (e) {
                console.error("Error parsing chunk:", e);
            }
        });

        response.data.on('end', () => {
            res.end();
        });

        response.data.on('error', (err) => {
            console.error("Stream error:", err);
            res.end();
        });

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
