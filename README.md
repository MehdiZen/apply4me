# apply4me

[Version française](README.fr.md)

apply4me is a browser extension for job seekers. One click on a job posting page tells you whether the posting is worth your time. The extension then prepares a one-page CV adapted to the posting, a tailored cover letter and a revision sheet for the interview when you need one. Everything stays in your browser. There is no backend and no account, and you bring your own API key.

## Features

- The extension reads the posting on the current page and compares it with your skills. The code computes the verdict, the model only extracts what the posting asks for.
- The popup shows which requirements you cover and which ones are missing. You can tick missing tools to add them to the skills line of your CV.
- The CV is built from a base of facts that you review. The model selects and rephrases these facts and never creates new ones. The code then checks numbers, tools and level of responsibility.
- The cover letter is written in French or English and goes through the same checks.
- The workspace tab also prepares likely interview questions, a short message to the recruiter and a revision sheet for the skills you added.
- You can download the CV and the letter as PDF files, copy the text, or insert the letter into the form field of the posting page.
- A log keeps every application with its status and exports to CSV.
- The interface is in French.

## Demo

![Demo of apply4me on a fictional job posting](docs/media/demo.gif)

The recording uses a fictional posting and a fictional profile, both stored in [demo](demo). The model replies are simulated so that nothing leaves the machine. You can also watch the [MP4 version](docs/media/demo.mp4).

## Installation

You need Node.js with npm. The build was verified with Node.js 21.

1. Clone the repository and install the dependencies.

   ```bash
   git clone https://github.com/MehdiZen/apply4me.git
   cd apply4me
   npm install
   ```

2. Build the extension for Chrome, Edge or Brave.

   ```bash
   npm run build:chrome
   ```

3. Open `chrome://extensions` and turn on Developer mode.
4. Click "Load unpacked" and select the `dist` folder of the repository.

Click the reload button on the extension card after a new build. Your data is kept.

Firefox needs `npm run build` instead. Load `dist/manifest.json` as a temporary add-on from `about:debugging`. The Firefox build does not request the `debugger` permission, so the PDF export opens the print dialog instead.

## Configuration

Open the settings with the gear icon of the popup, or from the extension options page. The setup has three steps.

1. Connect your API key and pick a model. The settings page lists the two supported providers, Anthropic (Claude models) and OpenAI (GPT models).
2. Import your CV as a PDF or an image. The extension builds your base of facts and you review it.
3. Fill in your profile and your search rules.

You can also import a profile file that you exported earlier from the same page.

The API key is stored in the local storage of your browser and is sent only to the provider you chose. The profile file never contains it. Generated documents live in session storage and disappear when you close the browser.

The option to add missing skills to the CV is off by default. You can turn it on in the settings.

The build reads two environment variables from the shell. The project does not use a `.env` file.

| Variable | Role |
| --- | --- |
| `TARGET_BROWSER` | Selects `chrome` or `firefox`. The default is `firefox`. |
| `A4M_SEED` | Path to a profile file that a personal build embeds and loads on first launch. |

### Permissions

The extension asks for `storage`, `activeTab` and access to http and https pages. The Chrome build also asks for `debugger`, which it uses only to print the CV and the letter to PDF. The content script runs on http and https pages to read the posting and makes no network call.

## Development

| Script | What it does |
| --- | --- |
| `npm run build` | Builds the Firefox version into `dist`. |
| `npm run build:chrome` | Builds the Chrome version into `dist`. |
| `npm run dev` | Runs the Vite development command. |
| `npm run dev:firefox` | Runs the extension in Firefox through web-ext. |
| `npm test` | Runs the unit tests with Vitest. |
| `npm run typecheck` | Runs the TypeScript compiler without emitting files. |
| `npm run build:me` | Makes a personal build with a profile from `seed/`, then copies it to a fixed Windows folder. It suits the maintainer's machine and needs edits elsewhere. |

The project has no lint script. The tests use two fictional profiles, a developer and a nurse.

Build with `TARGET_BROWSER=chrome A4M_SEED=demo/profil-fictif.json npx vite build` to record the demo again, then follow the header of [demo/record.mjs](demo/record.mjs). The script loads Playwright and ffmpeg-static from a folder outside the repository.

## Repository structure

| Path | Content |
| --- | --- |
| `extension/content` | Content script that reads the posting and fills the letter field. |
| `extension/lib` | Posting analysis, matching, CV and letter generation, checks, storage and PDF export. |
| `extension/popup` | Popup with the verdict and the skills to add. |
| `extension/workspace` | Tab where the CV, the letter and the revision sheet are generated. |
| `extension/options` | Settings page for the key, the CV, the fact base, the profile and the log. |
| `extension/ui` | Shared theme and components. |
| `extension/types` | Shared TypeScript types. |
| `tests` | Unit tests and fictional fixtures. |
| `demo` | Fictional profile, fictional posting and the recording script. |
| `docs/media` | Demo video and GIF. |
| `icons` | Extension icons. |
| `manifest.json` | Extension manifest. |

## License

Copyright (c) 2026 Mehdi Zenati. apply4me is **source-available** under a dual license: free for personal non-commercial use, paid license for commercial and professional use. See [LICENSE](LICENSE) for the exact terms. Third-party libraries keep their own licenses.
