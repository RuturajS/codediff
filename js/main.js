/**
 * Codediff — Main Application Controller
 *
 * Wires all UI interactions:
 *  - Compare button & keyboard shortcuts
 *  - File upload (input & drag-and-drop)
 *  - Pane swapping
 *  - Resizable split pane
 *  - Scroll synchronization
 *  - Stats bar updates
 *  - Copy diff & download diff
 *  - Toast notifications
 *  - Keyboard shortcuts modal
 *  - Fullscreen toggle
 *  - View mode switching (side-by-side / inline)
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
    const diffOutput = $('diffOutput');
    const diffPlaceholder = $('diffPlaceholder');
    const paneLeft = $('paneLeft');
    const paneRight = $('paneRight');
    const resizer = $('resizer');
    const editorsRow = $('editorsRow');
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

    // ─────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────
    let currentViewMode = 'sidebyside';
    let lastPlainText = '';
    let isComparing = false;
    let syncingScroll = false;

    // ─────────────────────────────────────────────────────────
    //  TOAST SYSTEM
    // ─────────────────────────────────────────────────────────
    function showToast(message, type = 'info', duration = 2800) {
        const icons = {
            success: '✓',
            error: '✕',
            info: 'i'
        };
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

        const MAX_SIZE = 50 * 1024 * 1024; // 50 MB limit
        if (file.size > MAX_SIZE) {
            showToast(`File too large (max 50 MB): ${file.name}`, 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = e => callback(e.target.result, file.name);
        reader.onerror = () => showToast(`Failed to read file: ${file.name}`, 'error');
        reader.readAsText(file, 'UTF-8');
    }

    function setEditorContent(editor, text, fileNameEl, fileName) {
        editor.value = text;
        if (fileNameEl) fileNameEl.textContent = fileName || 'Pasted text';
        // Show/hide hint
        const hint = editor.closest('.drop-zone')?.querySelector('.drop-zone-hint');
        if (hint) hint.style.opacity = '0';
        autoCompare();
    }

    // ─────────────────────────────────────────────────────────
    //  FILE UPLOAD (via input[type=file])
    // ─────────────────────────────────────────────────────────
    fileInputLeft.addEventListener('change', e => {
        readFile(e.target.files[0], (text, name) => setEditorContent(editorLeft, text, fileNameLeft, name));
        e.target.value = ''; // reset so same file can be re-uploaded
    });

    fileInputRight.addEventListener('change', e => {
        readFile(e.target.files[0], (text, name) => setEditorContent(editorRight, text, fileNameRight, name));
        e.target.value = '';
    });

    // ─────────────────────────────────────────────────────────
    //  DRAG & DROP
    // ─────────────────────────────────────────────────────────
    function setupDropZone(dropZone, editor, fileNameEl) {
        ['dragenter', 'dragover'].forEach(evt => {
            dropZone.addEventListener(evt, e => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'dragend'].forEach(evt => {
            dropZone.addEventListener(evt, e => {
                // Only remove if leaving the zone itself (not a child)
                if (!dropZone.contains(e.relatedTarget)) {
                    dropZone.classList.remove('drag-over');
                }
            });
        });

        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                readFile(files[0], (text, name) => setEditorContent(editor, text, fileNameEl, name));
            }
        });
    }

    setupDropZone(dropZoneLeft, editorLeft, fileNameLeft);
    setupDropZone(dropZoneRight, editorRight, fileNameRight);

    // Prevent browser from opening dropped files on the whole page
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());

    // ─────────────────────────────────────────────────────────
    //  AUTO-COMPARE on editor input
    // ─────────────────────────────────────────────────────────
    let autoCompareTimer = null;

    function autoCompare() {
        clearTimeout(autoCompareTimer);
        autoCompareTimer = setTimeout(() => {
            if (editorLeft.value.trim() && editorRight.value.trim()) {
                runCompare(false);
            }
        }, 400);
    }

    editorLeft.addEventListener('input', autoCompare);
    editorRight.addEventListener('input', autoCompare);

    ignoreWhitespaceChk.addEventListener('change', () => {
        if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false);
    });

    jsonModeChk.addEventListener('change', () => {
        if (editorLeft.value.trim() && editorRight.value.trim()) runCompare(false);
    });

    // ─────────────────────────────────────────────────────────
    //  COMPARE ENGINE
    // ─────────────────────────────────────────────────────────
    function runCompare(showLoadAnim = true) {
        if (isComparing) return;

        const leftText = editorLeft.value;
        const rightText = editorRight.value;

        if (!leftText.trim() && !rightText.trim()) {
            showToast('Both panes are empty — paste some code!', 'info');
            return;
        }

        if (!leftText.trim()) { showToast('Left pane is empty', 'error'); return; }
        if (!rightText.trim()) { showToast('Right pane is empty', 'error'); return; }

        if (showLoadAnim) {
            isComparing = true;
            compareBtn.classList.add('loading');
        }

        // Use setTimeout to not block UI on large files
        setTimeout(() => {
            try {
                const result = DiffEngine.run(leftText, rightText, {
                    ignoreWhitespace: ignoreWhitespaceChk.checked,
                    jsonMode: jsonModeChk.checked,
                    viewMode: currentViewMode
                });

                if (result.error) {
                    showToast(result.error, 'error', 4000);
                    return;
                }

                // Render
                diffOutput.innerHTML = result.html;
                diffOutput.classList.add('visible');
                diffPlaceholder.style.display = 'none';

                // Stats
                lastPlainText = result.plainText;
                updateStats(result.stats);

                // Enable export buttons
                copyDiffBtn.disabled = false;
                downloadBtn.disabled = false;

            } catch (err) {
                showToast(`Compare failed: ${err.message}`, 'error');
                console.error('[Codediff] Compare error:', err);
            } finally {
                if (showLoadAnim) {
                    compareBtn.classList.remove('loading');
                    isComparing = false;
                }
            }
        }, showLoadAnim ? 10 : 0);
    }

    compareBtn.addEventListener('click', () => runCompare(true));

    // ─────────────────────────────────────────────────────────
    //  STATS
    // ─────────────────────────────────────────────────────────
    function updateStats({ added, removed, changed }) {
        statAddedCount.textContent = added;
        statRemovedCount.textContent = removed;
        statChangedCount.textContent = changed;
    }

    function resetStats() {
        statAddedCount.textContent = '0';
        statRemovedCount.textContent = '0';
        statChangedCount.textContent = '0';
    }

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
        editorLeft.value = '';
        editorRight.value = '';
        fileNameLeft.textContent = 'No file loaded';
        fileNameRight.textContent = 'No file loaded';
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

        if (editorLeft.value.trim() && editorRight.value.trim()) {
            runCompare(false);
        } else {
            clearDiffOutput();
        }
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

        if (editorLeft.value.trim() && editorRight.value.trim()) {
            runCompare(false);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  COPY DIFF
    // ─────────────────────────────────────────────────────────
    copyDiffBtn.addEventListener('click', async () => {
        if (!lastPlainText) return;
        try {
            await navigator.clipboard.writeText(lastPlainText);
            showToast('Diff copied to clipboard', 'success');
        } catch {
            // Fallback
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
    //  RESIZABLE SPLIT PANE
    // ─────────────────────────────────────────────────────────
    (function initResizer() {
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

        // Keyboard accessibility: arrow keys
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
            document.documentElement.requestFullscreen().catch(() => {
                document.body.classList.toggle('fullscreen-editor');
            });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    });

    document.addEventListener('fullscreenchange', () => {
        const inFs = !!document.fullscreenElement;
        fullscreenBtn.setAttribute('title', inFs ? 'Exit fullscreen' : 'Toggle fullscreen (F11)');
    });

    // ─────────────────────────────────────────────────────────
    //  KEYBOARD SHORTCUTS MODAL
    // ─────────────────────────────────────────────────────────
    function openShortcuts() {
        shortcutsModal.style.display = 'flex';
        closeShortcuts.focus();
    }

    function closeShortcutsModal() {
        shortcutsModal.style.display = 'none';
    }

    closeShortcuts.addEventListener('click', closeShortcutsModal);

    shortcutsModal.addEventListener('click', e => {
        if (e.target === shortcutsModal) closeShortcutsModal();
    });

    // ─────────────────────────────────────────────────────────
    //  GLOBAL KEYBOARD SHORTCUTS
    // ─────────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        const target = e.target;
        const inInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';

        // Ctrl+Enter → Compare
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            runCompare(true);
            return;
        }

        // Ctrl+L → Clear All
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            clearAllBtn.click();
            return;
        }

        // Ctrl+Shift+T → Toggle theme
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            window.ThemeModule?.toggle();
            return;
        }

        // Ctrl+Shift+S → Swap
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            swapBtn.click();
            return;
        }

        // Ctrl+D → Download diff
        if (e.ctrlKey && e.key === 'd' && !inInput) {
            e.preventDefault();
            if (!downloadBtn.disabled) downloadBtn.click();
            return;
        }

        // ? → Show shortcuts (not in input)
        if (e.key === '?' && !inInput) {
            openShortcuts();
            return;
        }

        // Esc → Close modal
        if (e.key === 'Escape') {
            closeShortcutsModal();
        }
    });

    // ─────────────────────────────────────────────────────────
    //  TEXTAREA TAB KEY SUPPORT
    // ─────────────────────────────────────────────────────────
    function handleTabKey(e) {
        if (e.key !== 'Tab') return;
        e.preventDefault();

        const ta = e.target;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const TAB = '  '; // 2-space tab

        if (start === end) {
            // Single cursor: insert tab
            ta.value = ta.value.slice(0, start) + TAB + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + TAB.length;
        } else {
            // Selection: indent/unindent all selected lines
            const lines = ta.value.split('\n');
            let charCount = 0;
            let startLine = -1, endLine = -1;

            for (let i = 0; i < lines.length; i++) {
                const lineEnd = charCount + lines[i].length;
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

        // Trigger auto-compare
        autoCompare();
    }

    editorLeft.addEventListener('keydown', handleTabKey);
    editorRight.addEventListener('keydown', handleTabKey);

    // ─────────────────────────────────────────────────────────
    //  PASTE DETECTION (show hint removal)
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
    //  SAMPLE CODE DEMO (loaded on first visit)
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
        const hasVisited = localStorage.getItem('codediff-visited');
        if (!hasVisited) {
            editorLeft.value = SAMPLE_LEFT;
            editorRight.value = SAMPLE_RIGHT;
            fileNameLeft.textContent = 'sample-original.js';
            fileNameRight.textContent = 'sample-modified.js';
            localStorage.setItem('codediff-visited', '1');
            runCompare(false);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Load sample on first visit so users immediately see diff output
        setTimeout(loadSample, 100);
    });

    // If DOM already loaded (script is deferred)
    if (document.readyState !== 'loading') {
        setTimeout(loadSample, 100);
    }

})();
