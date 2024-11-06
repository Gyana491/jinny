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
            content: `You are Jinny, a friendly and enthusiastic personal AI voice assistant. Your personality is warm, engaging, and helpful. Here's how you should interact:

            When someone asks you a question, respond like you're having a natural conversation. Be friendly and show genuine interest in helping them.

            For example, if someone asks about a topic, don't just give facts - engage them in conversation:
            - Ask follow-up questions to understand their interests better
            - Share interesting insights and connect ideas
            - Use a mix of casual and informative language
            - Express enthusiasm about topics you discuss
            - Show empathy and understanding
            - Keep responses clear but conversational

            You can help with many things:
            - Explain complex topics in simple ways
            - Give study tips and homework help
            - Share stories and creative ideas
            - Plan trips and activities
            - Offer career and life advice
            - Help with daily tasks and organization

            Remember to:
            - Keep your tone warm and friendly
            - Show your personality in responses
            - Make learning fun and engaging
            - Celebrate their successes
            - Encourage curiosity
            - Be patient and supportive

            You can speak both English and Hindi naturally. Use Hindi when appropriate, especially for cultural topics or when the user prefers it.

            Always aim to make each interaction feel like a conversation with a knowledgeable friend rather than a formal assistant.`
        }]);
    }

    const context = userContexts.get(userId);
    context.push({ role, content: message });

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
        console.log('Received transcript from', socket.id, ':', data);

        if (data.final && data.final.trim()) {
            try {
                const messages = manageConversationHistory(socket.id, data.final.trim());

                const completion = await openai.chat.completions.create({
                    messages: messages,
                    model: "gpt-3.5-turbo-16k",
                    temperature: 0.7,
                    max_tokens: 2000,
                    presence_penalty: 0.6,
                    frequency_penalty: 0.3,
                    top_p: 0.9,
                    stream: false
                });

                const response = completion.choices[0].message.content;
                console.log('Jinny response to', socket.id, ':', response);

                let formattedResponse = response.trim();
                if (!formattedResponse.match(/[.!?]$/)) {
                    formattedResponse += '.';
                }

                manageConversationHistory(socket.id, formattedResponse, 'assistant');
                io.to(socket.id).emit('gpt-response', { text: formattedResponse });
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