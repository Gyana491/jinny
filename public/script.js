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
            showStartButton();
            // Automatically start live mode
            startLiveMode();
            showStopButton();
        } else {
            stopLiveMode();
            hideControlButtons();
        }
    });

    // Add these functions for live mode
    function startLiveMode() {
        if (!recognition) return;
        
        try {
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.start();
            voiceWave.classList.add('speaking');
            statusDiv.innerHTML = '<span style="color: green;"><i class="fas fa-broadcast-tower"></i> Live Mode Active</span>';
            isLiveStarted = true;
        } catch (error) {
            console.error('Error starting live mode:', error);
        }
    }

    function stopLiveMode() {
        if (!recognition) return;
        
        // Reset recognition settings
        recognition.continuous = false;
        recognition.interimResults = true;
        
        try {
            recognition.stop();
            statusDiv.innerHTML = '<span style="color: blue;"><i class="fas fa-microphone"></i> Ready</span>';
            voiceWave.classList.remove('speaking');
            isLiveStarted = false;
            stopSpeaking();
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
            } else if (action === 'start') {
                // Only start if we're in live mode and Jinny isn't speaking
                if (isLiveMode && !isSpeaking) {
                    recognition.start();
                    isListening = true;
                    console.log('Microphone turned on');
                }
            }
        } catch (error) {
            console.error('Microphone control error:', error);
        }
    }

    // Update the speak function
    function speak(text) {
        return new Promise((resolve) => {
            // Always turn off microphone before speaking
            manageMicrophone('stop');

            const utterance = new SpeechSynthesisUtterance(text);
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
            }

            utterance.onstart = () => {
                isSpeaking = true;
                // Ensure microphone stays off while speaking
                manageMicrophone('stop');
                console.log('Speaking started');
            };

            utterance.onend = () => {
                isSpeaking = false;
                console.log('Speaking ended');
                // Only turn microphone back on in live mode
                setTimeout(() => {
                    if (isLiveMode) {
                        manageMicrophone('start');
                    }
                }, 100);
                resolve();
            };

            utterance.onerror = (error) => {
                console.error('Speech error:', error);
                isSpeaking = false;
                // Only turn microphone back on in live mode
                if (isLiveMode) {
                    manageMicrophone('start');
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
            stopSpeaking();
            isListening = true;
            voiceWave.classList.add('speaking');
            statusDiv.innerHTML = '<span style="color: green;"><i class="fas fa-microphone"></i> Listening...</span>';
            talkButton.classList.add('listening');
        };

        recognition.onend = () => {
            isListening = false;
            
            if (isLiveMode && isLiveStarted && !isSpeaking) {
                // Only restart recognition if Jinny isn't speaking
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Error restarting recognition:', error);
                }
            } else {
                statusDiv.innerHTML = '<span style="color: blue;"><i class="fas fa-microphone"></i> Ready</span>';
                talkButton.classList.remove('listening');
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            // Clear silence timer on new speech
            if (silenceTimer) {
                clearTimeout(silenceTimer);
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal && transcript.trim().length > 0) {  // Only process non-empty transcripts
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
                        statusDiv.innerHTML = '<span style="color: blue;"><i class="fas fa-cog fa-spin"></i> Processing...</span>';
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
                    statusDiv.innerHTML = '<span style="color: green;"><i class="fas fa-broadcast-tower"></i> Live Mode Active</span>';
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

        // Button event listeners
        talkButton.addEventListener('mousedown', () => {
            stopSpeaking(); // Stop speaking when button is pressed
            recognition.start();
        });

        talkButton.addEventListener('mouseup', () => {
            recognition.stop();
        });

        talkButton.addEventListener('mouseleave', () => {
            if (isListening) {
                recognition.stop();
            }
        });

        // Touch events for mobile
        talkButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            stopSpeaking();
            recognition.start();
        });

        talkButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            recognition.stop();
        });

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

    // Add control button event listener
    controlButton.addEventListener('click', () => {
        if (isLiveMode) {
            if (!isLiveStarted) {
                startLiveMode();
                showStopButton();
            } else {
                stopLiveMode();
                showStartButton();
            }
        } else {
            // Regular play/pause functionality
            togglePlayPause();
        }
    });

    // Add this function to toggle play/pause
    function togglePlayPause() {
        if (isSpeaking) {
            if (isPaused) {
                window.speechSynthesis.resume();
                controlButton.innerHTML = '<i class="fas fa-pause"></i>';
                isPaused = false;
            } else {
                window.speechSynthesis.pause();
                controlButton.innerHTML = '<i class="fas fa-play"></i>';
                isPaused = true;
            }
        }
    }

    // Add stop button event listener
    stopButton.addEventListener('click', () => {
        stopSpeaking();
        toggleControlButton(false);
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

    function showPauseButton() {
        if (!isLiveMode) {
            controlButton.style.display = 'flex';
            controlButton.innerHTML = '<i class="fas fa-pause"></i>';
            controlButton.classList.add('visible');
            controlButton.classList.remove('live-active');
        }
    }

    function hideControlButtons() {
        controlButton.classList.remove('visible');
        setTimeout(() => {
            controlButton.style.display = 'none';
        }, 200);
    }
}); 