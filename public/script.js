document.addEventListener('DOMContentLoaded', async () => {
    const socket = io();
    const transcriptDiv = document.getElementById('transcript');
    const responseDiv = document.getElementById('gpt-response');
    const statusDiv = document.getElementById('status');
    const talkButton = document.getElementById('talk-button');
    const voiceWave = document.getElementById('voice-wave');
    const stopButton = document.getElementById('stop-button');
    const controlButton = document.getElementById('control-button');

    let recognition = null;
    let isListening = false;
    let isSpeaking = false;
    let selectedVoice = null;
    let isPaused = false;

    const voiceSelect = document.getElementById('voice-select');
    const languageSelect = document.getElementById('language-select');

    // Add these variables at the top
    const liveModeToggle = document.getElementById('liveMode');
    let isLiveMode = false;
    let silenceTimer = null;
    const SILENCE_THRESHOLD = 1000; // 1 second of silence before stopping

    // Add live mode toggle handler
    liveModeToggle.addEventListener('change', (e) => {
        isLiveMode = e.target.checked;
        if (isLiveMode) {
            startLiveMode();
        } else {
            stopLiveMode();
        }
    });

    // Add these functions for live mode
    function startLiveMode() {
        if (!recognition) return;
        
        try {
            recognition.continuous = true;
            recognition.interimResults = true;
            
            // Only start microphone if not speaking
            if (!isSpeaking) {
                recognition.start();
                isListening = true;
            }
            
            voiceWave.classList.add('speaking');
            updateStatus('live');
            isLiveStarted = true;
        } catch (error) {
            console.error('Error starting live mode:', error);
        }
    }

    function stopLiveMode() {
        if (!recognition) return;
        
        try {
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.stop();
            isListening = false;
            voiceWave.classList.remove('speaking');
            isLiveStarted = false;
            
            if (isSpeaking) {
                window.speechSynthesis.cancel();
                isSpeaking = false;
                isPaused = false;
            }
            updateStatus('ready');
        } catch (error) {
            console.error('Error stopping live mode:', error);
        }
    }

    // Add these functions at the start of your script
    function savePreferences() {
        if (selectedVoice) {
            localStorage.setItem('selectedVoiceName', selectedVoice.name);
        }
        if (recognition) {
            localStorage.setItem('selectedLanguage', recognition.lang);
        }
    }

    function loadPreferences() {
        return {
            voiceName: localStorage.getItem('selectedVoiceName'),
            language: localStorage.getItem('selectedLanguage') || 'en-GB'
        };
    }

    // Voice initialization with selection options
    async function initVoice() {
        return new Promise((resolve) => {
            function initializeVoices() {
                const voices = window.speechSynthesis.getVoices();
                if (voices.length === 0) {
                    setTimeout(initializeVoices, 100);
                    return;
                }

                // Clear existing options
                voiceSelect.innerHTML = '';
                
                // Add voices to selector
                voices.forEach((voice) => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    
                    // Add flags for languages
                    if (voice.lang.startsWith('hi')) {
                        option.textContent = '🇮🇳 ' + option.textContent;
                    } else if (voice.lang.startsWith('en')) {
                        option.textContent = '🇬🇧 ' + option.textContent;
                    }
                    
                    voiceSelect.appendChild(option);
                });

                // Try to restore saved voice preference
                const prefs = loadPreferences();
                if (prefs.voiceName) {
                    selectedVoice = voices.find(voice => voice.name === prefs.voiceName);
                    if (selectedVoice) {
                        voiceSelect.value = selectedVoice.name;
                        console.log('Restored saved voice:', selectedVoice.name);
                    }
                }

                // If no saved preference or saved voice not found, use default
                if (!selectedVoice) {
                    selectedVoice = voices.find(voice => 
                        voice.name.includes('Google') && 
                        voice.lang === 'hi-IN'
                    ) || voices.find(voice => 
                        voice.lang === 'hi-IN'
                    ) || voices[0];

                    if (selectedVoice) {
                        voiceSelect.value = selectedVoice.name;
                    }
                }

                console.log('Voice initialized:', selectedVoice?.name);
                console.log('Available voices:', voices.length);
                resolve(true);
            }

            // Chrome requires onvoiceschanged event
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = initializeVoices;
            }
            
            // Try immediate initialization
            initializeVoices();
        });
    }

    // Initialize voice
    await initVoice();

    // Voice selection change handler
    voiceSelect.addEventListener('change', (e) => {
        const voices = window.speechSynthesis.getVoices();
        selectedVoice = voices.find(voice => voice.name === e.target.value);
        
        // Test the selected voice
        const testUtterance = new SpeechSynthesisUtterance('Testing voice change');
        testUtterance.voice = selectedVoice;
        window.speechSynthesis.speak(testUtterance);
        
        // Save preference
        savePreferences();
        
        console.log('Voice changed to:', selectedVoice.name);
    });

    // Language selection change handler
    languageSelect.addEventListener('change', (e) => {
        recognition.lang = e.target.value;
        savePreferences();
        console.log('Recognition language changed to:', e.target.value);
    });

    // Add language options
    const languages = [
        { code: 'en-GB', flag: '🇬🇧', name: 'English (UK)' },
        { code: 'en-US', flag: '🇺🇸', name: 'English (US)' },
        { code: 'hi-IN', flag: '🇮🇳', name: 'Hindi' },
        { code: 'bn-IN', flag: '🇮🇳', name: 'Bengali' },
        { code: 'ta-IN', flag: '🇮🇳', name: 'Tamil' },
        { code: 'te-IN', flag: '🇮🇳', name: 'Telugu' },
        { code: 'mr-IN', flag: '🇮🇳', name: 'Marathi' }
    ];

    // Populate language selector
    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = `${lang.flag} ${lang.name}`;
        languageSelect.appendChild(option);
    });

    // Show the selector container
    document.querySelector('.selector-container').style.display = 'flex';

    // Function to stop speaking
    function stopSpeaking() {
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
            isPaused = false;
            voiceWave.classList.remove('speaking');
            statusDiv.innerHTML = '<span style="color: blue;"><i class="fas fa-microphone"></i> Ready</span>';
            if (!isSpeaking) {
                toggleControlButton(false);
            }
        }
    }

    // Add this function to manage microphone in live mode
    function manageLiveModeRecognition(action) {
        if (!isLiveMode || !recognition) return;
        
        try {
            if (action === 'stop') {
                recognition.stop();
                console.log('Paused listening in live mode');
            } else if (action === 'start') {
                recognition.start();
                console.log('Resumed listening in live mode');
            }
        } catch (error) {
            console.error('Recognition control error:', error);
        }
    }

    // Add this function to manage microphone state
    function manageMicrophone(action) {
        if (!recognition) return;
        
        try {
            if (action === 'stop') {
                recognition.stop();
                isListening = false;
                console.log('Microphone turned off');
            } else if (action === 'start' && isLiveMode) {
                recognition.start();
                isListening = true;
                console.log('Microphone turned on');
            }
        } catch (error) {
            console.error('Microphone control error:', error);
        }
    }

    // Add these variables at the top of your script
    let currentUtterance = null;
    let pausedText = '';
    let pausedIndex = 0;
    let isLiveStarted = false;

    // Update status display function
    function updateStatus(state, message) {
        switch (state) {
            case 'ready':
                statusDiv.innerHTML = '<span style="color: blue;"><i class="fas fa-microphone"></i> Ready</span>';
                break;
            case 'listening':
                statusDiv.innerHTML = '<span style="color: green;"><i class="fas fa-microphone-alt"></i> Listening...</span>';
                break;
            case 'speaking':
                statusDiv.innerHTML = '<span style="color: purple;"><i class="fas fa-comment-dots"></i> Speaking...</span>';
                break;
            case 'paused':
                statusDiv.innerHTML = '<span style="color: orange;"><i class="fas fa-pause"></i> Paused</span>';
                break;
            case 'live':
                statusDiv.innerHTML = '<span style="color: green;"><i class="fas fa-broadcast-tower"></i> Live Mode Active</span>';
                break;
            case 'processing':
                statusDiv.innerHTML = message || '<span style="color: blue;"><i class="fas fa-cog fa-spin"></i> Processing...</span>';
                break;
            default:
                statusDiv.innerHTML = message || '<span style="color: blue;"><i class="fas fa-microphone"></i> Ready</span>';
        }
    }

    // Update the speak function with better status handling
    function speak(text) {
        return new Promise((resolve) => {
            if (isSpeaking) {
                window.speechSynthesis.cancel();
            }

            manageMicrophone('stop');

            const utterance = new SpeechSynthesisUtterance(text);
            currentUtterance = utterance;
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
            }

            utterance.onstart = () => {
                isSpeaking = true;
                isPaused = false;
                voiceWave.classList.add('speaking');
                updateStatus('speaking');
                manageMicrophone('stop');
            };

            utterance.onpause = () => {
                isPaused = true;
                updateStatus('paused');
            };

            utterance.onresume = () => {
                isPaused = false;
                updateStatus('speaking');
                manageMicrophone('stop');
            };

            utterance.onend = () => {
                isSpeaking = false;
                isPaused = false;
                currentUtterance = null;
                voiceWave.classList.remove('speaking');
                
                // Update status based on mode
                if (isLiveMode) {
                    updateStatus('live');
                    setTimeout(() => {
                        manageMicrophone('start');
                    }, 300);
                } else {
                    updateStatus('ready');
                }
                resolve();
            };

            utterance.onerror = (error) => {
                console.error('Speech error:', error);
                isSpeaking = false;
                isPaused = false;
                currentUtterance = null;
                
                if (isLiveMode) {
                    updateStatus('live');
                    setTimeout(() => {
                        manageMicrophone('start');
                    }, 300);
                } else {
                    updateStatus('ready');
                }
                resolve();
            };

            window.speechSynthesis.speak(utterance);
        });
    }

    // Speech recognition setup
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        
        // Load saved language preference
        const prefs = loadPreferences();
        recognition.lang = prefs.language;
        
        // Set the language selector to match
        if (languageSelect) {
            languageSelect.value = prefs.language;
        }

        recognition.onstart = () => {
            isListening = true;
            voiceWave.classList.add('speaking');
            updateStatus(isLiveMode ? 'live' : 'listening');
            talkButton.classList.add('listening');
        };

        recognition.onend = () => {
            isListening = false;
            if (isLiveMode && isLiveStarted && !isSpeaking) {
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Error restarting recognition:', error);
                }
            } else {
                talkButton.classList.remove('listening');
                if (!isSpeaking) {
                    updateStatus('ready');
                }
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            // Clear silence timer on new speech
            if (silenceTimer) {
                clearTimeout(silenceTimer);
            }

            // Show listening status when user is speaking
            if (isLiveMode) {
                updateStatus('listening');
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal && transcript.trim().length > 0) {
                    finalTranscript += transcript + ' ';
                    
                    // Stop current speech if Jinny is speaking
                    if (isSpeaking) {
                        stopSpeaking();
                    }

                    // Send transcript immediately when in live mode
                    if (isLiveMode) {
                        socket.emit('transcript', {
                            final: transcript.trim(),
                            interim: ''
                        });
                        updateStatus('processing', '<span style="color: blue;"><i class="fas fa-cog fa-spin"></i> Processing...</span>');
                    }
                } else {
                    interimTranscript += transcript;
                }
            }

            // For non-live mode, send complete transcript
            if (!isLiveMode && finalTranscript.trim()) {
                socket.emit('transcript', {
                    final: finalTranscript,
                    interim: interimTranscript
                });
            }

            transcriptDiv.innerHTML = finalTranscript || interimTranscript;

            // Reset silence timer
            if (isLiveMode) {
                silenceTimer = setTimeout(() => {
                    if (!isSpeaking) {
                        updateStatus('live');
                    }
                }, SILENCE_THRESHOLD);
            }
        };

        // Update GPT response handler
        socket.on('gpt-response', async (data) => {
            responseDiv.textContent = data.text;
            responseDiv.scrollTop = responseDiv.scrollHeight;
            
            try {
                voiceWave.classList.add('speaking');
                statusDiv.innerHTML = '<span style="color: purple;"><i class="fas fa-comment-dots"></i> Speaking...</span>';
                
                if (!isLiveMode) {
                    showPauseButton();
                }
                
                // Turn off microphone before speaking
                manageMicrophone('stop');
                await speak(data.text);
                
                if (isLiveMode) {
                    statusDiv.innerHTML = '<span style="color: green;"><i class="fas fa-broadcast-tower"></i> Live Mode Active</span>';
                    // Turn microphone back on in live mode
                    manageMicrophone('start');
                } else {
                    statusDiv.innerHTML = '<span style="color: blue;"><i class="fas fa-microphone"></i> Ready</span>';
                    if (!isSpeaking && !isListening) {
                        setTimeout(() => {
                            voiceWave.classList.remove('speaking');
                            hideControlButtons();
                        }, 1000);
                    }
                }
            } catch (error) {
                console.error('Speech error:', error);
                if (isLiveMode) {
                    manageMicrophone('start');
                }
                hideControlButtons();
            }
        });

        // Updated button event listeners with long press support
        let pressTimer = null;
        let isLongPress = false;

        // Helper function to handle start of recording
        function startRecording(e) {
            if (e) e.preventDefault();
            if (isSpeaking) stopSpeaking();
            
            // Visual feedback
            talkButton.classList.add('active');
            voiceWave.classList.add('speaking');
            
            // Start recording
            try {
                recognition.start();
                
                // Start long press timer
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    // Add visual feedback for long press
                    talkButton.classList.add('long-press');
                }, 500); // 500ms to trigger long press
            } catch (error) {
                console.error('Recognition start error:', error);
            }
        }

        // Helper function to handle end of recording
        function stopRecording(e) {
            if (e) e.preventDefault();
            
            // Clear long press timer
            clearTimeout(pressTimer);
            
            // Visual feedback
            talkButton.classList.remove('active', 'long-press');
            
            // Only stop recognition if it wasn't a long press or if we're ending a long press
            if (!isLongPress || (isLongPress && e.type === 'touchend')) {
                try {
                    recognition.stop();
                } catch (error) {
                    console.error('Recognition stop error:', error);
                }
            }
            
            isLongPress = false;
        }

        // Mouse events
        talkButton.addEventListener('mousedown', startRecording);
        talkButton.addEventListener('mouseup', stopRecording);
        talkButton.addEventListener('mouseleave', stopRecording);

        // Touch events
        talkButton.addEventListener('touchstart', startRecording, { passive: false });
        talkButton.addEventListener('touchend', stopRecording, { passive: false });
        talkButton.addEventListener('touchcancel', stopRecording, { passive: false });

        // Add these styles dynamically for mobile optimization
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                #talk-button {
                    width: 80px;
                    height: 80px;
                    font-size: 24px;
                    -webkit-tap-highlight-color: transparent;
                }

                #talk-button.active {
                    transform: scale(0.95);
                    background-color: #e0e0e0;
                }

                #talk-button.long-press {
                    background-color: #2196F3;
                    color: white;
                }

                .selector-container {
                    flex-direction: column;
                    gap: 10px;
                    padding: 10px;
                }

                #voice-select, #language-select {
                    width: 100%;
                    max-width: 300px;
                    height: 40px;
                    font-size: 16px;
                }

                #transcript, #gpt-response {
                    font-size: 16px;
                    padding: 15px;
                    margin: 10px;
                    max-height: 30vh;
                }

                #voice-wave {
                    width: 60px;
                    height: 60px;
                }

                #control-button, #stop-button {
                    width: 50px;
                    height: 50px;
                    font-size: 20px;
                }

                .live-mode-container {
                    padding: 10px;
                }

                #status {
                    font-size: 14px;
                    padding: 5px;
                }
            }

            /* Prevent text selection during long press */
            * {
                -webkit-touch-callout: none;
                -webkit-user-select: none;
                user-select: none;
            }

            /* Allow text selection in response and transcript areas */
            #transcript, #gpt-response {
                -webkit-user-select: text;
                user-select: text;
            }

            /* Add smooth transitions */
            #talk-button {
                transition: all 0.2s ease;
            }

            /* Add ripple effect */
            .ripple {
                position: relative;
                overflow: hidden;
            }

            .ripple:after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                top: 0;
                left: 0;
            }

            @keyframes ripple {
                to {
                    transform: scale(2.5);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);

        // Add touch feedback function
        function addTouchFeedback(element) {
            element.addEventListener('touchstart', () => {
                element.classList.add('ripple');
            });
            
            element.addEventListener('touchend', () => {
                setTimeout(() => {
                    element.classList.remove('ripple');
                }, 600);
            });
        }

        // Add touch feedback to buttons
        addTouchFeedback(talkButton);
        addTouchFeedback(controlButton);
        addTouchFeedback(stopButton);

        // Add viewport meta tag for proper mobile scaling
        if (!document.querySelector('meta[name="viewport"]')) {
            const viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(viewport);
        }

        // Add scroll into view for mobile keyboards
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
        });

        // Prevent zoom on double tap
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);

    } else {
        alert('Speech recognition is not supported in this browser. Please use Chrome.');
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopSpeaking();
    });

    // Add this function to periodically check and resume speech in Chrome
    function keepSpeaking() {
        if (isSpeaking && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    }
    setInterval(keepSpeaking, 1000);

    // Update the toggleControlButton function
    function toggleControlButton(show) {
        if (show) {
            controlButton.style.display = 'flex';
            controlButton.classList.add('visible');
            controlButton.innerHTML = '<i class="fas fa-pause"></i>';
            isPaused = false;
        } else {
            controlButton.classList.remove('visible');
            if (!isSpeaking) {
                controlButton.style.display = 'none';
            }
        }
    }

    // Update the control button handlers
    function showPlayButton() {
        // Just update status without showing control button
        statusDiv.innerHTML = '<span style="color: orange;"><i class="fas fa-pause"></i> Paused</span>';
    }

    function showPauseButton() {
        // Just update status without showing control button
        statusDiv.innerHTML = '<span style="color: purple;"><i class="fas fa-comment-dots"></i> Speaking...</span>';
    }

    function hideControlButtons() {
        // This can be empty now or used for other cleanup
    }

    // Update the control button click handler
    controlButton.addEventListener('click', () => {
        if (!isSpeaking && !isPaused) return;

        if (isPaused) {
            window.speechSynthesis.resume();
            isPaused = false;
            showPauseButton();
        } else {
            window.speechSynthesis.pause();
            isPaused = true;
            showPlayButton();
        }
    });

    // Add this function to keep the speech synthesis state in sync
    function syncSpeechState() {
        if (isSpeaking) {
            if (window.speechSynthesis.paused) {
                isPaused = true;
                showPlayButton();
            } else {
                isPaused = false;
                showPauseButton();
            }
        }
    }

    // Call syncSpeechState more frequently for better responsiveness
    setInterval(syncSpeechState, 100);

    // Update cleanup function with microphone control
    function cleanup() {
        if (isSpeaking) {
            window.speechSynthesis.cancel();
        }
        isSpeaking = false;
        isPaused = false;
        currentUtterance = null;
        
        if (isLiveMode) {
            setTimeout(() => {
                manageMicrophone('start');
                updateStatus('live');
            }, 300);
        } else {
            manageMicrophone('stop');
            updateStatus('ready');
        }
    }

    // Add event listeners for page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cleanup();
        }
    });

    // Update the stop button handler
    stopButton.addEventListener('click', () => {
        cleanup();
    });

    // Add this to handle Chrome's speech synthesis bugs
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isSpeaking && isPaused) {
            window.speechSynthesis.resume();
        }
    });

    // Add these functions for better control
    function showStartButton() {
        controlButton.style.display = 'flex';
        controlButton.innerHTML = '<i class="fas fa-play"></i>';
        controlButton.classList.add('visible');
        controlButton.classList.remove('live-active');
        isLiveStarted = false;
    }

    function showStopButton() {
        controlButton.innerHTML = '<i class="fas fa-stop"></i>';
        controlButton.classList.add('visible', 'live-active');
        isLiveStarted = true;
    }

    // Initialize voice as soon as possible
    (function initializeVoiceEarly() {
        if (typeof speechSynthesis !== 'undefined') {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-voice';
            loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing voice...';
            document.body.appendChild(loadingDiv);

            // Try to initialize voices
            function tryInitVoices() {
                const voices = speechSynthesis.getVoices();
                if (voices.length > 0) {
                    selectedVoice = voices.find(voice => 
                        voice.name.includes('Google') && 
                        voice.lang === 'hi-IN'
                    ) || voices.find(voice => 
                        voice.lang === 'hi-IN'
                    ) || voices[0];
                    
                    // Remove loading indicator
                    loadingDiv.remove();
                    return true;
                }
                return false;
            }

            // Try immediate initialization
            if (!tryInitVoices()) {
                // If not successful, wait for voices to load
                speechSynthesis.onvoiceschanged = () => {
                    tryInitVoices();
                };
            }
        }
    })();
}); 