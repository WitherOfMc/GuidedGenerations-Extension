// scripts/guidedImpersonate3rd.js
import { extension_settings, extensionName, debugLog, getPreviousImpersonateInput, setPreviousImpersonateInput, getLastImpersonateResult, setLastImpersonateResult, requestCompletion, shouldUseDirectCall } from './persistentGuides/guideExports.js'; // Import from central hub

const guidedImpersonate3rd = async () => {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations] Textarea #send_textarea not found.');
        return;
    }
    const currentInputText = textarea.value;
    const lastGeneratedText = getLastImpersonateResult(); 

    // Check if the current input matches the last generated text
    if (lastGeneratedText && currentInputText === lastGeneratedText) {
        textarea.value = getPreviousImpersonateInput(); 
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return; 
    }

    // --- If not restoring, proceed with impersonation ---
    setPreviousImpersonateInput(currentInputText); 

    // 1. REGEX CLEANUP: Extract matches and prepare clean text
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
            if (!flags.includes('g')) flags += 'g'; // Force global flag
            
            const regex = new RegExp(pattern, flags);
            const matches = cleanedInputText.match(regex);
            
            if (matches) {
                extractedMatches = matches;
            }
            cleanedInputText = cleanedInputText.replace(regex, '').trim();
            debugLog('[Impersonate-3rd] Regex applied. Extracted:', extractedMatches);
        } catch (e) {
            console.warn('[GuidedGenerations] Invalid Impersonation Regex provided in settings:', e);
        }
    }

    // 2. TEMPORARILY UPDATE UI: Hide matches from the text box 
    // This prevents ST from reading the image into the context prompt!
    if (extractedMatches.length > 0) {
        textarea.value = cleanedInputText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Resolve target profile and preset from settings
    const profileKey = 'profileImpersonate3rd';
    const presetKey = 'presetImpersonate3rd';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const presetValue = extension_settings[extensionName]?.[presetKey] ?? '';
    
    const promptTemplate = extension_settings[extensionName]?.promptImpersonate3rd ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', cleanedInputText);

    let isSuccess = false; // Track if generation completed successfully

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
                
                // 3. RESTORE EXTRACTED CONTENT: Append the saved markdown back to the AI's result
                if (extractedMatches.length > 0) {
                    finalCompletion = finalCompletion + '\n\n' + extractedMatches.join('\n');
                }

                textarea.value = finalCompletion;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                setLastImpersonateResult(finalCompletion);
                isSuccess = true;
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
                
                if (extractedMatches.length > 0) {
                    if (!finalCompletion.includes(extractedMatches[0])) {
                         finalCompletion = finalCompletion + '\n\n' + extractedMatches.join('\n');
                         textarea.value = finalCompletion;
                         textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                
                setLastImpersonateResult(textarea.value);
                isSuccess = true;
                debugLog('[Impersonate-3rd] Slash command completed, input stored.');
            } else {
                console.error('[GuidedGenerations] context.executeSlashCommandsWithOptions not found!');
            }
        }
    } catch (error) {
        console.error(`[GuidedGenerations] Error executing Guided Impersonate (3rd): ${error}`);
        setLastImpersonateResult(''); 
    } finally {
        // 4. SAFETY NET: If generation failed or returned empty, restore the original input
        if (!isSuccess && extractedMatches.length > 0) {
            textarea.value = currentInputText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
};

export { guidedImpersonate3rd };
