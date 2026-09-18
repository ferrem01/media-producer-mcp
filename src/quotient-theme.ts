/**
 * The Quotient look, for every page this server serves to a person
 * (Studio, the phone Studio, the take page, the team page).
 *
 * Extracted from the Quotient web app's UI layer (apps/mothership: its
 * globals.css, tailwind config and shadcn-style components) and resolved
 * to plain CSS with the real values. The traits that make it Quotient:
 * near-black is the accent (the primary button is #17171B, white in dark
 * mode); a blue-violet tinted neutral scale (#F9F9FB ground, #EFF0F6
 * borders, #17171B text); borders almost invisible and shadows doing the
 * separating (resting shadows vanish in dark mode, borders step up); 12px
 * radius on controls, 8px on small things, 10px on tables; Inter at 14px,
 * medium for anything you can click; gray focus rings, never blue; quiet
 * 150ms motion with a 1px press dip. Dark mode follows the system
 * (prefers-color-scheme) unless html[data-theme] pins it.
 */

export const QUOTIENT_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">`;

const TOKENS_LIGHT = `
  --gray-0: #F9F9FB; --gray-25: #EFF0F6; --gray-50: #CECEE1; --gray-75: #BCBCCD; --gray-100: #AEAEBD; --gray-200: #8F8F9F;
  --gray-300: #6A6A78; --gray-400: #54545F; --gray-500: #3A3C40; --gray-600: #2D2F34; --gray-700: #27282B; --gray-800: #202022;
  --gray-900: #19191A; --gray-950: #17171B; --black: #0A0A0B; --white: #FFFFFF;
  --blue-200: #DCEDFD; --blue-300: #4D98F8; --blue-400: #1C82FF; --blue-500: #2B63E3;
  --green-200: #B6F6CD; --green-300: #6CDB94; --green-400: #55B876; --green-500: #479E66;
  --red-200: #FAE0E3; --red-300: #EB4752; --red-400: #CE2F33; --red-500: #BA2A2D;
  --orange-200: #FBF4CE; --orange-300: #EEC84F; --orange-400: #D48C34; --orange-500: #A46126;
  --purple-200: #DDD2FC; --purple-300: #852DF6; --purple-400: #6F1BD8; --purple-500: #6519C2;
  --content-primary: var(--gray-950); --content-secondary: var(--gray-400); --content-tertiary: var(--gray-300);
  --content-disabled: var(--gray-100); --content-reverse: var(--white); --content-link: #2d63e1;
  --border-primary: var(--gray-0); --border-secondary: var(--gray-25); --border-tertiary: var(--gray-50);
  --surface-background: var(--gray-0); --surface-primary: var(--white); --surface-secondary: var(--gray-0);
  --surface-tertiary: var(--gray-25); --surface-disabled: var(--gray-100); --surface-action: var(--gray-950);
  --surface-action-reverse: var(--white); --surface-overlay: rgb(10 10 11 / 20%);
  --accent-purple: #7227ce; --accent-pink: #f02db3; --accent-orange: #d38c36; --accent-turquoise: #5ac3d3;
  --accent-red: #d02f35; --accent-blue: #2d63e1; --accent-green: #5ab578; --focus-ring: #909098;
  --shadow-strong: 0 8px 16px 0 rgb(25 44 128 / 2%), 0 4px 8px 0 rgb(196 196 215 / 25%), 0 2px 4px 0 rgb(196 196 215 / 17%), 0 0 0 1px rgb(0 0 0 / 4%);
  --shadow-sub: 0 8px 8px 0 rgb(25 44 128 / 2%), 0 2px 4px 0 rgb(196 196 215 / 17%), 0 1px 2px 0 rgb(196 196 215 / 25%);
  --shadow-soft: 0 6px 10px 0 rgb(12 12 66 / 2%), 0 1px 2px 0 rgb(40 28 65 / 4%);
  --shadow-weak: 0 1.5px 1.5px 0 rgb(44 51 69 / 4%), 0 0.5px 0.5px 0 rgb(154 157 166 / 3%);
  --shadow-overlay: 0 25px 50px -12px rgb(0 0 0 / 25%);
  --shadow-tw-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-tw-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --core-panel-bg:
    radial-gradient(29.67% 29.67% at 20.09% 70.33%, rgba(253,172,79,0.05) 0%, rgba(253,172,79,0) 100%),
    radial-gradient(29.25% 29.25% at 18.36% 38.54%, rgba(253,79,149,0.05) 0%, rgba(253,79,149,0) 100%),
    radial-gradient(31.69% 31.69% at 19.35% 0%, rgba(33,22,253,0.03) 0%, rgba(33,22,253,0) 100%),
    linear-gradient(180deg, #fcfcfc 0%, #f9f9f9 100%);
  color-scheme: light;`;

