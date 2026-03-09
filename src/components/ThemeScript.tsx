/**
 * Inline script for theme initialization (runs before React hydration).
 * Extracted to its own component to avoid dangerouslySetInnerHTML in __root.
 */
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export default function ThemeScript() {
	return (
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Required for FOUC-free theme initialization before hydration
		<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
	);
}
