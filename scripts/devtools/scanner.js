const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
let match;
const suspicious = [];

while ((match = scriptRegex.exec(content)) !== null) {
  const scriptContent = match[1];
  const lines = scriptContent.split('\n');
  lines.forEach((line, index) => {
    // Look for patterns like 'regex containing apostrophe'
    // This is a simplified check: search for ' followed by letters then ' then letters
    if (/'[a-zA-Z]+'[a-zA-Z]+/.test(line) || /'[a-zA-Z]+' /.test(line) || / [a-zA-Z]+'[a-zA-Z]+'/.test(line)) {
       // but we specifically want to find broken strings
       // Let's look for things like '...C'est...' where the syntax highlighter would break.
       // A common pattern is single quotes containing apostrophes.
    }
    // Specific check for the requested broken strings
    if (line.includes("'C'est") || line.includes("'Quelqu'un") || line.includes("'D'autres")) {
       suspicious.push({line: line.trim(), index: index + 1});
    }
  });
}

console.log('Suspicious lines found:');
suspicious.forEach(s => console.log(`Line ${s.index}: ${s.line}`));
