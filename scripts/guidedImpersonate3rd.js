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

    // Resolve target profile and preset from settings
    const profileKey = 'profileImpersonate3rd';
    const presetKey = 'presetImpersonate3rd';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const presetValue = extension_settings[extensionName]?.[presetKey] ?? '';
    
    // Debug: Log the exact values being retrieved
    debugLog(`[Impersonate-3rd] Profile key: "${profileKey}"`);
    debugLog(`[Impersonate-3rd] Preset key: "${presetKey}"`);
    debugLog(`[Impersonate-3rd] Profile value from settings: "${profileValue}"`);
    debugLog(`[Impersonate-3rd] Preset value from settings: "${presetValue}"`);
    debugLog(`[Impersonate-3rd] All profile settings:`, Object.keys(extension_settings[extensionName] || {}).filter(key => key.startsWith('profile')));
    
    debugLog(`[Impersonate-3rd] Using profile: ${profileValue || 'current'}, preset: ${presetValue || 'none'}`);
    
    // Use user-defined impersonate prompt override
    const promptTemplate = extension_settings[extensionName]?.promptImpersonate3rd ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', currentInputText);

    try {
        const useDirectCall = true;
        if (useDirectCall) {
            debugLog('[Impersonate-3rd] Requesting direct completion...');
            // Changed from const to let so we can modify it with the regex
            let completion = await requestCompletion({
                profileName: profileValue,
                presetName: presetValue,
                prompt: filledPrompt,
                debugLabel: 'impersonate:3rd',
            });

            if (completion && completion.trim() !== '') {
                // Apply Custom Cleanup Regex if defined in settings
                const customRegexStr = extension_settings[extensionName]?.impersonationRegex ?? '';
                if (customRegexStr.trim() !== '') {
                    try {
                        let pattern = customRegexStr;
                        let flags = 'g'; // Default to global replace
                        
                        // Parse format if user enters /pattern/flags
                        if (customRegexStr.startsWith('/') && customRegexStr.lastIndexOf('/') > 0) {
                            const lastSlash = customRegexStr.lastIndexOf('/');
                            pattern = customRegexStr.substring(1, lastSlash);
                            flags = customRegexStr.substring(lastSlash + 1) || 'g';
                        }
                        
                        const regex = new RegExp(pattern, flags);
                        completion = completion.replace(regex, '');
                    } catch (e) {
                        console.warn('[GuidedGenerations] Invalid Impersonation Regex provided in settings:', e);
                    }
                }

                textarea.value = completion;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                setLastImpersonateResult(completion);
                debugLog('[Impersonate-3rd] Completion received and stored.');
            } else {
                debugLog('[Impersonate-3rd] Completion empty, input unchanged.');
            }
        } else {
            const context = SillyTavern.getContext();
            if (typeof context.executeSlashCommandsWithOptions === 'function') {
                const stscriptCommand = `/impersonate await=true ${filledPrompt} |`;
                await context.executeSlashCommandsWithOptions(stscriptCommand);
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

// Export the function
export { guidedImpersonate3rd };
