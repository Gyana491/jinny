const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected');
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });

    socket.on('transcript', async (data) => {
        console.log('Received transcript:', data);

        if (data.final && data.final.trim()) {
            try {
                const completion = await openai.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "You are Jarvis, a helpful and friendly AI assistant. Keep responses concise and natural, as if speaking conversationally."
                        },
                        {
                            role: "user",
                            content: data.final.trim()
                        }
                    ],
                    model: "gpt-3.5-turbo",
                    temperature: 0.7,
                    max_tokens: 150 // Limit response length for faster replies
                });

                const response = completion.choices[0].message.content;
                console.log('Jarvis response:', response);

                // Send the response immediately
                io.emit('gpt-response', { text: response });
            } catch (error) {
                console.error('Error with ChatGPT:', error);
                socket.emit('error', { 
                    message: 'Error processing your request',
                    details: error.message
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Jarvis is running on port ${PORT}`);
});

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