const TOKENS_DARK = `
  --content-primary: var(--white); --content-secondary: var(--gray-100); --content-tertiary: var(--gray-200);
  --content-disabled: var(--gray-400); --content-reverse: var(--gray-950); --content-link: var(--blue-300);
  --border-primary: var(--gray-800); --border-secondary: var(--gray-700); --border-tertiary: var(--gray-600);
  --surface-background: var(--black); --surface-primary: var(--gray-900); --surface-secondary: var(--gray-700);
  --surface-tertiary: var(--gray-500); --surface-disabled: var(--gray-700); --surface-action: var(--white);
  --surface-action-reverse: var(--gray-950); --surface-overlay: rgb(10 10 11 / 50%);
  --accent-purple: #842cf6; --accent-blue: #1a81ff; --focus-ring: #67676f;
  --shadow-strong: none; --shadow-sub: none; --shadow-soft: none; --shadow-weak: none; --shadow-tw-xs: none; --shadow-tw-lg: none;
  --shadow-overlay: 0 24px 64px -12px rgb(0 0 0 / 70%), 0 8px 24px -8px rgb(0 0 0 / 50%), inset 0 1px 0 rgb(255 255 255 / 6%);
  --core-panel-bg: linear-gradient(#0A0A0B, #0A0A0B);
  color-scheme: dark;`;

