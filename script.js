// Main script for chat-based image generation and prompt combination  
  
// Ensure the DOM is fully loaded before executing the script  
document.addEventListener('DOMContentLoaded', async () => {  
    // ======== ENVIRONMENT VARIABLES ========  
    // Sensitive variables are moved to environment variables for security.  
    const azureEndpoint = process.env.AZURE_ENDPOINT || "https://your-azure-endpoint.com/";  
    const apiKey = process.env.AZURE_API_KEY || "your-api-key";  
    const apiVersion = process.env.AZURE_API_VERSION || "2024-10-01-preview";  
    const model = process.env.AZURE_MODEL || "gpt-4o-mini";  
    const imageGenerationUrl = process.env.IMAGE_GENERATION_URL || "https://your-image-generation-url.com/";  
    const storageAccountName = process.env.STORAGE_ACCOUNT_NAME || "your-storage-account-name";  
    const containerName = process.env.CONTAINER_NAME || "your-container-name";  
    const sasToken = process.env.SAS_TOKEN || "your-sas-token";  
  
    // ======== DOM ELEMENTS ========  
    // Cache frequently used DOM elements for better performance  
    const chatWindow = document.getElementById('chat-window');  
    const userInput = document.getElementById('user-input');  
    const sendButton = document.getElementById('send-button');  
    const imageUpload = document.getElementById('image-upload');  
    const modal = document.getElementById('image-modal');  
    const enlargedImg = document.getElementById('enlarged-img');  
    const downloadLink = document.getElementById('download-link');  
    const closeModalButton = document.querySelector('.close');  
    const showRecommendationsCheckbox = document.getElementById('show-recommendations');  
    const recommendationsDiv = document.getElementById('recommendations');  
    const promptLibrary = document.querySelector('.prompt-library');  
    const directImageGenerationCheckbox = document.getElementById('direct-image-generation');  
    const newSessionButton = document.getElementById('new-session-button');  
    const optionsMenuButton = document.getElementById('options-menu-button');  
    const infoButton = document.getElementById('info-button');  
  
    // ======== STATE VARIABLES ========  
    // Manage application state using global variables  
    let messages = [];  
    let finalPrompt = null;  
    let selectedPrompt = null;  
    let awaitingFollowupResponse = false;  
    let awaitingImageExplanation = false;  
    let dynamicChatActive = false;  
    let dynamicChatQuestionCount = 0;  
    let awaitingPromptCombination = false;  
    let awaitingCombinationMethod = false;  
    let awaitingUserPrompt = false;  
    let hasAskedPromptCombination = false;  
  
    const QUESTION_TOPICS = ["colors", "textures", "shapes", "lighting", "depth", "style"];  
    const promptCache = new Map(); // Cache to store loaded prompts  
  
    // ======== EVENT LISTENERS ========  
  
    /**  
     * Reloads the session when the "New Session" button is clicked.  
     */  
    newSessionButton.addEventListener('click', () => {  
        location.reload();  
    });  
  
    /**  
     * Toggles the send button based on whether the user input is empty.  
     */  
    userInput.addEventListener('input', toggleSendButton);  
    function toggleSendButton() {  
        sendButton.style.display = userInput.value.trim() === '' ? 'none' : 'block';  
    }  
  
    /**  
     * Handles the enter keypress event for sending messages.  
     */  
    userInput.addEventListener('keypress', (event) => {  
        if (event.key === 'Enter') {  
            sendMessage();  
        }  
    });  
  
    /**  
     * Sends the user's input message when the "Send" button is clicked.  
     */  
    sendButton.addEventListener('click', sendMessage);  
  
    /**  
     * Toggles the visibility of categories in the prompt library.  
     */  
    promptLibrary.addEventListener('click', (event) => {  
        if (event.target && event.target.matches('.category-heading')) {  
            const categoryId = event.target.dataset.category;  
            toggleCategory(categoryId);  
        }  
    });  
  
    /**  
     * Opens the image modal with the enlarged image.  
     */  
    closeModalButton.addEventListener('click', closeModal);  
    window.addEventListener('click', (event) => {  
        if (event.target === modal) {  
            closeModal();  
        }  
    });  
  
    /**  
     * Handles image upload for generating explanations.  
     */  
    imageUpload.addEventListener('change', (event) => {  
        const file = event.target.files[0];  
        if (file) {  
            const reader = new FileReader();  
            reader.onload = async () => {  
                const base64Image = reader.result.split(',')[1];  
                showLoader();  
                const explanation = await getImageExplanation(base64Image);  
                hideLoader();  
                if (explanation && !explanation.includes("Failed")) {  
                    addMessage("assistant", explanation);  
                    finalPrompt = explanation;  
                    awaitingImageExplanation = true;  
                } else {  
                    addMessage("assistant", "Failed to get image explanation.");  
                }  
            };  
            reader.readAsDataURL(file);  
        }  
    });  
  
    /**  
     * Toggles direct image generation based on checkbox state.  
     */  
    directImageGenerationCheckbox.addEventListener('change', async (event) => {  
        if (event.target.checked) {  
            const userInputValue = userInput.value;  
            const conversationHistory = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');  
  
            const prompt = `Based on the user's input "${userInputValue}" and our conversation "${conversationHistory}", generate a detailed image description. Ensure the description includes specific visual elements, styles, and any other relevant details to create a high-quality image.`;  
  
            const imageDescription = await callAzureOpenAI([  
                { role: "system", content: "You are an AI assistant that generates detailed image descriptions for direct image generation." },  
                { role: "user", content: prompt }  
            ], 750, 0.7);  
  
            if (imageDescription) {  
                finalPrompt = imageDescription;  
                console.log("Generated Image Description:", imageDescription);  
            } else {  
                console.error("Failed to generate image description.");  
            }  
        }  
    });  
  
    /**  
     * Toggles the dropdown menu in the options section.  
     */  
    optionsMenuButton.addEventListener('click', () => {  
        const dropdown = document.querySelector('.dropdown-content');  
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';  
    });  
  
    /**  
     * Toggles the visibility of the info modal.  
     */  
    infoButton.addEventListener('click', toggleInfoModal);  
    function toggleInfoModal() {  
        const infoModal = document.getElementById('info-modal');  
        infoModal.style.display = infoModal.style.display === 'block' ? 'none' : 'block';  
    }  
  
    // ======== FUNCTIONS ========  
  
    /**  
     * Toggles the visibility of a category in the prompt library.  
     * @param {string} categoryId - The ID of the category to toggle.  
     */  
    function toggleCategory(categoryId) {  
        const categoryElement = document.getElementById(categoryId);  
        if (categoryElement) {  
            categoryElement.style.display = categoryElement.style.display === 'none' ? 'block' : 'none';  
        }  
    }  
  
    /**  
     * Adds a message to the chat window.  
     * @param {string} role - The role of the message sender ("user" or "assistant").  
     * @param {string} content - The content of the message.  
     * @param {boolean} isHTML - Whether the content should be treated as HTML.  
     */  
    function addMessage(role, content, isHTML = false) {  
        const messageElement = document.createElement('div');  
        messageElement.className = role === "user" ? 'message user-message' : 'message assistant-message';  
  
        const messageContent = document.createElement('div');  
        messageContent.className = 'message-content';  
  
        if (isHTML) {  
            messageContent.innerHTML = content;  
        } else {  
            messageContent.textContent = content;  
        }  
  
        if (role === "assistant") {  
            const icon = document.createElement('i');  
            icon.className = 'fa-solid fa-palette message-icon';  
            messageElement.appendChild(icon);  
        }  
  
        messageElement.appendChild(messageContent);  
        chatWindow.appendChild(messageElement);  
        chatWindow.scrollTop = chatWindow.scrollHeight;  
  
        messages.push({ role, content });  
    }  
  
    /**  
     * Displays the loader in the chat window.  
     */  
    function showLoader() {  
        const loaderElement = document.createElement('div');  
        loaderElement.className = 'loader';  
        loaderElement.id = 'loader';  
  
        for (let i = 0; i < 3; i++) {  
            const dot = document.createElement('div');  
            dot.className = 'dot';  
            loaderElement.appendChild(dot);  
        }  
  
        chatWindow.appendChild(loaderElement);  
        chatWindow.scrollTop = chatWindow.scrollHeight;  
    }  
  
    /**  
     * Hides the loader from the chat window.  
     */  
    function hideLoader() {  
        const loaderElement = document.getElementById('loader');  
        if (loaderElement) {  
            loaderElement.remove();  
        }  
    }  
  
    /**  
     * Opens the image modal to display an enlarged version of the image.  
     * @param {string} imgSrc - The source URL of the image.  
     */  
    function openModal(imgSrc) {  
        modal.style.display = 'block';  
        enlargedImg.src = imgSrc;  
        downloadLink.href = imgSrc;  
    }  
  
    /**  
     * Closes the image modal.  
     */  
    function closeModal() {  
        modal.style.display = 'none';  
    }  
  
    // ======== API CALLS ========  
  
    /**  
     * Makes a call to Azure OpenAI service.  
     * @param {Array} messages - The conversation messages.  
     * @param {number} maxTokens - Maximum tokens for the response.  
     * @param {number} temperature - Sampling temperature for randomness.  
     * @returns {Promise<string>} - The response from OpenAI.  
     */  
    async function callAzureOpenAI(messages, maxTokens, temperature) {  
        try {  
            const response = await fetch(`${azureEndpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`, {  
                method: 'POST',  
                headers: {  
                    'Content-Type': 'application/json',  
                    'api-key': apiKey  
                },  
                body: JSON.stringify({ messages, temperature, max_tokens: maxTokens })  
            });  
  
            const data = await response.json();  
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {  
                throw new Error("Invalid response structure");  
            }  
            return data.choices[0].message.content.trim();  
        } catch (error) {  
            console.error('Error in API call:', error);  
            return "Error in API call.";  
        }  
    }  
});  
