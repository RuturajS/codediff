/**
 * Codediff — Theme Manager
 * Handles dark/light theme switching with localStorage persistence.
 */

(function ThemeModule() {
  'use strict';

  const STORAGE_KEY = 'codediff-theme';
  const VALID_THEMES = ['dark', 'light'];
  const DEFAULT_THEME = 'dark';

  /**
   * Apply a theme to the document root.
   * @param {string} theme - 'dark' | 'light'
   */
  function applyTheme(theme) {
    if (!VALID_THEMES.includes(theme)) theme = DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* sandboxed */ }
  }

  /**
   * Read stored theme preference.
   * @returns {string}
   */
  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.includes(stored) ? stored : DEFAULT_THEME;
    } catch (_) {
      return DEFAULT_THEME;
    }
  }

  /**
   * Toggle between dark and light themes.
   */
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    updateToggleButton(next);
  }

  /**
   * Update the theme toggle button icon and label.
   * @param {string} theme
   */
  function updateToggleButton(theme) {
    const moon = document.getElementById('themeIconMoon');
    const sun = document.getElementById('themeIconSun');
    const label = document.getElementById('themeLabelText');

    if (!moon || !sun) return;

    if (theme === 'dark') {
      moon.style.display = 'block';
      sun.style.display = 'none';
      if (label) label.textContent = 'Light';
    } else {
      moon.style.display = 'none';
      sun.style.display = 'block';
      if (label) label.textContent = 'Dark';
    }
  }

  /**
   * Initialize theme system.
   */
  function init() {
    const theme = getStoredTheme();
    applyTheme(theme);

    // Wire up toggle button once DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        wireButton();
        updateToggleButton(theme);
      });
    } else {
      wireButton();
      updateToggleButton(theme);
    }
  }

  function wireButton() {
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  }

  // Expose for keyboard shortcut usage in main.js
  window.ThemeModule = { toggle: toggleTheme, apply: applyTheme, get: getStoredTheme };

  init();
})();
