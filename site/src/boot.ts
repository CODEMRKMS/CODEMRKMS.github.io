/**
 * The entry script, kept tiny on purpose. The page is complete HTML and CSS, so it is allowed to paint before any
 * application code is evaluated: the app (GSAP, Lenis, router) starts in the task after the first frame. Its files
 * are already downloading by then (the build adds modulepreload links for them, see vite.config.ts).
 */
import './styles/index.css';

requestAnimationFrame(() => setTimeout(() => void import('./main'), 0));
