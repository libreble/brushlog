const REPO = 'https://github.com/libreble/brushlog';
/** A clean tag build ("v1.2.0") links to its release; anything else is shown as plain text. */
const RELEASE = /^v\d+\.\d+\.\d+$/.test(__APP_VERSION__) ? `${REPO}/releases/tag/${__APP_VERSION__}` : null;

/** The Ko-fi link wears a different joke each page load; its title/aria-label says what it is. */
const KOFI_JOKES = [
  'Buy me a brush head',
  'Buy me some toothpicks',
  'Buy me floss',
  'Buy me a tube of toothpaste',
];
const KOFI_JOKE = KOFI_JOKES[Math.floor(Math.random() * KOFI_JOKES.length)];
const KOFI_TITLE = 'Support libreble on Ko-fi';

const LINK = 'inline-flex items-center gap-1 hover:text-fg';

export function AppFooter() {
  return (
    <footer className="pt-2 text-[11px] text-fg-subtle">
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <a href="https://libreble.github.io/" className={LINK}>
          <LibrebleMark />
          Part of <span className="font-medium">libre<span className="text-[#c2410c] dark:text-[#ffa259]">ble</span></span>
        </a>
        <a href={REPO} target="_blank" rel="noopener noreferrer" className={LINK}>
          <GitHubMark />
          GitHub
        </a>
        <a href={`${REPO}/issues/new/choose`} target="_blank" rel="noopener noreferrer" className={LINK}>
          Report an issue
        </a>
        <a
          href="https://ko-fi.com/mannes"
          target="_blank"
          rel="noopener noreferrer"
          title={KOFI_TITLE}
          aria-label={`${KOFI_JOKE} — ${KOFI_TITLE}`}
          className={LINK}
        >
          <CupMark />
          {KOFI_JOKE}
        </a>
        {RELEASE ? (
          <a href={RELEASE} target="_blank" rel="noopener noreferrer" className={`${LINK} font-mono`}>
            {__APP_VERSION__}
          </a>
        ) : (
          <span className="font-mono">{__APP_VERSION__}</span>
        )}
      </p>
    </footer>
  );
}

/** The libreble "open beacon": an LED inside two rings opening to the top right. */
function LibrebleMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-3.5 w-3.5" aria-hidden>
      <g transform="translate(32 32) rotate(-45) translate(-32 -32)" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
        <path d="M44.36 40.50A15 15 0 1 1 44.36 23.50" />
        <path d="M54.69 42.50A25 25 0 1 1 54.69 21.50" />
      </g>
      <circle cx="32" cy="32" r="6.5" className="fill-[#f26b1d] dark:fill-[#ff8a3d]" />
    </svg>
  );
}

function CupMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M2.5 6h9v4a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10V6Z" />
      <path d="M11.5 7h1a1.75 1.75 0 0 1 0 3.5h-1.2" />
      <path d="M5.5 2.5v1.5M8.5 2.5v1.5" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}
