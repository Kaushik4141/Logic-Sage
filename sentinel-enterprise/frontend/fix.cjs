const fs = require('fs');
const file = 'd:/Logic-Sage/sentinel-enterprise/frontend/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix imports
content = content.replace(
  /<<<<<<< HEAD\r?\nimport { TeamMapViewer } from "@\/components\/TeamMapViewer";\r?\n=======\r?\nimport { Sidebar, TeamMember } from "@\/components\/Sidebar";\r?\n>>>>>>> 55f379a33778e7e3e9b7af43a593ccd7a6afaed4/g,
  'import { TeamMapViewer } from "@/components/TeamMapViewer";\nimport { Sidebar, TeamMember } from "@/components/Sidebar";'
);

// Add TeamMapViewer
content = content.replace(
  '                      <div className="pt-8 relative">',
  '                      <TeamMapViewer />\n\n                      <div className="pt-8 relative">'
);

// Remove the huge conflict block
// We need to match from <<<<<<< HEAD at line 1010 to >>>>>>> 55f3... at 1472.
// Let's find the exact string.
const headRegex = /<<<<<<< HEAD[\s\S]*?=======\r?\n\s*<\/div>\r?\n>>>>>>> 55f379a33778e7e3e9b7af43a593ccd7a6afaed4/g;
content = content.replace(headRegex, '                </div>');

fs.writeFileSync(file, content, 'utf8');
console.log('Done!');
