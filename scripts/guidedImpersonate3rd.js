// scripts/guidedImpersonate3rd.js
import { extension_settings, extensionName, debugLog, getPreviousImpersonateInput, setPreviousImpersonateInput, getLastImpersonateResult, setLastImpersonateResult, requestCompletion, shouldUseDirectCall } from './persistentGuides/guideExports.js';

const guidedImpersonate3rd = async () => {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations] Textarea #send_textarea not found.');
        return;
    }
    const currentInputText = textarea.value;
    const lastGeneratedText = getLastImpersonateResult(); 

    if (lastGeneratedText && currentInputText === lastGeneratedText) {
        textarea.value = getPreviousImpersonateInput(); 
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return; 
    }

    setPreviousImpersonateInput(currentInputText); 

    // 1. REGEX CLEANUP: Extract matches and prepare clean text
    let cleanedInputText = currentInputText;
    let extractedMatches = [];
    let builtRegex = null;

    const customRegexStr = extension_settings[extensionName]?.impersonationRegex ?? '';
    if (customRegexStr.trim() !== '') {
        try {
            let pattern = customRegexStr;
            let flags = 'g';

            if (customRegexStr.startsWith('/') && customRegexStr.lastIndexOf('/') > 0) {
                const lastSlash = customRegexStr.lastIndexOf('/');
                pattern = customRegexStr.substring(1, lastSlash);
                flags = customRegexStr.substring(lastSlash + 1);
            }
            if (!flags.includes('g')) flags += 'g';

            builtRegex = new RegExp(pattern, flags);
            const matches = cleanedInputText.match(builtRegex);
            if (matches) extractedMatches = matches;
            cleanedInputText = cleanedInputText.replace(builtRegex, '').trim();
            debugLog('[Impersonate-3rd] Regex applied. Extracted:', extractedMatches);
        } catch (e) {
            console.warn('[GuidedGenerations] Invalid Impersonation Regex provided in settings:', e);
        }
    }

    // NOTE: No textarea update here — direct calls use filledPrompt, not textarea.value.
    // The image markdown is already excluded from cleanedInputText / filledPrompt.
    // builtRegex is passed to requestCompletion to also strip it from context.chat.

    const profileKey = 'profileImpersonate3rd';
    const presetKey = 'presetImpersonate3rd';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const presetValue = extension_settings[extensionName]?.[presetKey] ?? '';

    const promptTemplate = extension_settings[extensionName]?.promptImpersonate3rd ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', cleanedInputText);

    let isSuccess = false;

    try {
        const useDirectCall = true;
        if (useDirectCall) {
            debugLog('[Impersonate-3rd] Requesting direct completion...');
            let completion = await requestCompletion({
                profileName: profileValue,
                presetName: presetValue,
                prompt: filledPrompt,
                debugLabel: 'impersonate:3rd',
                cleanupRegex: builtRegex,
            });

            if (completion && completion.trim() !== '') {
                let finalCompletion = completion.trim();

                // 2. RESTORE EXTRACTED CONTENT: Append saved markdown back to the result
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
                // For slash commands, ST WILL read textarea — so clean it first here only
                if (extractedMatches.length > 0) {
                    textarea.value = cleanedInputText;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }

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
        // SAFETY NET: restore original input if generation failed
        if (!isSuccess && extractedMatches.length > 0) {
            textarea.value = currentInputText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
};

export { guidedImpersonate3rd };
