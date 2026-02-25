/**
 * Codediff — Diff Engine
 *
 * A pure-JS diff engine implementing Myers' diff algorithm.
 * No external libraries required. Handles:
 *  - Line-level diff (side-by-side & inline)
 *  - Word-level diff for changed lines
 *  - JSON normalization
 *  - Whitespace ignoring
 *  - HTML-escaped output (XSS-safe)
 */

(function DiffEngineModule() {
    'use strict';

    // ───────────────────────────────────────────────────────────
    //  CONSTANTS
    // ───────────────────────────────────────────────────────────
    const CONTEXT_LINES = 4;  // unchanged lines shown around each chunk

    // ───────────────────────────────────────────────────────────
    //  UTILITY: HTML escaping
    // ───────────────────────────────────────────────────────────
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function escape(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, c => ESC[c]);
    }

    // ───────────────────────────────────────────────────────────
    //  UTILITY: Split into lines, preserving empty lines
    // ───────────────────────────────────────────────────────────
    function splitLines(text) {
        return text.split(/\r?\n/);
    }

    // ───────────────────────────────────────────────────────────
    //  UTILITY: Normalize text for comparison
    // ───────────────────────────────────────────────────────────
    function normalizeForCompare(line, ignoreWhitespace) {
        if (ignoreWhitespace) return line.replace(/\s+/g, ' ').trim();
        return line;
    }

    // ───────────────────────────────────────────────────────────
    //  UTILITY: Safe JSON parse + normalize
    // ───────────────────────────────────────────────────────────
    function normalizeJSON(text) {
        const parsed = JSON.parse(text); // let caller catch errors
        return JSON.stringify(parsed, null, 2);
    }

    // ───────────────────────────────────────────────────────────
    //  MYERS DIFF — Line-level
    //  Returns array of ops: { type: 'equal'|'insert'|'delete', lLines, rLines }
    // ───────────────────────────────────────────────────────────
    function myersDiff(left, right, ignoreWhitespace) {
        const a = left.map(l => normalizeForCompare(l, ignoreWhitespace));
        const b = right.map(l => normalizeForCompare(l, ignoreWhitespace));

        const n = a.length;
        const m = b.length;

        // DP with trace for backtracking
        const max = n + m;
        if (max === 0) return [];

        const V = new Int32Array(2 * max + 1);
        const trace = [];

        outer: for (let d = 0; d <= max; d++) {
            const vSnapshot = V.slice();
            trace.push(vSnapshot);

            for (let k = -d; k <= d; k += 2) {
                const idx = k + max;
                let x;
                if (k === -d || (k !== d && V[idx - 1] < V[idx + 1])) {
                    x = V[idx + 1]; // move down
                } else {
                    x = V[idx - 1] + 1; // move right
                }
                let y = x - k;
                while (x < n && y < m && a[x] === b[y]) { x++; y++; }
                V[idx] = x;
                if (x >= n && y >= m) break outer;
            }
        }

        // Backtrack to reconstruct edits
        let x = n, y = m;
        const edits = [];

        for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
            const vPrev = trace[d];
            const k = x - y;
            const idx = k + max;
            let prevK;
            if (k === -d || (k !== d && vPrev[idx - 1] < vPrev[idx + 1])) {
                prevK = k + 1;
            } else {
                prevK = k - 1;
            }

            const prevX = vPrev[prevK + max];
            const prevY = prevX - prevK;

            while (x > prevX && y > prevY) { x--; y--; edits.push({ type: 'equal', li: x, ri: y }); }
            if (d > 0) {
                if (x > prevX) { x--; edits.push({ type: 'delete', li: x, ri: -1 }); }
                else if (y > prevY) { y--; edits.push({ type: 'insert', li: -1, ri: y }); }
            }
        }

        edits.reverse();

        // Consolidate into hunks
        const hunks = [];
        let i = 0;

        while (i < edits.length) {
            const edit = edits[i];
            if (edit.type === 'equal') {
                hunks.push({ type: 'equal', lLines: [left[edit.li]], rLines: [right[edit.ri]], lStart: edit.li, rStart: edit.ri });
                i++;
            } else if (edit.type === 'delete') {
                const dels = [];
                const ins = [];
                while (i < edits.length && edits[i].type === 'delete') { dels.push(edits[i]); i++; }
                while (i < edits.length && edits[i].type === 'insert') { ins.push(edits[i]); i++; }

                if (dels.length > 0 && ins.length > 0) {
                    const count = Math.min(dels.length, ins.length);
                    for (let j = 0; j < count; j++) {
                        hunks.push({
                            type: 'changed',
                            lLines: [left[dels[j].li]],
                            rLines: [right[ins[j].ri]],
                            lStart: dels[j].li,
                            rStart: ins[j].ri
                        });
                    }
                    for (let j = count; j < dels.length; j++) {
                        hunks.push({ type: 'removed', lLines: [left[dels[j].li]], rLines: [''], lStart: dels[j].li, rStart: -1 });
                    }
                    for (let j = count; j < ins.length; j++) {
                        hunks.push({ type: 'added', lLines: [''], rLines: [right[ins[j].ri]], lStart: -1, rStart: ins[j].ri });
                    }
                } else {
                    for (const d2 of dels) {
                        hunks.push({ type: 'removed', lLines: [left[d2.li]], rLines: [''], lStart: d2.li, rStart: -1 });
                    }
                    for (const ins2 of ins) {
                        hunks.push({ type: 'added', lLines: [''], rLines: [right[ins2.ri]], lStart: -1, rStart: ins2.ri });
                    }
                }
            } else {
                // insert
                const ins = [];
                while (i < edits.length && edits[i].type === 'insert') { ins.push(edits[i]); i++; }
                for (const ins2 of ins) {
                    hunks.push({ type: 'added', lLines: [''], rLines: [right[ins2.ri]], lStart: -1, rStart: ins2.ri });
                }
            }
        }

        return hunks;
    }

    // ───────────────────────────────────────────────────────────
    //  WORD-LEVEL DIFF
    //  Returns HTML strings with word highlights for two lines
    // ───────────────────────────────────────────────────────────
    function wordDiff(lineA, lineB) {
        const tokA = tokenizeWords(lineA);
        const tokB = tokenizeWords(lineB);

        const n = tokA.length;
        const m = tokB.length;
        const lcs = computeLCS(tokA, tokB);

        let ai = 0, bi = 0, li = 0;
        let leftHtml = '';
        let rightHtml = '';

        while (ai < n || bi < m) {
            if (ai < n && bi < m && li < lcs.length &&
                tokA[ai] === lcs[li] && tokB[bi] === lcs[li]) {
                leftHtml += escape(tokA[ai]);
                rightHtml += escape(tokB[bi]);
                ai++; bi++; li++;
            } else if (bi < m && (ai >= n || !tokA.slice(ai).includes(lcs[li]))) {
                rightHtml += `<span class="word-added">${escape(tokB[bi])}</span>`;
                bi++;
            } else {
                leftHtml += `<span class="word-removed">${escape(tokA[ai])}</span>`;
                ai++;
            }
        }

        return { leftHtml, rightHtml };
    }

    function tokenizeWords(line) {
        // Split into word tokens + whitespace + symbols
        return line.match(/\w+|\s+|[^\w\s]/g) || [];
    }

    function computeLCS(a, b) {
        const n = a.length, m = b.length;
        if (n === 0 || m === 0) return [];
        // Cap for performance on large lines
        if (n * m > 100000) return [];

        const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        const result = [];
        let i = n, j = m;
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
            else if (dp[i - 1][j] > dp[i][j - 1]) { i--; }
            else { j--; }
        }
        return result;
    }

    // ───────────────────────────────────────────────────────────
    //  SIDE-BY-SIDE HTML RENDERER
    // ───────────────────────────────────────────────────────────
    function renderSideBySide(hunks) {
        let ln = 0, rn = 0;

        // Group into visible chunks (with context collapsing)
        const rows = [];
        const visible = new Uint8Array(hunks.length);

        for (let i = 0; i < hunks.length; i++) {
            if (hunks[i].type !== 'equal') {
                for (let j = Math.max(0, i - CONTEXT_LINES); j < Math.min(hunks.length, i + CONTEXT_LINES + 1); j++) {
                    visible[j] = 1;
                }
            }
        }

        let lLineNum = 1;
        let rLineNum = 1;

        // Pre-calculate line numbers
        const lineNums = hunks.map(h => {
            const l = h.lStart >= 0 ? lLineNum : null;
            const r = h.rStart >= 0 ? rLineNum : null;
            if (h.lStart >= 0) lLineNum++;
            if (h.rStart >= 0) rLineNum++;
            return { l, r };
        });

        const hasChanges = hunks.some(h => h.type !== 'equal');

        if (!hasChanges) {
            return '<div style="padding:20px;text-align:center;color:var(--diff-unchanged-text);font-family:var(--font-mono);font-size:0.85rem">✓ No differences found — files are identical</div>';
        }

        let html = '<table class="diff-table" role="table"><colgroup><col/><col/><col/><col/><col/><col/></colgroup><tbody>';

        let skippedStart = -1;

        for (let i = 0; i < hunks.length; i++) {
            const h = hunks[i];
            const nums = lineNums[i];

            if (!visible[i]) {
                if (skippedStart === -1) skippedStart = i;
                continue;
            }

            if (skippedStart !== -1) {
                const skipped = i - skippedStart;
                html += `<tr class="diff-separator"><td colspan="6">⋯ ${skipped} unchanged line${skipped !== 1 ? 's' : ''} ⋯</td></tr>`;
                skippedStart = -1;
            }

            const lNum = nums.l !== null ? nums.l : '';
            const rNum = nums.r !== null ? nums.r : '';

            let lHtml, rHtml;

            if (h.type === 'changed') {
                const wordResult = wordDiff(h.lLines[0], h.rLines[0]);
                lHtml = wordResult.leftHtml;
                rHtml = wordResult.rightHtml;
            } else {
                lHtml = escape(h.lLines[0]);
                rHtml = escape(h.rLines[0]);
            }

            const rowClass = typeToRowClass(h.type);
            const lCode = h.lLines[0] !== '' ? lHtml : '';
            const rCode = h.rLines[0] !== '' ? rHtml : '';

            html += `
<tr class="diff-row ${rowClass}" role="row">
  <td class="gutter-cell" role="cell">${lNum}</td>
  <td class="diff-cell" role="cell">${lCode}</td>
  <td class="diff-divider" role="presentation"></td>
  <td class="gutter-cell" role="cell">${rNum}</td>
  <td class="diff-cell" role="cell">${rCode}</td>
</tr>`;
        }

        if (skippedStart !== -1) {
            const skipped = hunks.length - skippedStart;
            html += `<tr class="diff-separator"><td colspan="6">⋯ ${skipped} unchanged line${skipped !== 1 ? 's' : ''} ⋯</td></tr>`;
        }

        html += '</tbody></table>';
        return html;
    }

    // ───────────────────────────────────────────────────────────
    //  INLINE HTML RENDERER
    // ───────────────────────────────────────────────────────────
    function renderInline(hunks) {
        const hasChanges = hunks.some(h => h.type !== 'equal');

        if (!hasChanges) {
            return '<div style="padding:20px;text-align:center;color:var(--diff-unchanged-text);font-family:var(--font-mono);font-size:0.85rem">✓ No differences found — files are identical</div>';
        }

        let lLineNum = 1;
        let rLineNum = 1;
        let html = '<table class="inline-table" role="table"><colgroup><col/><col/><col/></colgroup><tbody>';

        const visible = new Uint8Array(hunks.length);
        for (let i = 0; i < hunks.length; i++) {
            if (hunks[i].type !== 'equal') {
                for (let j = Math.max(0, i - CONTEXT_LINES); j < Math.min(hunks.length, i + CONTEXT_LINES + 1); j++) {
                    visible[j] = 1;
                }
            }
        }

        let skippedStart = -1;

        for (let i = 0; i < hunks.length; i++) {
            const h = hunks[i];
            if (!visible[i]) {
                if (skippedStart === -1) skippedStart = i;
                if (h.lStart >= 0) lLineNum++;
                if (h.rStart >= 0) rLineNum++;
                continue;
            }

            if (skippedStart !== -1) {
                const skipped = i - skippedStart;
                html += `<tr class="diff-separator"><td colspan="3">⋯ ${skipped} unchanged line${skipped !== 1 ? 's' : ''} ⋯</td></tr>`;
                skippedStart = -1;
            }

            if (h.type === 'equal') {
                const ln = lLineNum++;
                rLineNum++;
                html += `<tr class="inline-equal">
  <td class="inline-gutter">${ln}</td>
  <td class="inline-gutter">  </td>
  <td class="inline-code">${escape(h.lLines[0])}</td>
</tr>`;
            } else if (h.type === 'removed') {
                const ln = lLineNum++;
                html += `<tr class="inline-removed">
  <td class="inline-gutter">${ln}</td>
  <td class="inline-gutter">−</td>
  <td class="inline-code">${escape(h.lLines[0])}</td>
</tr>`;
            } else if (h.type === 'added') {
                const rn = rLineNum++;
                html += `<tr class="inline-added">
  <td class="inline-gutter">  </td>
  <td class="inline-gutter">${rn}</td>
  <td class="inline-code">${escape(h.rLines[0])}</td>
</tr>`;
            } else if (h.type === 'changed') {
                const ln = lLineNum++;
                const rn = rLineNum++;
                const { leftHtml, rightHtml } = wordDiff(h.lLines[0], h.rLines[0]);
                html += `<tr class="inline-removed">
  <td class="inline-gutter">${ln}</td>
  <td class="inline-gutter">−</td>
  <td class="inline-code">${leftHtml}</td>
</tr>
<tr class="inline-added">
  <td class="inline-gutter">  </td>
  <td class="inline-gutter">${rn}</td>
  <td class="inline-code">${rightHtml}</td>
</tr>`;
            }
        }

        if (skippedStart !== -1) {
            const skipped = hunks.length - skippedStart;
            html += `<tr class="diff-separator"><td colspan="3">⋯ ${skipped} unchanged line${skipped !== 1 ? 's' : ''} ⋯</td></tr>`;
        }

        html += '</tbody></table>';
        return html;
    }

    // ───────────────────────────────────────────────────────────
    //  HELPERS
    // ───────────────────────────────────────────────────────────
    function typeToRowClass(type) {
        const map = { equal: 'line-equal', removed: 'line-removed', added: 'line-added', changed: 'line-changed' };
        return map[type] || 'line-equal';
    }

    // ───────────────────────────────────────────────────────────
    //  STATS COMPUTATION
    // ───────────────────────────────────────────────────────────
    function computeStats(hunks) {
        let added = 0, removed = 0, changed = 0;
        for (const h of hunks) {
            if (h.type === 'added') added++;
            if (h.type === 'removed') removed++;
            if (h.type === 'changed') changed++;
        }
        return { added, removed, changed };
    }

    // ───────────────────────────────────────────────────────────
    //  PLAIN-TEXT DIFF (for copy/download)
    // ───────────────────────────────────────────────────────────
    function renderPlainText(hunks) {
        let out = '';
        let lLine = 1, rLine = 1;
        for (const h of hunks) {
            if (h.type === 'equal') {
                out += `  ${h.lLines[0]}\n`;
                lLine++; rLine++;
            } else if (h.type === 'removed') {
                out += `- ${h.lLines[0]}\n`;
                lLine++;
            } else if (h.type === 'added') {
                out += `+ ${h.rLines[0]}\n`;
                rLine++;
            } else if (h.type === 'changed') {
                out += `- ${h.lLines[0]}\n`;
                out += `+ ${h.rLines[0]}\n`;
                lLine++; rLine++;
            }
        }
        return out;
    }

    // ───────────────────────────────────────────────────────────
    //  PUBLIC API
    // ───────────────────────────────────────────────────────────
    window.DiffEngine = {
        /**
         * Run a diff and return { html, stats, plainText }.
         * @param {string} leftText
         * @param {string} rightText
         * @param {object} options
         * @param {boolean} options.ignoreWhitespace
         * @param {boolean} options.jsonMode
         * @param {string}  options.viewMode  'sidebyside' | 'inline'
         * @returns {{ html: string, stats: object, plainText: string }}
         */
        run(leftText, rightText, options = {}) {
            let left = leftText;
            let right = rightText;

            // JSON normalization
            if (options.jsonMode) {
                try { left = normalizeJSON(left); } catch (e) {
                    return { error: `Left pane: Invalid JSON — ${e.message}` };
                }
                try { right = normalizeJSON(right); } catch (e) {
                    return { error: `Right pane: Invalid JSON — ${e.message}` };
                }
            }

            const leftLines = splitLines(left);
            const rightLines = splitLines(right);

            const hunks = myersDiff(leftLines, rightLines, options.ignoreWhitespace);
            const stats = computeStats(hunks);

            // default to inline
            const html = (options.viewMode === 'sidebyside')
                ? renderSideBySide(hunks)
                : renderInline(hunks);

            const plainText = renderPlainText(hunks);

            return { html, stats, plainText, hunks };
        },

        /**
         * Escape HTML — useful for safe rendering in toasts etc.
         */
        escape
    };

})();
