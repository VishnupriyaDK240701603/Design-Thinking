const fs = require('fs');
let c = fs.readFileSync('src/routes/ai.ts', 'utf8');
c = c.replace(/\\\`/g, '\`');
c = c.replace(/\\\$/g, '$');
fs.writeFileSync('src/routes/ai.ts', c);
