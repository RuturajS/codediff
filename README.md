# Codediff — Code Difference Viewer

> A minimal, professional-grade, browser-based code diff tool. No backend. No build step. Deploy anywhere access and easy no storinig any data privacy at stack of your own .

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue?logo=github)](https://pages.github.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen)](#tech-stack)

**[🔗 Live Demo](#)** ← Replace with your GitHub Pages URL after deploy

---

##  Features

| Feature | Details |
|---|---|
| **Side-by-Side Diff** | Two resizable panes with synchronized scrolling |
| **Inline Diff Mode** | Toggle between side-by-side and inline views |
| **Word-level Highlighting** | Sub-line diff shows exactly which words changed |
| **Added / Removed / Changed** | Color-coded: green, red, yellow |
| **Line Numbers** | Shown in gutter with correct original/modified numbering |
| **Context Collapsing** | Unchanged blocks collapse with a click-to-expand indicator |
| **File Upload** | Click the Upload button in each pane |
| **Drag & Drop** | Drop any text file directly onto either pane |
| **JSON Mode** | Auto-normalizes JSON before comparing (pretty-print) |
| **Ignore Whitespace** | Toggle to ignore leading/trailing/extra spaces |
| **Dark & Light Themes** | Persisted in `localStorage`, toggle instantly |
| **Copy Diff** | Copy the unified diff text to clipboard |
| **Download Diff** | Save diff output as a `.diff` file |
| **Diff Stats** | Live count of added, removed, and changed lines |
| **Sample Code** | Auto-loads a sample diff on first visit |
| **Keyboard Shortcuts** | See table below |
| **Fullscreen Mode** | One-click fullscreen |
| **Zero Dependencies** | Pure HTML + CSS + Vanilla JS — no npm, no bundler |
| **XSS-Safe** | All user content is HTML-escaped before rendering |
| **Large File Support** | Handles 10,000+ line files without blocking the UI |

---

##  Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Compare |
| `Ctrl + L` | Clear all |
| `Ctrl + Shift + T` | Toggle theme |
| `Ctrl + Shift + S` | Swap panes |
| `Ctrl + D` | Download diff |
| `?` | Show shortcuts modal |
| `Esc` | Close modal |
| `Tab` | Indent in editor |
| `Shift + Tab` | Unindent in editor |



## 📸 UI Preview (ASCII Mock)

```
┌────────────────────────────────────────────────────────────────┐
│  ◈ Codediff    +12  -5  ~3   □ Ignore WS  □ JSON   ☾ Light  ⛶ │
├───────────────────────────┬────────────────────────────────────┤
│ ORIGINAL        ↑ Upload  │ MODIFIED               ↑ Upload   │
│                           │                                    │
│  function greet(name) {   │  function greet(name,greeting) {  │
│    const msg = "Hello"    │    const msg = `${greeting}...`   │
│    console.log(msg)       │    console.info(msg)              │
│    return msg             │    return msg                     │
│  }                        │  }                                 │
├───────────────────────────┴────────────────────────────────────┤
│  [Compare]  [Clear All]  [Swap]        [Copy Diff] [Download] │
│                                   [Side by Side] [Inline]     │
├────────────────────────────────────────────────────────────────┤
│  ─── 2 unchanged lines ───                                     │
│  1  │ function greet(name) {    1  │ function greet(name, g…  │
│  2  │   const msg = "Hello"    2  │   const msg = `${greet…  │
│     │                          3  │   console.info(msg)       │
│  4  │ }                        4  │ }                          │
└────────────────────────────────────────────────────────────────┘
```


## Security

- **No eval()** — no dynamic code execution
- **HTML escaping** — all user content sanitized before rendering
- **Safe JSON parsing** — wrapped in try/catch
- **No external scripts** — fonts only CDN dependency (optional)
- **CSP-friendly** — no inline event handlers

---



## 📂 Supported File Types

`.js` `.ts` `.tsx` `.jsx` `.py` `.java` `.json` `.txt` `.html` `.htm` `.css` `.xml` `.log` `.yaml` `.yml` `.md` `.sh` `.rb` `.go` `.rs` `.c` `.cpp` `.h` `.csv`

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit changes: `git commit -m "feat: add your feature"`
4. Push: `git push origin feat/your-feature`
5. Open a Pull Request

Please keep PRs focused and include a clear description of what changed and why.

---

## � About

Built by **[Ruturaj Sharbidre](https://linkedin.com/in/ruturajsharbidre)** — connect on LinkedIn.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built with ♥ using zero dependencies.*