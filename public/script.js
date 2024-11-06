document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const transcriptDiv = document.getElementById('transcript');
    const responseDiv = document.getElementById('gpt-response');
    const statusDiv = document.getElementById('status');

    let recognition = null;
    let voices = [];
    let selectedVoice = null;
    let isListening = false;

    // Pre-load and cache voices
    function initVoices() {
        voices = window.speechSynthesis.getVoices();
        selectedVoice = voices.find(voice => 
            voice.name.includes('Microsoft Zira') ||
            voice.name.includes('Google US English Female') ||
            voice.name.includes('female') ||
            voice.name.includes('Samantha')
        );
        console.log('Selected voice:', selectedVoice?.name);
    }

    initVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = initVoices;
    }

    function speak(text) {
        window.speechSynthesis.cancel(); // Cancel any ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        window.speechSynthesis.speak(utterance);
        
        return new Promise((resolve) => {
            utterance.onend = resolve;
        });
    }

    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log('Speech recognition started');
            statusDiv.innerHTML = '<span style="color: green;">Listening...</span>';
            talkButton.textContent = 'Release to Stop';
            talkButton.classList.add('listening');
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            if (isListening) {
                recognition.start();
            } else {
                statusDiv.innerHTML = '<span style="color: blue;">Click and hold to speak</span>';
                talkButton.textContent = 'Hold to Speak';
                talkButton.classList.remove('listening');
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript.trim()) {
                console.log('Sending to server:', finalTranscript);
                socket.emit('transcript', {
                    final: finalTranscript,
                    interim: interimTranscript
                });
                statusDiv.innerHTML = '<span style="color: blue;">Processing...</span>';
            }

            transcriptDiv.innerHTML = (finalTranscript || interimTranscript) + 
                '<span style="color: gray;">' + (interimTranscript && !finalTranscript ? interimTranscript : '') + '</span>';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error !== 'no-speech') {
                statusDiv.innerHTML = `<span style="color: red;">Error: ${event.error}</span>`;
            }
        };

        socket.on('gpt-response', async (data) => {
            console.log('Received GPT response:', data);
            responseDiv.textContent = data.text;
            statusDiv.innerHTML = '<span style="color: purple;">Speaking...</span>';
            
            try {
                await speak(data.text);
                statusDiv.innerHTML = '<span style="color: blue;">Click and hold to speak</span>';
            } catch (error) {
                console.error('Speech synthesis error:', error);
                statusDiv.innerHTML = '<span style="color: blue;">Click and hold to speak</span>';
            }
        });

        // Create and add the talk button
        const talkButton = document.createElement('button');
        talkButton.textContent = 'Hold to Speak';
        talkButton.className = 'talk-button';
        document.querySelector('.container').insertBefore(talkButton, document.querySelector('.transcript-container'));

        // Button event listeners
        talkButton.addEventListener('mousedown', () => {
            isListening = true;
            recognition.start();
        });

        talkButton.addEventListener('mouseup', () => {
            isListening = false;
            recognition.stop();
        });

        talkButton.addEventListener('mouseleave', () => {
            if (isListening) {
                isListening = false;
                recognition.stop();
            }
        });

        // Initial status
        statusDiv.innerHTML = '<span style="color: blue;">Click and hold to speak</span>';
    } else {
        alert('Speech recognition is not supported in this browser. Please use Chrome.');
    }
}); 