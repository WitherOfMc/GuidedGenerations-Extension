/**
 * @file Contains the logic for the Corrections tool.
 */
import { getContext, extension_settings, extensionName, debugLog, setPreviousImpersonateInput, requestCompletion, shouldUseDirectCall } from '../persistentGuides/guideExports.js';

/**
 * Provides a tool to modify the last message based on user's instructions
 * 
 * @returns {Promise<void>}
 */
export default async function corrections() {
    debugLog('[GuidedGenerations][Corrections] Tool activated.');
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations][Corrections] Textarea #send_textarea not found.');
        return;
    }
    const originalInput = textarea.value; // Get current input

    // Save the input state using the shared function
    setPreviousImpersonateInput(originalInput);
    debugLog(`[GuidedGenerations][Corrections] Original input saved: "${originalInput}"`);

    // Use user-defined corrections prompt override
    const promptTemplate = extension_settings[extensionName]?.promptCorrections ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', originalInput);

    // Determine target profile and preset from settings
    const profileKey = 'profileCorrections';
    const presetKey = 'presetCorrections';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const targetPreset = extension_settings[extensionName]?.[presetKey] ?? '';
    debugLog(`[GuidedGenerations][Corrections] Using profile: ${profileValue || 'current'}, preset: ${targetPreset || 'none'}`);
    const context = getContext();
    
    try {
        if (!context || !context.chat || context.chat.length === 0) {
            console.error('[GuidedGenerations][Corrections] No chat messages available to correct.');
            return;
        }

        const lastMessage = context.chat[context.chat.length - 1];
        const messageToRewrite = lastMessage?.mes || '';
        const promptForModel = `${filledPrompt}\n\nMessage to rewrite:\n${messageToRewrite}`;

        const useDirectCall = await shouldUseDirectCall(profileValue, targetPreset);
        let correctedText = '';
        if (useDirectCall) {
            debugLog('[GuidedGenerations][Corrections] Requesting direct completion...');
            correctedText = await requestCompletion({
                profileName: profileValue,
                presetName: targetPreset,
                prompt: promptForModel,
                debugLabel: 'corrections',
                includeChatHistory: false,
            });
        } else if (typeof context.executeSlashCommandsWithOptions === 'function') {
            const result = await context.executeSlashCommandsWithOptions(`/genraw ${promptForModel}`, {
                showOutput: false,
                handleExecutionErrors: true,
            });
            correctedText = result?.pipe || '';
        } else {
            console.error('[GuidedGenerations] context.executeSlashCommandsWithOptions not found!');
        }

        if (!correctedText || correctedText.trim() === '') {
            console.error('[GuidedGenerations][Corrections] No corrected text received.');
            return;
        }

        await applyCorrectionSwipe(context, correctedText);
    } catch (error) {
        console.error("[GuidedGenerations][Corrections] Error during Corrections tool execution:", error);
        alert(`Corrections Tool Error: ${error.message || 'An unexpected error occurred.'}`);
    } finally {
        debugLog('[GuidedGenerations][Corrections] Corrections tool finished.');
    }
}

/**
 * Helper function to execute ST-Script commands
 * @param {string} stscript - The ST-Script command to execute
 */
async function applyCorrectionSwipe(context, correctedText) {
    const messageIndex = context.chat.length - 1;
    const messageData = context.chat[messageIndex];
    if (!messageData) {
        console.error('[GuidedGenerations][Corrections] Could not find last message to update.');
        return;
    }

    if (!Array.isArray(messageData.swipes)) {
        messageData.swipes = [messageData.mes];
    }

    messageData.swipes.push(correctedText);
    messageData.swipe_id = messageData.swipes.length - 1;
    messageData.mes = correctedText;

    const mesDom = document.querySelector(`#chat .mes[mesid="${messageIndex}"]`);
    if (mesDom && typeof context.messageFormatting === 'function') {
        const mesTextElement = mesDom.querySelector('.mes_text');
        if (mesTextElement) {
            mesTextElement.innerHTML = context.messageFormatting(
                messageData.mes,
                messageData.name,
                messageData.is_system,
                messageData.is_user,
                messageIndex
            );
        }
        [...mesDom.querySelectorAll('.swipes-counter')].forEach((it) => {
            it.textContent = `${messageData.swipe_id + 1}/${messageData.swipes.length}`;
        });
    }

    if (context.eventSource && context.event_types) {
        context.eventSource.emit(context.event_types.MESSAGE_SWIPED, messageIndex);
    }

    if (typeof context.saveChat === 'function') {
        await context.saveChat();
    }
}

// Export the function
export { corrections };
