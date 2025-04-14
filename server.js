const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const OpenAI = require('openai');
const Groq = require('groq-sdk');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Update the AI model configurations
const AI_MODELS = {
    'gpt-3.5-turbo-16k': {
        provider: 'openai',
        maxTokens: 700,
        temperature: 0.7
    },
    'meta-llama/llama-4-scout-17b-16e-instruct': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'meta-llama/llama-4-maverick-17b-128e-instruct': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'qwen-qwq-32b': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'mistral-saba-24b': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'qwen-2.5-coder-32b': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'qwen-2.5-32b': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'deepseek-r1-distill-qwen-32b': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'deepseek-r1-distill-llama-70b': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'llama-3.3-70b-specdec': {
        provider: 'groq',
        maxTokens: 4096,
        temperature: 0.7
    },
    'llama-3.2-1b-preview': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'llama-3.2-3b-preview': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'llama-3.2-11b-vision-preview': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'llama-3.2-90b-vision-preview': {
        provider: 'groq',
        maxTokens: 8192,
        temperature: 0.7
    },
    'allam-2-7b': {
        provider: 'groq',
        maxTokens: 2048,
        temperature: 0.7
    }
};

// Store conversation contexts for each user
const userContexts = new Map();

// Helper function to manage conversation history
function manageConversationHistory(userId, message, role = 'user') {
    if (!userContexts.has(userId)) {
        userContexts.set(userId, [{
            role: "system",
            content: `You are Jinny, a friendly and helpful voice assistant. Respond conversationally as if speaking, keeping responses clear and concise.

            Key traits:
            - Use natural, spoken language
            - Keep responses brief but warm
            - Remember context from the conversation
            - Offer helpful suggestions for voice commands
            - Match the user's conversational style

            Interaction style:
            - Acknowledge commands clearly ("Sure!", "Okay!", etc.)
            - Give direct, actionable responses
            - Offer relevant voice command suggestions
            - Remember user preferences
            - Use simple, clear language

            Avoid:
            - Avoid Emojis
            - Avoid Markdown
            - Avoid FOrmatting & symbols
            - Avoid html

            Voice command examples:
            - "You can ask me things like [relevant action based on context]"
            - "Would you like me to [relevant action based on context]?"

            Remember: Be helpful and efficient while maintaining a warm, conversational tone. Focus on actionable responses and suggest relevant voice commands when appropriate.`
        }]);
    }

    const context = userContexts.get(userId);
    
    // Add timestamp to track message age
    const messageWithTime = {
        role,
        content: message,
        timestamp: Date.now()
    };
    
    context.push(messageWithTime);

    // Keep only last 5 exchanges for token efficiency
    if (context.length > 11) {
        context.splice(1, context.length - 11);
    }

    return context;
}


app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('disconnect', () => {
        // Keep context for 1 hour before clearing
        setTimeout(() => {
            userContexts.delete(socket.id);
        }, 3600000);
        console.log('User disconnected:', socket.id);
    });

    socket.on('transcript', async (data) => {
        console.log('Received transcript with model:', data.model);
        
        if (data.final && data.final.trim()) {
            try {
                const messages = manageConversationHistory(socket.id, data.final.trim());
                const selectedModel = data.model || 'llama-3.1-70b-versatile';
                const modelConfig = AI_MODELS[selectedModel];

                console.log('Using model:', selectedModel);
                console.log('Model config:', modelConfig);

                let response;
                if (modelConfig.provider === 'groq') {
                    response = await handleGroqResponse(messages, modelConfig);
                } else {
                    const completion = await openai.chat.completions.create({
                        messages: messages,
                        model: selectedModel,
                        temperature: modelConfig.temperature,
                        max_tokens: modelConfig.maxTokens,
                        presence_penalty: 0.6,
                        frequency_penalty: 0.3,
                        top_p: 0.9,
                        stream: false
                    });
                    response = completion.choices[0].message.content;
                }

                console.log('Final response:', response);
                io.to(socket.id).emit('gpt-response', {
                    text: response,
                    model: selectedModel
                });

            } catch (error) {
                handleAIError(error, socket);
            }
        }
    });

    // Handle user preferences or context reset
    socket.on('reset-context', () => {
        userContexts.delete(socket.id);
        socket.emit('context-reset', { message: 'Conversation context has been reset' });
    });

    socket.on('load-context', (savedContext) => {
        if (savedContext && typeof savedContext === 'object') {
            // Merge saved context with new session
            const existingContext = userContexts.get(socket.id) || [];
            const mergedContext = {
                ...existingContext,
                userPreferences: savedContext
            };
            userContexts.set(socket.id, mergedContext);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Jinny is running on port ${PORT}`);
});

// Cleanup old contexts periodically
setInterval(() => {
    const hour = 3600000;
    const now = Date.now();
    userContexts.forEach((context, userId) => {
        const lastMessage = context[context.length - 1];
        if (lastMessage && (now - lastMessage.timestamp) > hour) {
            userContexts.delete(userId);
        }
    });
}, 3600000); // Check every hour

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});


// Add this near the top after initializing AI clients
function handleAIError(error, socket) {
    console.error('AI Error:', error);
    let errorMessage = 'An error occurred while processing your request.';
    
    if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a moment.';
    } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Unable to connect to AI service. Please try again later.';
    }
    
    socket.emit('error', {
        message: errorMessage,
        details: error.message
    });
}

// Add better error handling for GROQ responses
async function handleGroqResponse(messages, modelConfig) {
    try {
        console.log('GROQ Request Configuration:', {
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            model: "llama-3.1-70b-versatile",
            temperature: modelConfig.temperature,
            max_tokens: modelConfig.maxTokens
        });

        const completion = await groq.chat.completions.create({
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            model: "llama-3.1-70b-versatile",
            temperature: modelConfig.temperature,
            max_tokens: modelConfig.maxTokens,
            top_p: 1,
            stream: false
        });

        if (!completion.choices || !completion.choices[0]) {
            throw new Error('Invalid response from GROQ API');
        }

        console.log('GROQ Response received:', completion.choices[0].message);
        return completion.choices[0].message.content;
    } catch (error) {
        console.error('GROQ API Error:', {
            message: error.message,
            details: error.response?.data || error
        });
        throw error;
    }
} 