/** Tokens + base + the component recipes. Paste at the top of a page's <style>. */
export const QUOTIENT_CSS = `
  :root {${TOKENS_LIGHT}
    --radius: 12px; --radius-xl: 14px; --radius-md: 10px; --radius-sm: 8px; --radius-xs: 4px; --radius-full: 9999px;
    --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    --background: var(--surface-background); --foreground: var(--content-primary);
    --card: var(--surface-primary); --popover: var(--surface-primary);
    --primary: var(--surface-action); --primary-foreground: var(--surface-action-reverse);
    --secondary: var(--surface-secondary); --muted: var(--surface-secondary); --muted-foreground: var(--content-secondary);
    --accent: var(--surface-tertiary); --destructive: var(--accent-red);
    --border: var(--border-secondary); --input: var(--border-secondary); --ring: var(--focus-ring);
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${TOKENS_DARK} --accent: var(--gray-600); --input: var(--gray-700); } }
  :root[data-theme="dark"], .dark {${TOKENS_DARK} --accent: var(--gray-600); --input: var(--gray-700); }

  *, ::before, ::after { box-sizing: border-box; border-color: var(--border); }
  html { font-family: var(--font-sans); }
  body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-sans); font-size: 14px; line-height: 20px;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  * { scrollbar-color: var(--gray-100) transparent; scrollbar-width: thin; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: var(--gray-50); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--gray-100); }
  ::-webkit-scrollbar-track { background: transparent; }
  button:not(:disabled), [role="button"]:not([aria-disabled="true"]) { cursor: pointer; }
  a { color: var(--content-link); text-decoration: none; }

  /* Buttons: sm (36px) is the default; the primary is near-black. */
  .q-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 8px; height: 36px; padding: 0 12px;
    border: 1px solid transparent; border-radius: var(--radius); background-clip: padding-box; font: 500 14px/20px var(--font-sans);
    white-space: nowrap; user-select: none; color: var(--foreground); background: transparent; text-decoration: none;
    transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1); outline: none; -webkit-appearance: none; appearance: none; }
  .q-btn svg { width: 16px; height: 16px; flex-shrink: 0; pointer-events: none; }
  .q-btn:active { transform: translateY(1px); }
  .q-btn:disabled, .q-btn[disabled], .q-btn[aria-disabled="true"] { pointer-events: none; opacity: .5; }
  .q-btn:focus-visible { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent); }
  .q-btn--primary { background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-weak); }
  .q-btn--primary:hover { background: color-mix(in srgb, var(--primary) 90%, transparent); }
  .q-btn--destructive { background: var(--destructive); color: #fff; box-shadow: var(--shadow-weak); }
  .q-btn--destructive:hover { background: color-mix(in srgb, var(--destructive) 90%, transparent); }
  .q-btn--outline { border-color: var(--border-secondary); background: var(--surface-primary); box-shadow: var(--shadow-weak); }
  .q-btn--outline:hover { background: var(--accent); }
  .q-btn--secondary { background: var(--secondary); color: var(--content-primary); box-shadow: var(--shadow-weak); }
  .q-btn--secondary:hover { background: var(--accent); }
  .q-btn--ghost:hover { background: var(--accent); color: var(--content-primary); }
  .q-btn--link { color: var(--primary); text-underline-offset: 4px; }
  .q-btn--link:hover { text-decoration: underline; }
  .q-btn--default { height: 40px; padding: 8px 16px; }
  .q-btn--xs { height: 28px; padding: 0 8px; font-size: 12px; border-radius: var(--radius-sm); }
  .q-btn--lg { height: 44px; padding: 0 32px; }
  .q-btn--icon { height: 36px; width: 36px; padding: 0; }
  .q-btn--icon-xs { height: 24px; width: 24px; padding: 0; font-size: 12px; border-radius: var(--radius-sm); }
  .q-btn--block { width: 100%; }
  .q-kbd { pointer-events: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 20px; min-width: 20px; padding: 0 4px;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--muted); color: var(--muted-foreground); font: 500 12px/1 var(--font-sans); user-select: none; }

  /* Inputs */
  .q-input, .q-textarea, .q-select { display: flex; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid var(--input); border-radius: var(--radius);
    background: var(--surface-primary); font: 400 14px/20px var(--font-sans); color: var(--foreground); outline: none; -webkit-appearance: none; appearance: none; }
  .q-input::placeholder, .q-textarea::placeholder { color: var(--muted-foreground); }
  .q-input:focus-visible, .q-textarea:focus-visible, .q-select:focus-visible, .q-input:focus, .q-textarea:focus, .q-select:focus {
    border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent); }
  .q-input:disabled, .q-textarea:disabled, .q-select:disabled { cursor: not-allowed; opacity: .5; }
  .q-input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 20%, transparent); }
  .q-input--compact, .q-select--compact { height: 32px; padding: 4px 8px; font-size: 12px; }
  .q-textarea { min-height: 80px; height: auto; resize: vertical; }
  .q-select { box-shadow: var(--shadow-weak); cursor: pointer; padding-right: 32px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2354545F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center; }
  .q-label { font: 500 14px/1 var(--font-sans); user-select: none; }

  /* Cards, panels, separators */
  .q-card { border: 1px solid var(--border-secondary); border-radius: var(--radius); background: var(--card); color: var(--foreground); box-shadow: var(--shadow-sub); }
  .q-card__header { display: flex; flex-direction: column; gap: 6px; padding: 24px; }
  .q-card__title { margin: 0 0 4px; font: 500 18px/1 var(--font-sans); letter-spacing: -0.025em; }
  .q-card__desc { margin: 0; font: 400 14px/20px var(--font-sans); color: var(--muted-foreground); }
  .q-card__content { padding: 0 24px 24px; }
  .q-card__footer { display: flex; align-items: center; padding: 12px; border-top: 1px solid var(--border-secondary); background: var(--surface-secondary); border-radius: 0 0 var(--radius-xl) var(--radius-xl); }
  .q-separator { height: 1px; width: 100%; background: var(--border-secondary); flex-shrink: 0; }
  .q-popup { border-radius: var(--radius); background: var(--popover); color: var(--foreground); box-shadow: var(--shadow-strong), 0 0 0 1px var(--border); padding: 4px; min-width: 128px; overflow: auto; }
  .q-popup__item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); font: 400 14px/20px var(--font-sans); cursor: default; user-select: none; outline: none; border: 0; background: none; color: inherit; text-align: left; }
  .q-popup__item:hover, .q-popup__item:focus { background: var(--accent); color: var(--content-primary); }
  .q-popup__sep { height: 1px; margin: 4px -4px; background: var(--border); }

  /* Pills (status tags): 8px radius, 12px medium, tinted border, xs shadow */
  .q-pill { display: inline-flex; width: fit-content; align-items: center; gap: 4px; height: fit-content; padding: 2.5px 8px; border-radius: var(--radius-sm);
    font: 500 12px/16px var(--font-sans); text-align: center; white-space: nowrap; box-shadow: var(--shadow-tw-xs);
    border: 1px solid var(--border-secondary); background: var(--surface-secondary); color: var(--content-secondary); }
  .q-pill--md { height: 30px; padding: 6px 12px; font-size: 14px; }
  .q-pill--filled { background: var(--surface-action); color: var(--content-reverse); border-color: transparent; }
  .q-pill--dot::before { content: ""; width: 6px; height: 6px; border-radius: 9999px; background: var(--dot, #6A6A78); translate: 0 -0.5px; }
  .q-pill--blue { background: #eff6ff; border-color: rgb(21 93 252 / .2); color: #1c398e; }
  .q-pill--green { background: #f0fdf4; border-color: rgb(0 166 62 / .2); color: #0d542b; }
  .q-pill--red { background: #fef2f2; border-color: rgb(231 0 11 / .2); color: #82181a; }
  .q-pill--amber { background: #fffbeb; border-color: rgb(225 113 0 / .2); color: #7b3306; }
  .q-pill--purple { background: rgb(221 210 252 / .7); border-color: rgb(111 27 216 / .2); color: #6519C2; }
  .dark .q-pill--blue, :root[data-theme="dark"] .q-pill--blue { background: rgb(28 57 142 / .7); border-color: #1c398e; color: #51a2ff; }
  .dark .q-pill--green, :root[data-theme="dark"] .q-pill--green { background: rgb(13 84 43 / .7); border-color: #0d542b; color: #00c950; }
  .dark .q-pill--red, :root[data-theme="dark"] .q-pill--red { background: rgb(130 24 26 / .7); border-color: #82181a; color: #fb2c36; }
  .dark .q-pill--amber, :root[data-theme="dark"] .q-pill--amber { background: rgb(123 51 6 / .7); border-color: #7b3306; color: #fe9a00; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .q-pill--blue { background: rgb(28 57 142 / .7); border-color: #1c398e; color: #51a2ff; }
    :root:not([data-theme="light"]) .q-pill--green { background: rgb(13 84 43 / .7); border-color: #0d542b; color: #00c950; }
    :root:not([data-theme="light"]) .q-pill--red { background: rgb(130 24 26 / .7); border-color: #82181a; color: #fb2c36; }
    :root:not([data-theme="light"]) .q-pill--amber { background: rgb(123 51 6 / .7); border-color: #7b3306; color: #fe9a00; }
  }

  /* Tabs, table, alert */
  .q-tabs { display: inline-flex; width: fit-content; align-items: center; height: 40px; padding: 4px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); box-shadow: var(--shadow-weak); }
  .q-tab { display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; border: 0; background: none; color: inherit; border-radius: var(--radius-sm); font: 500 14px/20px var(--font-sans); white-space: nowrap; transition: all 150ms cubic-bezier(.4,0,.2,1); }
  .q-tab[data-active], .q-tab.is-active { background: var(--surface-primary); color: var(--foreground); box-shadow: var(--shadow-tw-xs); }
  .q-table-wrap { position: relative; width: 100%; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-secondary); }
  .q-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
  .q-table th { height: 48px; padding: 0 16px; text-align: left; vertical-align: middle; font-weight: 500; color: var(--muted-foreground); border-bottom: 1px solid var(--border); }
  .q-table tbody { background: var(--surface-primary); }
  .q-table td { padding: 16px; vertical-align: middle; border-bottom: 1px solid var(--border); }
  .q-table tbody tr:last-child td { border-bottom: 0; }
  .q-table tbody tr { transition: background-color 150ms cubic-bezier(.4,0,.2,1); }
  .q-table tbody tr:hover { background: color-mix(in srgb, var(--muted) 50%, transparent); }
  .q-alert { padding: 12px 16px; border: 1px solid var(--border-secondary); border-radius: var(--radius-md); background: var(--surface-primary); color: var(--content-primary); }
  .q-callout { padding: 16px; border-radius: var(--radius-md); font-size: 14px; }
  .q-callout--info { background: #eff6ff; border: 1px solid rgb(21 93 252 / .3); color: #1c398e; }
  .q-callout--error { background: #fef2f2; border: 1px solid rgb(231 0 11 / .3); color: #82181a; }
  .q-callout--warning { background: #fefce8; border: 1px solid rgb(208 135 0 / .3); color: #733e0a; }

  /* Empty state, skeleton, spinner, progress */
  .q-empty { margin: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 100%; }
  .q-empty__title { margin: 0; text-align: center; font: 500 18px/28px var(--font-sans); color: var(--foreground); }
  .q-empty__desc { margin: 0 0 12px; max-width: 448px; text-align: center; text-wrap: balance; font: 400 14px/20px var(--font-sans); color: var(--muted-foreground); }
  .q-empty-inline { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px 16px; border: 1px dashed var(--border); border-radius: var(--radius); }
  .q-skeleton { border-radius: var(--radius-md); background: var(--muted); animation: q-pulse 2s cubic-bezier(.4, 0, .6, 1) infinite; }
  @keyframes q-pulse { 50% { opacity: .5; } }
  @media (prefers-reduced-motion: reduce) { .q-skeleton { animation: none; } }
  .q-loader-track { width: 100%; height: 4px; border-radius: 9999px; background: var(--muted); overflow: hidden; }
  .q-loader-bar { height: 100%; width: 0; border-radius: 9999px; background: var(--primary); transition: width .2s; }
  .q-loader-bar--sweep { width: 34%; animation: q-sweep 1.6s ease-in-out infinite; }
  @keyframes q-sweep { 0% { margin-left: -34%; } 100% { margin-left: 100%; } }
  .q-spinner { display: inline-block; width: 16px; height: 16px; border-radius: 50%; border: 2px solid color-mix(in srgb, currentColor 25%, transparent); border-top-color: currentColor; animation: q-spin .8s linear infinite; }
  @keyframes q-spin { to { transform: rotate(360deg); } }

  /* Page frame */
  .q-page__title { margin: 0; font: 500 20px/28px var(--font-sans); color: var(--foreground); letter-spacing: -0.01em; }
  .q-muted { color: var(--muted-foreground); }
  .q-mono { font-family: var(--font-mono); font-size: 12px; }
`;

/** A Quotient-style dark tooltip (the small black one). */
export const QUOTIENT_TOOLTIP_CSS = `.q-tooltip--dark { border: 0; border-radius: 4px; padding: 4px 8px; background: #19191A; color: #fff; font-size: 12px; }`;
