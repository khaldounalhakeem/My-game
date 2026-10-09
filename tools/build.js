// Bundles the game into single self-contained HTML files:
//   dist/boost-league.html  — full document (works offline, double-click to open)
//   dist/artifact.html      — same content without the <html>/<head>/<body> wrapper
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = scripts.map(s => `<script>/* ${s} */\n${fs.readFileSync(path.join(root, s), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n');
let full = html
  .replace('<link rel="stylesheet" href="src/style.css">', `<style>\n${css}\n</style>`)
  .replace(/<!-- BUILD:SCRIPTS -->[\s\S]*<!-- \/BUILD:SCRIPTS -->/, () => js)
  .replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="(apple-touch-)?icon"[^>]*>\n?/g, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/boost-league.html'), full);
const head = full.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta charset[^>]*>\n?/, '').replace(/<meta name="viewport"[^>]*>\n?/, '');
const body = full.match(/<body>([\s\S]*)<\/body>/)[1];
const title = head.match(/<title>.*<\/title>/)[0];
fs.writeFileSync(path.join(root, 'dist/artifact.html'), title + '\n' + head.replace(title, '') + body);
console.log('built', (full.length / 1024).toFixed(0) + ' KB');
