// scripts/guidedImpersonate3rd.js
import { extension_settings, extensionName, debugLog, getPreviousImpersonateInput, setPreviousImpersonateInput, getLastImpersonateResult, setLastImpersonateResult, requestCompletion, shouldUseDirectCall } from './persistentGuides/guideExports.js'; // Import from central hub

const guidedImpersonate3rd = async () => {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations] Textarea #send_textarea not found.');
        return;
    }
    const currentInputText = textarea.value;
    const lastGeneratedText = getLastImpersonateResult(); // Use getter

    // Check if the current input matches the last generated text
    if (lastGeneratedText && currentInputText === lastGeneratedText) {
        textarea.value = getPreviousImpersonateInput(); // Use getter
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return; // Restoration done, exit
    }

    // --- If not restoring, proceed with impersonation ---
    setPreviousImpersonateInput(currentInputText); // Use setter

    // 1. REGEX CLEANUP: Strip from AI prompt, but save to restore later so it remains visible
    let cleanedInputText = currentInputText;
    let extractedMatches = [];
    
    const customRegexStr = extension_settings[extensionName]?.impersonationRegex ?? '';
    if (customRegexStr.trim() !== '') {
        try {
            let pattern = customRegexStr;
            let flags = 'g'; // Default to global replace
            
            // Parse format if user enters /pattern/flags
            if (customRegexStr.startsWith('/') && customRegexStr.lastIndexOf('/') > 0) {
                const lastSlash = customRegexStr.lastIndexOf('/');
                pattern = customRegexStr.substring(1, lastSlash);
                flags = customRegexStr.substring(lastSlash + 1);
            }
            if (!flags.includes('g')) flags += 'g'; // Force global flag to catch all instances
            
            const regex = new RegExp(pattern, flags);
            
            // Store the matches (e.g., the ![](...) markdown)
            const matches = cleanedInputText.match(regex);
            if (matches) {
                extractedMatches = matches;
            }
            
            // Remove the matches from the text we are about to send to the AI
            cleanedInputText = cleanedInputText.replace(regex, '').trim();
            debugLog('[Impersonate-3rd] Regex applied. Extracted:', extractedMatches);
        } catch (e) {
            console.warn('[GuidedGenerations] Invalid Impersonation Regex provided in settings:', e);
        }
    }

    // Resolve target profile and preset from settings
    const profileKey = 'profileImpersonate3rd';
    const presetKey = 'presetImpersonate3rd';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const presetValue = extension_settings[extensionName]?.[presetKey] ?? '';
    
    debugLog(`[Impersonate-3rd] Using profile: ${profileValue || 'current'}, preset: ${presetValue || 'none'}`);
    
    // Use user-defined impersonate prompt override, but inject the CLEANED text
    const promptTemplate = extension_settings[extensionName]?.promptImpersonate3rd ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', cleanedInputText);

    try {
        const useDirectCall = true;
        if (useDirectCall) {
            debugLog('[Impersonate-3rd] Requesting direct completion...');
            let completion = await requestCompletion({
                profileName: profileValue,
                presetName: presetValue,
                prompt: filledPrompt,
                debugLabel: 'impersonate:3rd',
            });

            if (completion && completion.trim() !== '') {
                let finalCompletion = completion.trim();
                
                // 2. RESTORE EXTRACTED CONTENT: Prepend the saved markdown back to the AI's result
                if (extractedMatches.length > 0) {
                    finalCompletion = extractedMatches.join(' ') + ' ' + finalCompletion;
                }

                textarea.value = finalCompletion;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                setLastImpersonateResult(finalCompletion);
                debugLog('[Impersonate-3rd] Completion received and stored.');
            } else {
                debugLog('[Impersonate-3rd] Completion empty, input unchanged.');
            }
        } else {
            const context = SillyTavern.getContext();
            if (typeof context.executeSlashCommandsWithOptions === 'function') {
                const stscriptCommand = `/impersonate await=true ${filledPrompt} |`;
                await context.executeSlashCommandsWithOptions(stscriptCommand);
                
                let finalCompletion = textarea.value.trim();
                
                // Restore matches for the slash command fallback as well
                if (extractedMatches.length > 0) {
                    // Check to avoid duplicating if the slash command mysteriously kept it
                    if (!finalCompletion.includes(extractedMatches[0])) {
                         finalCompletion = extractedMatches.join(' ') + ' ' + finalCompletion;
                         textarea.value = finalCompletion;
                         textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                
                setLastImpersonateResult(textarea.value);
                debugLog('[Impersonate-3rd] Slash command completed, input stored.');
            } else {
                console.error('[GuidedGenerations] context.executeSlashCommandsWithOptions not found!');
            }
        }
    } catch (error) {
        console.error(`[GuidedGenerations] Error executing Guided Impersonate (3rd): ${error}`);
        setLastImpersonateResult(''); // Use setter to clear shared state on error
    }
};

export { guidedImpersonate3rd };
