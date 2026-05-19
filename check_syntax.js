const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('c:\\Users\\Brenda\\Desktop\\FERIAS NOVO\\ferias-e-folgas--main\\index.html.html', 'utf-8');

// Extract script content
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scriptContent = '';

while ((match = scriptRegex.exec(html)) !== null) {
  scriptContent += match[1] + '\n';
}

try {
  new vm.Script(scriptContent);
  console.log("SYNTAX CHECK: PASSED (No syntax errors detected!)");
} catch (err) {
  console.error("SYNTAX CHECK: FAILED!");
  console.error(err);
}
