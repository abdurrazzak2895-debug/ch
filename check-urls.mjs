import fs from 'fs';
const files = fs.readdirSync('src/api');
files.forEach(f => {
  const c = fs.readFileSync('src/api/' + f, 'utf8');
  const urls = c.match(/https?:\/\/[^\s'"`)]+/g) || [];
  urls.forEach(u => console.log(f + ':', u.substring(0, 120)));
});

// Also check the takamol-api.ts
const ta = fs.readFileSync('frontend/src/lib/takamol-api.ts', 'utf8');
const taUrls = ta.match(/https?:\/\/[^\s'"`)]+/g) || [];
taUrls.forEach(u => console.log('takamol-api.ts:', u.substring(0, 120)));

// Check for VITE_ env vars
const viteUrls = ta.match(/VITE_[A-Z_]+/g) || [];
console.log('VITE vars:', [...new Set(viteUrls)]);
