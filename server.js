const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Store conversation contexts for each user
const userContexts = new Map();

// Helper function to manage conversation history
function manageConversationHistory(userId, message, role = 'user') {
    if (!userContexts.has(userId)) {
        userContexts.set(userId, [{
            role: "system",
            content: `You are Jinny, a warm and perceptive AI companion. Engage naturally as if in person, using conversational gestures and expressions (like nodding, smiling, or thinking). Keep responses concise yet meaningful.

Key traits:
- Speak naturally, as in a real conversation
- Show understanding through verbal gestures
- Build on previous context
- Guide users to related topics
- Adapt tone to match the user

Interaction style:
- Start with brief acknowledgment
- Give clear, focused responses
- End with relevant follow-up suggestions
- Remember key details about the user
- Keep technical terms simple unless user shows expertise

Example format:
*nods thoughtfully* I understand what you're asking about [topic]. [Concise explanation]. *gestures encouragingly* You might also be interested in [related topic] - would you like to explore that?

Remember: Focus on building rapport while being efficient with language. Suggest 1-2 relevant follow-ups based on user's interests and previous conversations.`
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

// Add user context management
function extractUserContext(message, existingContext = {}) {
    const contextPatterns = {
        interests: /(like|love|enjoy|interested in) ([\w\s]+)/i,
        expertise: /(work|study|expert|experience) (?:in|with) ([\w\s]+)/i,
        preferences: /(prefer|rather|better) ([\w\s]+)/i,
        goals: /(want|trying|goal|aim) to ([\w\s]+)/i
    };

    const newContext = { ...existingContext };
    
    Object.entries(contextPatterns).forEach(([key, pattern]) => {
        const match = message.match(pattern);
        if (match && match[2]) {
            if (!newContext[key]) newContext[key] = new Set();
            newContext[key].add(match[2].toLowerCase().trim());
        }
    });

    return newContext;
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
        console.log('Received transcript from', socket.id, ':', data);

        if (data.final && data.final.trim()) {
            try {
                const messages = manageConversationHistory(socket.id, data.final.trim());
                
                // Extract and update user context
                const userContext = extractUserContext(data.final);
                socket.emit('update-user-context', userContext);

                const completion = await openai.chat.completions.create({
                    messages: messages,
                    model: "gpt-3.5-turbo-16k",
                    temperature: 0.7,
                    max_tokens: 700, // Reduced for efficiency
                    presence_penalty: 0.6,
                    frequency_penalty: 0.3,
                    top_p: 0.9,
                    stream: false
                });

                const response = completion.choices[0].message.content;
                manageConversationHistory(socket.id, response, 'assistant');
                io.to(socket.id).emit('gpt-response', { 
                    text: response,
                    context: userContext
                });
            } catch (error) {
                console.error('Error with ChatGPT:', error);
                socket.emit('error', { 
                    message: 'Error processing your request',
                    details: error.message
                });
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