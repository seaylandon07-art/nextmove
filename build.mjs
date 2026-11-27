// Builds ./public from ./app (the app, shared with the Claude artifact) and ./web (website-only files).
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

rmSync('public', { recursive: true, force: true });
mkdirSync('public');
cpSync('app', 'public', { recursive: true });
cpSync('web', 'public', { recursive: true });

const head = `
<meta name="description" content="Free chess with Stockfish: play bots and friends, review your games in plain English, and train on drills built from your own mistakes.">
<meta name="theme-color" content="#0a0e1c">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/svg+xml" href="/icons/logo.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta property="og:title" content="NextMove — chess training that learns from your mistakes">
<meta property="og:description" content="Play, review and train with Stockfish. Free.">
<meta property="og:image" content="https://nextmove.gg/og.png">
<meta property="og:url" content="https://nextmove.gg/">
<meta name="twitter:card" content="summary_large_image">`;

let html = readFileSync('public/index.html', 'utf8');
html = html.replace('<title>NextMove Chess</title>', '<title>NextMove — Chess training with Stockfish</title>' + head);
html = html.replace('<script src="ui.js"></script>', '<script src="web.js"></script>\n<script src="ui.js"></script>');
html = html.replace('via the Lichess project.</p>', 'via the Lichess project. <a href="/licenses.html" style="color:var(--acc2)">Licences and source code</a>.</p>');
writeFileSync('public/index.html', html);
console.log('built public/');
