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
    const SILENCE_THRESHOLD = 2000; // Changed to 2 seconds
    let lastSpeechTimestamp = Date.now();

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

    // Update the voice initialization function
    async function initVoice() {
        return new Promise((resolve) => {
            let voiceInitAttempts = 0;
            const maxAttempts = 10;

            function initializeVoices() {
                let voices = window.speechSynthesis.getVoices();
                
                if (voices.length === 0 && voiceInitAttempts < maxAttempts) {
                    voiceInitAttempts++;
                    setTimeout(initializeVoices, 250);
                    return;
                }

                // Force voices refresh in Chrome
                voices = window.speechSynthesis.getVoices();

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
        
        if (selectedVoice) {
            // Force voice refresh
            window.speechSynthesis.cancel();
            
            // Test the selected voice with a delay
            setTimeout(() => {
                const testUtterance = new SpeechSynthesisUtterance('Testing voice change');
                testUtterance.voice = selectedVoice;
                testUtterance.lang = selectedVoice.lang;
                window.speechSynthesis.speak(testUtterance);
            }, 100);
            
            savePreferences();
            updateLanguageDisplay();
        }
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
        { model: 'llama-3.1-70b-versatile', name: 'Llama 3.1 (70B)' },
        { model: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo (16K)' },
        { model: 'gemma-7b-it', name: 'Gemma 7B' },
        { model: 'gemma2-9b-it', name: 'Gemma 2 9B' },
        { model: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Fast)' },
        { model: 'llama-3.2-11b-text-preview', name: 'Llama 3.2 11B' },
        { model: 'llama-3.2-90b-text-preview', name: 'Llama 3.2 90B' },
        { model: 'llama-guard-3-8b', name: 'Llama Guard 3 8B' },
        { model: 'llama3-70b-8192', name: 'Llama 3 70B (8K)' },
        { model: 'llama3-8b-8192', name: 'Llama 3 8B (8K)' },
        { model: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }
    ];

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

    // Update the speak function with better Chrome compatibility
    function speak(text) {
        return new Promise((resolve) => {
            if (isSpeaking) {
                window.speechSynthesis.cancel();
            }

            manageMicrophone('stop');

            const utterance = new SpeechSynthesisUtterance(text);
            currentUtterance = utterance;
            
            // Force voice selection for Chrome
            const voices = window.speechSynthesis.getVoices();
            if (selectedVoice) {
                // Find the voice again from current voices list
                const currentVoice = voices.find(v => v.name === selectedVoice.name);
                utterance.voice = currentVoice || selectedVoice;
                utterance.lang = currentVoice?.lang || selectedVoice.lang;
            }

            // Set rate and pitch for better reliability
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

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
                    }, 100);
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

            // Chrome fix: Cancel any ongoing speech before starting new one
            window.speechSynthesis.cancel();
            
            // Small delay before speaking (helps Chrome)
            setTimeout(() => {
                window.speechSynthesis.speak(utterance);
            }, 50);
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

            // Update last speech timestamp
            lastSpeechTimestamp = Date.now();

            // Clear existing silence timer
            if (silenceTimer) {
                clearTimeout(silenceTimer);
            }

            // Set new silence timer
            silenceTimer = setTimeout(() => {
                if (isListening && !isSpeaking) {
                    stopRecording();
                    updateStatus('processing');
                }
            }, SILENCE_THRESHOLD);

            // Show listening status when user is speaking
            if (isLiveMode) {
                updateStatus('listening');
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal && transcript.trim().length > 0) {
                    finalTranscript += transcript + ' ';
                    
                    if (isSpeaking) {
                        stopSpeaking();
                    }

                    // Send transcript in live mode
                    if (isLiveMode) {
                        socket.emit('transcript', {
                            model: selectedAiModel,
                            final: transcript.trim(),
                            interim: ''
                        });
                        updateStatus('processing');
                    }
                } else {
                    interimTranscript += transcript;
                }
            }

            // For non-live mode, send complete transcript
            if (!isLiveMode && finalTranscript.trim()) {
                socket.emit('transcript', {
                    final: finalTranscript.trim(),
                    interim: interimTranscript,
                    model: selectedAiModel
                });
            }

            transcriptDiv.innerHTML = finalTranscript || interimTranscript;
        };

        // Update GPT response handler
        socket.on('gpt-response', async (data) => {
            responseDiv.textContent = data.text;
            responseDiv.scrollTop = responseDiv.scrollHeight;
            
            try {
                // Stop any ongoing speech
                if (isSpeaking) {
                    window.speechSynthesis.cancel();
                    isSpeaking = false;
                    isPaused = false;
                }

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

        // Simplified button event listeners
        talkButton.addEventListener('click', (e) => {
            if (!isListening) {
                startRecording(e);
            } else {
                stopRecording(e);
            }
        });

        // Helper function to handle start of recording
        function startRecording(e) {
            if (e) e.preventDefault();
            if (isSpeaking) stopSpeaking();
            
            talkButton.classList.add('active');
            voiceWave.classList.add('speaking');
            
            try {
                recognition.continuous = true; // Always continuous
                recognition.start();
                lastSpeechTimestamp = Date.now();
            } catch (error) {
                console.error('Recognition start error:', error);
            }
        }

        // Helper function to handle end of recording
        function stopRecording(e) {
            if (e) e.preventDefault();
            talkButton.classList.remove('active');
            
            try {
                recognition.stop();
            } catch (error) {
                console.error('Recognition stop error:', error);
            }
        }

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


    // Add this near the end of your DOMContentLoaded event listener
    function checkAndFixSpeechSynthesis() {
        if (isSpeaking) {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            
            // Chrome bug workaround: if speaking but no audio, restart
            if (currentUtterance && !window.speechSynthesis.speaking) {
                window.speechSynthesis.speak(currentUtterance);
            }
        }
    }

    // Run the check frequently
    setInterval(checkAndFixSpeechSynthesis, 100);

}); 