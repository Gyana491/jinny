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
    let selectedAiModel = null;
    let isLiveStarted = false;

    const voiceSelect = document.getElementById('voice-select');
    const languageSelect = document.getElementById('language-select');
    const modelSelect = document.getElementById('model-select');


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
        if (selectedAiModel) {
            localStorage.setItem('selectedAiModel', selectedAiModel);
        }
    }

    function loadPreferences() {
        selectedAiModel = localStorage.getItem('selectedAiModel') || 'llama-3.1-70b-versatile';
        return {
            voiceName: localStorage.getItem('selectedVoiceName'),
            language: localStorage.getItem('selectedLanguage') || 'en-GB',
            aiModel: localStorage.getItem('selectedAiModel') || 'llama-3.1-70b-versatile'
        };
    }

    // Add these helper functions near the top of your script
    const languageMap = {
        'en-GB': { flag: '🇬🇧', name: 'English' },
        'en-US': { flag: '🇺🇸', name: 'English' },
        'en': { flag: '🇬🇧', name: 'English' }, // Generic English fallback
        'hi-IN': { flag: '🇮🇳', name: 'हिन्दी' },
        'hi': { flag: '🇮🇳', name: 'हिन्दी' }, // Generic Hindi fallback
        'bn-IN': { flag: '🇮🇳', name: 'বাংলা' },
        'ta-IN': { flag: '🇮🇳', name: 'தமிழ்' },
        'te-IN': { flag: '🇮🇳', name: 'తెలుగు' },
        'mr-IN': { flag: '🇮🇳', name: 'मराठी' },
        'or-IN': { flag: '🇮🇳', name: 'ଓଡ଼ିଆ' },
        'or': { flag: '🇮🇳', name: 'ଓଡ଼ିଆ' } // Generic Odia fallback
    };

    // Helper function to get language code from full locale
    function getBaseLanguageCode(fullCode) {
        // First try the full code
        if (languageMap[fullCode]) {
            return fullCode;
        }
        // Then try the base language code
        const baseCode = fullCode.split('-')[0];
        return languageMap[baseCode] ? baseCode : fullCode;
    }

    // Update the language display function
    function updateLanguageDisplay() {
        const inputLang = recognition ? recognition.lang : 'en-GB';
        const outputLang = selectedVoice ? selectedVoice.lang : 'hi-IN';
        
        // console.log('Current voice:', selectedVoice); // Debug log
        // console.log('Output language:', outputLang); // Debug log
        
        const inputCode = getBaseLanguageCode(inputLang);
        const outputCode = outputLang;
        
        const inputInfo = inputCode ? `${inputCode}` :"unknown";
        const outputInfo = outputCode ? `${outputCode}` :"unknown";
        
        const displayElement = document.getElementById('languageDisplay');
        if (displayElement) {
            displayElement.textContent = `${inputInfo} → ${outputInfo} `;
            // console.log('Updated language display:', displayElement.textContent); // Debug log
        }
    }

    function updateModelDisplay() {
        const displayElement = document.getElementById('modelDisplay');
        if (displayElement) {
            displayElement.textContent = `${selectedAiModel}`;
        }
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
                    const langCode = getBaseLanguageCode(voice.lang);
                    const langInfo = languageMap[langCode] || { flag: '🌐', name: 'Unknown' };
                    option.textContent = `${langInfo.flag} ${voice.name} (${voice.lang})`;
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
                        voice.lang.startsWith('hi')
                    ) || voices.find(voice => 
                        voice.lang.startsWith('hi')
                    ) || voices[0];

                    if (selectedVoice) {
                        voiceSelect.value = selectedVoice.name;
                    }
                }

                console.log('Voice initialized:', selectedVoice?.name);
                console.log('Voice language:', selectedVoice?.lang);
                console.log('Available voices:', voices.length);

                // Update language display after voices are initialized
                updateLanguageDisplay();
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
        
        console.log('Selected voice:', selectedVoice); // Debug log
        console.log('Voice language:', selectedVoice?.lang); // Debug log
        
        // Test the selected voice
        const testUtterance = new SpeechSynthesisUtterance('Testing voice change');
        testUtterance.voice = selectedVoice;
        window.speechSynthesis.speak(testUtterance);
        
        // Save preference
        savePreferences();
        
        // Update language display
        updateLanguageDisplay();
        
        console.log('Voice changed to:', selectedVoice.name);
    });

    // Language selection change handler
    languageSelect.addEventListener('change', (e) => {
        recognition.lang = e.target.value;
        savePreferences();
        
        // Update language display
        updateLanguageDisplay();
        
        console.log('Recognition language changed to:', e.target.value);
    });
    modelSelect.addEventListener('change', (e) => {
        selectedAiModel = e.target.value;
        savePreferences();
        updateModelDisplay();
        console.log('AI model changed to:', selectedAiModel);
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

    // Add language options
    const models = [
        { model: 'llama-3.1-70b-versatile',  name: 'Llama 3.1 (70B)' },
        {model: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo (16K)'},
        
    ]

    // Populate language selector
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model;
        option.textContent = `${model.name}`;
        modelSelect.appendChild(option);
    });

    function initAiModel() {
        const prefs = loadPreferences();
        if (prefs.aiModel) {
            selectedAiModel = prefs.aiModel;
            modelSelect.value = selectedAiModel;
        }
        updateModelDisplay();

    }
    initAiModel();


    // Show the selector container
    document.querySelector('.selector-container').style.display = 'flex';

    // Function to stop speaking
    function stopSpeaking() {
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
            isPaused = false;
            voiceWave.classList.remove('speaking');
            updateStatus('ready');
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
                statusDiv.innerHTML = '<span style="color: green; white-space: nowrap;"><i class="fas fa-broadcast-tower"></i> Live Mode Active</span>';
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
                        console.log('Emitting transcript (live mode):', {
                            model: selectedAiModel,
                            final: transcript.trim(),
                            interim: ''
                        });
                        socket.emit('transcript', {
                            model: selectedAiModel,
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
                console.log('Emitting transcript (normal mode):', {
                    final: finalTranscript.trim(),
                    interim: interimTranscript,
                    model: selectedAiModel
                });
                socket.emit('transcript', {
                    final: finalTranscript.trim(),
                    interim: interimTranscript,
                    model: selectedAiModel
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
                updateStatus('speaking');
                // Turn off microphone before speaking
                manageMicrophone('stop');
                await speak(data.text);
                
                if (isLiveMode) {
                    updateStatus('live');
                    // Turn microphone back on in live mode
                    manageMicrophone('start');
                } else {
                    updateStatus('ready');
                    if (!isSpeaking && !isListening) {
                        setTimeout(() => {
                            voiceWave.classList.remove('speaking');
                            
                        }, 1000);
                    }
                }
            } catch (error) {
                console.error('Speech error:', error);
                if (isLiveMode) {
                    manageMicrophone('start');
                }
                
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


    // Add this to handle Chrome's speech synthesis bugs
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isSpeaking && isPaused) {
            window.speechSynthesis.resume();
        }
    });


}); 