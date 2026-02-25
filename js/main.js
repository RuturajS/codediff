/**
 * Codediff — Main Application Controller
 *
 * Features:
 *  - Compare (Myers diff, inline default, side-by-side toggle)
 *  - Per-pane Find bar (text / regex / whole-word / case-sensitive)
 *  - Copy All button per pane
 *  - Suggestion panel (changed lines → one-click Apply / Apply All)
 *  - Vertical resize handle (drag diff output bigger/smaller)
 *  - Horizontal pane resizer
 *  - File upload & drag-drop
 *  - Scroll sync, keyboard shortcuts, fullscreen, toast
 */

(function MainApp() {
    'use strict';

    // ─────────────────────────────────────────────────────────
    //  DOM REFERENCES
    // ─────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    const editorLeft = $('editorLeft');
    const editorRight = $('editorRight');
    const compareBtn = $('compareBtn');
    const clearAllBtn = $('clearAllBtn');
    const clearLeft = $('clearLeft');
    const clearRight = $('clearRight');
    const swapBtn = $('swapBtn');
    const copyDiffBtn = $('copyDiffBtn');
    const downloadBtn = $('downloadDiffBtn');
    const focusDiffBtn = $('focusDiffBtn');
    const copyAllLeft = $('copyAllLeft');
    const copyAllRight = $('copyAllRight');
    const diffOutput = $('diffOutput');
    const diffPlaceholder = $('diffPlaceholder');
    const paneLeft = $('paneLeft');
    const paneRight = $('paneRight');
    const resizer = $('resizer');
    const diffVResizer = $('diffVResizer');
    const editorsRow = $('editorsRow');
    const diffOutputSection = $('diffOutputSection');
    const workspace = $('workspace');
    const fileInputLeft = $('fileInputLeft');
    const fileInputRight = $('fileInputRight');
    const fileNameLeft = $('fileNameLeft');
    const fileNameRight = $('fileNameRight');
    const dropZoneLeft = $('dropZoneLeft');
    const dropZoneRight = $('dropZoneRight');
    const statAddedCount = $('statAddedCount');
    const statRemovedCount = $('statRemovedCount');
    const statChangedCount = $('statChangedCount');
    const ignoreWhitespaceChk = $('ignoreWhitespace');
    const jsonModeChk = $('jsonMode');
    const fullscreenBtn = $('fullscreenBtn');
    const shortcutsModal = $('shortcutsModal');
    const closeShortcuts = $('closeShortcuts');
    const viewSideBySide = $('viewSideBySide');
    const viewInline = $('viewInline');
    const toastContainer = $('toastContainer');
    const suggestionPanel = $('suggestionPanel');
    const suggestionList = $('suggestionList');
    const suggestionCount = $('suggestionCount');
    const applyAllBtn = $('applyAllSuggestions');
    const toggleSugBtn = $('toggleSuggestions');

    // ─────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────
    let currentViewMode = 'inline';   // inline is default
    let lastPlainText = '';
    let isComparing = false;
    let syncingScroll = false;
    let suggestionData = [];         // [{ lLineNum, oldVal, newVal }]
    let suggestionsCollapsed = false;

    // ─────────────────────────────────────────────────────────
    //  TOAST SYSTEM
    // ─────────────────────────────────────────────────────────
    function showToast(message, type = 'info', duration = 2800) {
        const icons = { success: '✓', error: '✕', info: 'i' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `<span>${icons[type] || 'i'}</span><span>${DiffEngine.escape(message)}</span>`;
        toastContainer.appendChild(toast);
        const remove = () => {
            toast.classList.add('out');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        };
        setTimeout(remove, duration);
    }

    // ─────────────────────────────────────────────────────────
    //  FILE READING
    // ─────────────────────────────────────────────────────────
    function readFile(file, callback) {
        if (!file) return;
        const MAX_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_SIZE) { showToast(`File too large (max 50 MB): ${file.name}`, 'error'); return; }
        const reader = new FileReader();
        reader.onload = e => callback(e.target.result, file.name);
        reader.onerror = () => showToast(`Failed to read file: ${file.name}`, 'error');
        reader.readAsText(file, 'UTF-8');
    }

    function setEditorContent(editor, text, fileNameEl, fileName) {
        editor.value = text;
        if (fileNameEl) fileNameEl.textContent = fileName || 'Pasted text';
        const hint = editor.closest('.drop-zone')?.querySelector('.drop-zone-hint');
        if (hint) hint.style.opacity = '0';
        autoCompare();
    }

    // ─────────────────────────────────────────────────────────
    //  FILE UPLOAD
    // ─────────────────────────────────────────────────────────
    fileInputLeft.addEventListener('change', e => {
        readFile(e.target.files[0], (t, n) => setEditorContent(editorLeft, t, fileNameLeft, n));
        e.target.value = '';
    });
    fileInputRight.addEventListener('change', e => {
        readFile(e.target.files[0], (t, n) => setEditorContent(editorRight, t, fileNameRight, n));
        e.target.value = '';
    });

    // ─────────────────────────────────────────────────────────
    //  DRAG & DROP
    // ─────────────────────────────────────────────────────────
    function setupDropZone(dropZone, editor, fileNameEl) {
        ['dragenter', 'dragover'].forEach(evt => {
            dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
        });
        ['dragleave', 'dragend'].forEach(evt => {
            dropZone.addEventListener(evt, e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
        });
        dropZone.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.remove('drag-over');
            const files = e.dataTransfer?.files;
            if (files?.length > 0) readFile(files[0], (t, n) => setEditorContent(editor, t, fileNameEl, n));
        });
    }

    setupDropZone(dropZoneLeft, editorLeft, fileNameLeft);
    setupDropZone(dropZoneRight, editorRight, fileNameRight);
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());

    // ─────────────────────────────────────────────────────────
    //  COPY ALL PER PANE
    // ─────────────────────────────────────────────────────────
    async function copyPaneContent(editor, label) {
        const text = editor.value;
        if (!text.trim()) { showToast(`${label} pane is empty`, 'info', 1600); return; }
        try {
            await navigator.clipboard.writeText(text);
            showToast(`${label} pane copied!`, 'success', 1800);
        } catch {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast(`${label} pane copied!`, 'success', 1800);
        }
    }

    copyAllLeft.addEventListener('click', () => copyPaneContent(editorLeft, 'Left'));
    copyAllRight.addEventListener('click', () => copyPaneContent(editorRight, 'Right'));

    // ─────────────────────────────────────────────────────────
    //  AUTO-COMPARE
    // ─────────────────────────────────────────────────────────
    let autoCompareTimer = null;

    function autoCompare() {
        clearTimeout(autoCompareTimer);
        autoCompareTimer = setTimeout(() => {
            if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false);
        }, 400);
    }

    editorLeft.addEventListener('input', autoCompare);
    editorRight.addEventListener('input', autoCompare);
    ignoreWhitespaceChk.addEventListener('change', () => { if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false); });
    jsonModeChk.addEventListener('change', () => { if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false); });

    // ─────────────────────────────────────────────────────────
    //  COMPARE ENGINE
    // ─────────────────────────────────────────────────────────
    function runCompare(showLoadAnim = true) {
        if (isComparing) return;

        const leftText = editorLeft.value;
        const rightText = editorRight.value;

        if (!leftText.trim() && !rightText.trim()) { showToast('Both panes are empty — paste some code!', 'info'); return; }
        if (!leftText.trim()) { showToast('Left pane is empty', 'error'); return; }
        if (!rightText.trim()) { showToast('Right pane is empty', 'error'); return; }

        if (showLoadAnim) { isComparing = true; compareBtn.classList.add('loading'); }

        setTimeout(() => {
            try {
                const result = DiffEngine.run(leftText, rightText, {
                    ignoreWhitespace: ignoreWhitespaceChk.checked,
                    jsonMode: jsonModeChk.checked,
                    viewMode: currentViewMode
                });

                if (result.error) { showToast(result.error, 'error', 4000); return; }

                diffOutput.innerHTML = result.html;
                diffOutput.classList.add('visible');
                diffPlaceholder.style.display = 'none';

                lastPlainText = result.plainText;
                updateStats(result.stats);
                copyDiffBtn.disabled = false;
                downloadBtn.disabled = false;

                // Build suggestion panel from hunks
                buildSuggestions(result.hunks);

                // Check for global JSON formatting suggestions
                checkJsonSuggestions();

            } catch (err) {
                showToast(`Compare failed: ${err.message}`, 'error');
                console.error('[Codediff] Compare error:', err);
            } finally {
                if (showLoadAnim) {
                    compareBtn.classList.add('fade-out');
                    setTimeout(() => {
                        compareBtn.classList.remove('loading', 'fade-out');
                        isComparing = false;
                    }, 260);
                }
            }
        }, showLoadAnim ? 10 : 0);
    }

    compareBtn.addEventListener('click', () => runCompare(true));

    // ─────────────────────────────────────────────────────────
    //  SUGGESTION SYSTEM: JSON MALFORMATION / FORMATTING
    // ─────────────────────────────────────────────────────────
    function checkJsonSuggestions() {
        // If JSON Mode is already ON, we don't need to suggest formatting (it's auto-applied)
        if (jsonModeChk.checked) return;

        const suggestFormat = (side, editor, label) => {
            const text = editor.value.trim();
            if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;

            try {
                const parsed = JSON.parse(text);
                const pretty = JSON.stringify(parsed, null, 2);
                // If they differ significantly in length (minified) or if indentation is missing
                if (text !== pretty && (text.length !== pretty.length || !text.includes('\n'))) {
                    return { side, label, pretty };
                }
            } catch (e) {
                // Looks like JSON but is malformed
                let msg = e.message;
                // Attempt to extract position for better feedback
                const posMatch = msg.match(/position (\d+)/);
                return { side, label, error: msg, pos: posMatch ? parseInt(posMatch[1], 10) : null };
            }
            return null;
        };

        const sugL = suggestFormat('Left', editorLeft, 'Left');
        const sugR = suggestFormat('Right', editorRight, 'Right');

        if (sugL || sugR) {
            // Don't hide the panel if line-diff suggestions are already there
            suggestionPanel.hidden = false;

            [sugL, sugR].forEach(s => {
                if (!s) return;
                const item = document.createElement('div');
                item.className = 'suggestion-item json-suggestion';

                if (s.error) {
                    item.classList.add('error');
                    item.innerHTML = `
            <span class="suggestion-line-num">JSON</span>
            <div class="suggestion-content">
              <span class="suggestion-title">${s.label} pane has malformed JSON</span>
              <span class="suggestion-error-msg">${DiffEngine.escape(s.error)}</span>
            </div>
            <div class="suggestion-actions">
              ${s.pos !== null ? `<button class="suggestion-jump-btn" data-side="${s.side}" data-pos="${s.pos}">Show Error</button>` : ''}
            </div>`;

                    const jumpBtn = item.querySelector('.suggestion-jump-btn');
                    if (jumpBtn) {
                        jumpBtn.onclick = () => {
                            const edt = s.side === 'Left' ? editorLeft : editorRight;
                            edt.focus();
                            edt.setSelectionRange(s.pos, s.pos + 1);
                            const line = edt.value.substring(0, s.pos).split('\n').length;
                            edt.scrollTop = (line - 3) * 20;
                        };
                    }
                } else {
                    item.innerHTML = `
            <span class="suggestion-line-num">JSON</span>
            <div class="suggestion-content">
              <span class="suggestion-title">JSON in ${s.label} pane is minified or messy</span>
              <span class="suggestion-sub">Indentation can be fixed for better comparison</span>
            </div>
            <div class="suggestion-actions">
              <button class="suggestion-apply-btn json-fix-btn" data-side="${s.side}">Format JSON</button>
            </div>`;

                    item.querySelector('.json-fix-btn').onclick = () => {
                        const editor = (s.side === 'Left') ? editorLeft : editorRight;
                        editor.value = s.pretty;
                        showToast(`Formatted ${s.label} JSON`, 'success');
                        autoCompare();
                    };
                }
                suggestionList.prepend(item);
            });
        }
    }

    // ─────────────────────────────────────────────────────────
    //  SUGGESTION PANEL: LINE DIFFS
    // ─────────────────────────────────────────────────────────
    function buildSuggestions(hunks) {
        suggestionData = [];
        suggestionList.innerHTML = ''; // Start fresh on each compare
        let lLine = 1, rLine = 1;

        for (const h of hunks) {
            if (h.type === 'changed') {
                suggestionData.push({ lLineNum: lLine, oldVal: h.lLines[0], newVal: h.rLines[0] });
                lLine++; rLine++;
            } else if (h.type === 'equal') { lLine++; rLine++; }
            else if (h.type === 'removed') { lLine++; }
            else if (h.type === 'added') { rLine++; }
        }

        if (suggestionData.length === 0) {
            suggestionPanel.hidden = true;
            return;
        }

        suggestionCount.textContent = suggestionData.length;
        suggestionList.innerHTML = '';

        suggestionData.forEach((s, idx) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.setAttribute('role', 'listitem');

            const truncate = (str, max = 60) => str.length > max ? str.slice(0, max) + '…' : str;

            item.innerHTML = `
        <span class="suggestion-line-num">L${s.lLineNum}</span>
        <span class="suggestion-old" title="${DiffEngine.escape(s.oldVal)}">${DiffEngine.escape(truncate(s.oldVal)) || '<em>empty</em>'}</span>
        <span class="suggestion-arrow">→</span>
        <span class="suggestion-new" title="${DiffEngine.escape(s.newVal)}">${DiffEngine.escape(truncate(s.newVal)) || '<em>empty</em>'}</span>
        <div class="suggestion-actions">
          <button class="suggestion-apply-btn" data-idx="${idx}" title="Replace line ${s.lLineNum} in left pane with the right-pane value">Apply</button>
          <button class="suggestion-copy-btn"  data-idx="${idx}" title="Copy the new value to clipboard">Copy</button>
        </div>`;
            suggestionList.appendChild(item);
        });

        // Wire per-item buttons using event delegation on the list
        suggestionList.addEventListener('click', e => {
            const applyBtn = e.target.closest('.suggestion-apply-btn');
            const copyBtn = e.target.closest('.suggestion-copy-btn');

            if (applyBtn) {
                const s = suggestionData[+applyBtn.dataset.idx];
                if (!s) return;
                applyLineChange(s.lLineNum, s.newVal);
                applyBtn.textContent = '✓';
                applyBtn.style.background = 'var(--diff-added-text)';
                setTimeout(() => { applyBtn.textContent = 'Apply'; applyBtn.style.background = ''; }, 1600);
            }

            if (copyBtn) {
                const s = suggestionData[+copyBtn.dataset.idx];
                if (!s) return;
                navigator.clipboard.writeText(s.newVal).catch(() => { });
                copyBtn.textContent = '✓';
                setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
            }
        }, { once: false });

        // Restore collapse state
        suggestionsCollapsed = false;
        suggestionList.style.display = '';
        toggleSugBtn.textContent = '▼';
        suggestionPanel.hidden = false;
    }

    function applyLineChange(lineNum, newVal) {
        const lines = editorLeft.value.split(/\r?\n/);
        if (lineNum >= 1 && lineNum <= lines.length) {
            lines[lineNum - 1] = newVal;
            editorLeft.value = lines.join('\n');
            autoCompare();
        }
    }

    applyAllBtn?.addEventListener('click', () => {
        if (suggestionData.length === 0) return;
        const lines = editorLeft.value.split(/\r?\n/);
        // Apply from bottom to top so line numbers stay correct
        [...suggestionData].sort((a, b) => b.lLineNum - a.lLineNum).forEach(s => {
            if (s.lLineNum >= 1 && s.lLineNum <= lines.length) lines[s.lLineNum - 1] = s.newVal;
        });
        editorLeft.value = lines.join('\n');
        showToast(`Applied ${suggestionData.length} suggestion${suggestionData.length !== 1 ? 's' : ''}`, 'success');
        autoCompare();
    });

    toggleSugBtn?.addEventListener('click', () => {
        suggestionsCollapsed = !suggestionsCollapsed;
        suggestionList.style.display = suggestionsCollapsed ? 'none' : '';
        toggleSugBtn.textContent = suggestionsCollapsed ? '▲' : '▼';
    });

    // ─────────────────────────────────────────────────────────
    //  CLEAR ACTIONS
    // ─────────────────────────────────────────────────────────
    clearLeft.addEventListener('click', () => {
        editorLeft.value = '';
        fileNameLeft.textContent = 'No file loaded';
        clearDiffOutput();
    });
    clearRight.addEventListener('click', () => {
        editorRight.value = '';
        fileNameRight.textContent = 'No file loaded';
        clearDiffOutput();
    });
    clearAllBtn.addEventListener('click', () => {
        editorLeft.value = editorRight.value = '';
        fileNameLeft.textContent = fileNameRight.textContent = 'No file loaded';
        clearDiffOutput();
        showToast('Cleared', 'info', 1500);
    });

    function clearDiffOutput() {
        diffOutput.innerHTML = '';
        diffOutput.classList.remove('visible');
        diffPlaceholder.style.display = '';
        lastPlainText = '';
        copyDiffBtn.disabled = true;
        downloadBtn.disabled = true;
        suggestionPanel.hidden = true;
        suggestionData = [];
        resetStats();
    }

    // ─────────────────────────────────────────────────────────
    //  SWAP PANES
    // ─────────────────────────────────────────────────────────
    swapBtn.addEventListener('click', () => {
        const tmp = editorLeft.value;
        editorLeft.value = editorRight.value;
        editorRight.value = tmp;
        const tmpName = fileNameLeft.textContent;
        fileNameLeft.textContent = fileNameRight.textContent;
        fileNameRight.textContent = tmpName;
        if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false);
        else clearDiffOutput();
        showToast('Panes swapped', 'info', 1400);
    });

    // ─────────────────────────────────────────────────────────
    //  VIEW MODE TOGGLE
    // ─────────────────────────────────────────────────────────
    viewSideBySide.addEventListener('click', () => setViewMode('sidebyside'));
    viewInline.addEventListener('click', () => setViewMode('inline'));

    function setViewMode(mode) {
        currentViewMode = mode;
        viewSideBySide.classList.toggle('active', mode === 'sidebyside');
        viewInline.classList.toggle('active', mode === 'inline');
        if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false);
    }

    // ─────────────────────────────────────────────────────────
    //  FOCUS DIFF (MAXIMIZE)
    // ─────────────────────────────────────────────────────────
    focusDiffBtn.addEventListener('click', () => {
        const isFocused = workspace.classList.toggle('focus-diff');
        focusDiffBtn.classList.toggle('active', isFocused);
        focusDiffBtn.innerHTML = isFocused
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/></svg> Exit Focus`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg> Focus Diff`;

        showToast(isFocused ? 'Focused on diff' : 'Restored editors', 'info', 1200);
    });

    // ─────────────────────────────────────────────────────────
    //  COPY DIFF
    // ─────────────────────────────────────────────────────────
    copyDiffBtn.addEventListener('click', async () => {
        if (!lastPlainText) return;
        try {
            await navigator.clipboard.writeText(lastPlainText);
            showToast('Diff copied to clipboard', 'success');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = lastPlainText;
            ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast('Diff copied to clipboard', 'success');
        }
    });

    // ─────────────────────────────────────────────────────────
    //  DOWNLOAD DIFF
    // ─────────────────────────────────────────────────────────
    downloadBtn.addEventListener('click', () => {
        if (!lastPlainText) return;
        const blob = new Blob([lastPlainText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `codediff-${Date.now()}.diff`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Diff downloaded', 'success');
    });

    // ─────────────────────────────────────────────────────────
    //  HORIZONTAL PANE RESIZER
    // ─────────────────────────────────────────────────────────
    (function initHorzResizer() {
        let dragging = false;
        let startX = 0;
        let startLeftWidth = 0;

        resizer.addEventListener('mousedown', e => {
            dragging = true;
            startX = e.clientX;
            startLeftWidth = paneLeft.getBoundingClientRect().width;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const delta = e.clientX - startX;
            const totalWidth = editorsRow.getBoundingClientRect().width - resizer.offsetWidth;
            const newLeftPct = Math.min(85, Math.max(15, ((startLeftWidth + delta) / totalWidth) * 100));
            paneLeft.style.flex = `0 0 ${newLeftPct}%`;
            paneRight.style.flex = `0 0 ${100 - newLeftPct}%`;
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });

        resizer.addEventListener('keydown', e => {
            const totalWidth = editorsRow.getBoundingClientRect().width - resizer.offsetWidth;
            const currentLeftPct = (paneLeft.getBoundingClientRect().width / totalWidth) * 100;
            let newPct = currentLeftPct;
            if (e.key === 'ArrowLeft') newPct = Math.max(15, currentLeftPct - 2);
            if (e.key === 'ArrowRight') newPct = Math.min(85, currentLeftPct + 2);
            if (newPct !== currentLeftPct) {
                paneLeft.style.flex = `0 0 ${newPct}%`;
                paneRight.style.flex = `0 0 ${100 - newPct}%`;
                e.preventDefault();
            }
        });
    })();

    // ─────────────────────────────────────────────────────────
    //  VERTICAL DIFF SECTION RESIZER
    // ─────────────────────────────────────────────────────────
    (function initVertResizer() {
        let dragging = false;
        let startY = 0;
        let startDiffH = 0;

        diffVResizer.addEventListener('mousedown', e => {
            dragging = true;
            startY = e.clientY;
            startDiffH = diffOutputSection.getBoundingClientRect().height;
            diffVResizer.classList.add('dragging');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const delta = startY - e.clientY;         // drag up = bigger diff
            const wsH = workspace.getBoundingClientRect().height;
            const actionH = document.getElementById('actionBar').offsetHeight;
            const footerH = document.querySelector('.app-footer')?.offsetHeight || 0;
            const maxDiff = wsH - actionH - footerH - 80;  // leave at least 80px for editors
            const newH = Math.min(maxDiff, Math.max(100, startDiffH + delta));
            diffOutputSection.style.flex = `0 0 ${newH}px`;
            editorsRow.style.flex = '1 1 0';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            diffVResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    })();

    // ─────────────────────────────────────────────────────────
    //  SCROLL SYNC
    // ─────────────────────────────────────────────────────────
    editorLeft.addEventListener('scroll', () => {
        if (syncingScroll) return;
        syncingScroll = true;
        editorRight.scrollTop = editorLeft.scrollTop;
        editorRight.scrollLeft = editorLeft.scrollLeft;
        syncingScroll = false;
    });
    editorRight.addEventListener('scroll', () => {
        if (syncingScroll) return;
        syncingScroll = true;
        editorLeft.scrollTop = editorRight.scrollTop;
        editorLeft.scrollLeft = editorRight.scrollLeft;
        syncingScroll = false;
    });

    // ─────────────────────────────────────────────────────────
    //  FULLSCREEN
    // ─────────────────────────────────────────────────────────
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => document.body.classList.toggle('fullscreen-editor'));
        } else {
            document.exitFullscreen().catch(() => { });
        }
    });

    // ─────────────────────────────────────────────────────────
    //  PER-PANE SEARCH
    // ─────────────────────────────────────────────────────────
    class PaneSearch {
        constructor(side, editor) {
            this.side = side;
            this.editor = editor;
            this.matches = [];
            this.current = -1;

            this.bar = $(`searchBar${side}`);
            this.input = $(`searchInput${side}`);
            this.countEl = $(`searchCount${side}`);
            this.caseChk = $(`searchCase${side}`);
            this.wordChk = $(`searchWord${side}`);
            this.regexChk = $(`searchRegex${side}`);
            this.prevBtn = $(`searchPrev${side}`);
            this.nextBtn = $(`searchNext${side}`);
            this.closeBtn = $(`searchClose${side}`);
            this.toggleBtn = $(`searchToggle${side}`);

            this._bind();
        }

        _bind() {
            this.toggleBtn.addEventListener('click', () => this.open());
            this.closeBtn.addEventListener('click', () => this.close());
            this.input.addEventListener('input', () => this._search());
            this.caseChk.addEventListener('change', () => this._search());
            this.wordChk.addEventListener('change', () => this._search());
            this.regexChk.addEventListener('change', () => this._search());
            this.prevBtn.addEventListener('click', () => this._navigate(-1));
            this.nextBtn.addEventListener('click', () => this._navigate(1));
            this.input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this._navigate(e.shiftKey ? -1 : 1, true); }
                if (e.key === 'Escape') this.close();
            });
        }

        open() {
            this.bar.hidden = false;
            this.input.focus();
            this.input.select();
            this._search();
        }

        close() {
            this.bar.hidden = true;
            this.matches = [];
            this.current = -1;
            this._updateCount();
            this.editor.focus();
        }

        isOpen() { return !this.bar.hidden; }

        _buildRegex() {
            const term = this.input.value;
            if (!term) return null;
            const flags = this.caseChk.checked ? 'g' : 'gi';
            if (this.regexChk.checked) return new RegExp(term, flags);
            let esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (this.wordChk.checked) esc = `\\b${esc}\\b`;
            return new RegExp(esc, flags);
        }

        _search(autoJump = false) {
            this.matches = [];
            this.current = -1;
            this.countEl.classList.remove('no-match');

            const regex = this._buildRegex();
            if (!regex) { this._updateCount(); return; }

            try {
                const text = this.editor.value;
                let m;
                while ((m = regex.exec(text)) !== null) {
                    this.matches.push({ start: m.index, end: m.index + m[0].length });
                    if (this.matches.length > 5000) break;
                    // Prevent infinite loop on zero-width matches
                    if (m.index === regex.lastIndex) regex.lastIndex++;
                }
            } catch {
                this.countEl.textContent = 'Invalid regex';
                this.countEl.classList.add('no-match');
                return;
            }

            if (this.matches.length > 0) {
                this.current = 0;
                if (autoJump) this._jumpTo(0, true);
            } else if (this.input.value) {
                this.countEl.classList.add('no-match');
            }

            this._updateCount();
        }

        _navigate(dir, focusInput = false) {
            if (this.matches.length === 0) return;
            this.current = (this.current + dir + this.matches.length) % this.matches.length;
            this._jumpTo(this.current, !focusInput);
            if (focusInput) this.input.focus();
            this._updateCount();
        }

        _jumpTo(idx, focusEditor = false) {
            const match = this.matches[idx];
            if (!match) return;

            if (focusEditor) this.editor.focus();

            this.editor.setSelectionRange(match.start, match.end);

            // Scroll the match into view
            const textToMatch = this.editor.value.substring(0, match.start);
            const lineNum = textToMatch.split(/\r?\n/).length;
            const lineHeight = parseFloat(getComputedStyle(this.editor).lineHeight) || 19;

            // Use a smoother scroll if possible, or just set scrollTop
            const targetScroll = Math.max(0, (lineNum - 3) * lineHeight);
            this.editor.scrollTop = targetScroll;
        }

        _updateCount() {
            if (!this.input.value) {
                this.countEl.textContent = '';
            } else if (this.matches.length === 0) {
                this.countEl.textContent = 'No results';
            } else {
                this.countEl.textContent = `${this.current + 1} / ${this.matches.length}`;
            }
            this.prevBtn.disabled = this.matches.length === 0;
            this.nextBtn.disabled = this.matches.length === 0;
        }

        /** Called when editor content changes so match indices stay fresh */
        refresh() { if (this.isOpen()) this._search(false); }
    }

    // Instantiate both search helpers
    const searchLeft = new PaneSearch('Left', editorLeft);
    const searchRight = new PaneSearch('Right', editorRight);

    // Refresh search on editor input
    editorLeft.addEventListener('input', () => searchLeft.refresh());
    editorRight.addEventListener('input', () => searchRight.refresh());

    // Ctrl+F: open search for whichever pane was last focused
    let lastFocusedEditor = editorLeft;
    editorLeft.addEventListener('focus', () => { lastFocusedEditor = editorLeft; });
    editorRight.addEventListener('focus', () => { lastFocusedEditor = editorRight; });

    // ─────────────────────────────────────────────────────────
    //  KEYBOARD SHORTCUTS MODAL
    // ─────────────────────────────────────────────────────────
    function openShortcuts() { shortcutsModal.style.display = 'flex'; closeShortcuts.focus(); }
    function closeShortcutsModal() { shortcutsModal.style.display = 'none'; }

    closeShortcuts.addEventListener('click', closeShortcutsModal);
    shortcutsModal.addEventListener('click', e => { if (e.target === shortcutsModal) closeShortcutsModal(); });

    // ─────────────────────────────────────────────────────────
    //  GLOBAL KEYBOARD SHORTCUTS
    // ─────────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        const inInput = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT';

        // Ctrl+Enter → Compare
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runCompare(true); return; }

        // Ctrl+F → open search for focused pane
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            if (lastFocusedEditor === editorRight) searchRight.open();
            else searchLeft.open();
            return;
        }

        // Ctrl+L → Clear All
        if (e.ctrlKey && e.key === 'l') { e.preventDefault(); clearAllBtn.click(); return; }

        // Ctrl+Shift+T → Toggle theme
        if (e.ctrlKey && e.shiftKey && e.key === 'T') { e.preventDefault(); window.ThemeModule?.toggle(); return; }

        // Ctrl+Shift+S → Swap
        if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); swapBtn.click(); return; }

        // Ctrl+D → Download diff
        if (e.ctrlKey && e.key === 'd' && !inInput) { e.preventDefault(); if (!downloadBtn.disabled) downloadBtn.click(); return; }

        // ? → Shortcuts modal
        if (e.key === '?' && !inInput) { openShortcuts(); return; }

        // Esc → close modal or search bars
        if (e.key === 'Escape') {
            closeShortcutsModal();
            if (searchLeft.isOpen()) searchLeft.close();
            if (searchRight.isOpen()) searchRight.close();
        }
    });

    // ─────────────────────────────────────────────────────────
    //  TAB KEY IN EDITORS
    // ─────────────────────────────────────────────────────────
    function handleTabKey(e) {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const ta = e.target;
        const TAB = '  ';
        const start = ta.selectionStart;
        const end = ta.selectionEnd;

        if (start === end) {
            ta.value = ta.value.slice(0, start) + TAB + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + TAB.length;
        } else {
            const lines = ta.value.split('\n');
            let charCount = 0;
            let startLine = -1, endLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (startLine === -1 && charCount + lines[i].length >= start) startLine = i;
                if (charCount <= end) endLine = i;
                charCount += lines[i].length + 1;
            }
            if (e.shiftKey) {
                for (let i = startLine; i <= endLine; i++) {
                    if (lines[i].startsWith(TAB)) lines[i] = lines[i].slice(TAB.length);
                    else if (lines[i].startsWith(' ')) lines[i] = lines[i].slice(1);
                }
            } else {
                for (let i = startLine; i <= endLine; i++) lines[i] = TAB + lines[i];
            }
            ta.value = lines.join('\n');
        }
        autoCompare();
    }

    editorLeft.addEventListener('keydown', handleTabKey);
    editorRight.addEventListener('keydown', handleTabKey);

    // ─────────────────────────────────────────────────────────
    //  PASTE HINT
    // ─────────────────────────────────────────────────────────
    function onPaste(e) {
        setTimeout(() => {
            const hint = e.target.closest('.drop-zone')?.querySelector('.drop-zone-hint');
            if (hint && e.target.value.length > 0) hint.style.opacity = '0';
        }, 0);
    }
    editorLeft.addEventListener('paste', onPaste);
    editorRight.addEventListener('paste', onPaste);

    // ─────────────────────────────────────────────────────────
    //  SAMPLE CODE (first visit only)
    // ─────────────────────────────────────────────────────────
    const SAMPLE_LEFT = `function greet(name) {
  const message = "Hello, " + name;
  console.log(message);
  return message;
}

function add(a, b) {
  return a + b;
}

const PI = 3.14159;
const TAX_RATE = 0.1;

function calculateArea(radius) {
  return PI * radius * radius;
}`;

    const SAMPLE_RIGHT = `function greet(name, greeting = "Hello") {
  const message = \`\${greeting}, \${name}!\`;
  console.info(message);
  return message;
}

function add(a, b, c = 0) {
  return a + b + c;
}

const PI = Math.PI;
const TAX_RATE = 0.15;

function calculateArea(radius) {
  const area = PI * radius ** 2;
  return Math.round(area * 100) / 100;
}

function calculateCircumference(radius) {
  return 2 * PI * radius;
}`;

    function loadSample() {
        if (localStorage.getItem('codediff-visited')) return;
        editorLeft.value = SAMPLE_LEFT;
        editorRight.value = SAMPLE_RIGHT;
        fileNameLeft.textContent = 'sample-original.js';
        fileNameRight.textContent = 'sample-modified.js';
        localStorage.setItem('codediff-visited', '1');
        runCompare(false);
    }

    function init() {
        // Sync View Mode UI classes
        viewSideBySide.classList.toggle('active', currentViewMode === 'sidebyside');
        viewInline.classList.toggle('active', currentViewMode === 'inline');

        setTimeout(loadSample, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
