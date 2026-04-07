import fs from 'fs';
let html = fs.readFileSync('stitch_landing.txt', 'utf8');

const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
let mainContent = '<main className="relative overflow-hidden w-full">' + mainMatch[1] + '</main>';

mainContent = mainContent.replace(/class=/g, 'className=');
mainContent = mainContent.replace(/<img([^>]*)>/g, '<img$1 />');
mainContent = mainContent.replace(/<br>/g, '<br />');
mainContent = mainContent.replace(/<input([^>]*)>/g, '<input$1 />');
mainContent = mainContent.replace(/<hr([^>]*)>/g, '<hr$1 />');
// style="font-variation-settings: 'FILL' 1;"
mainContent = mainContent.replace(/style="font-variation-settings:\s*'FILL'\s*1;"/g, 'style={{ fontVariationSettings: `"\'FILL\' 1"` }}');
mainContent = mainContent.replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments

fs.writeFileSync('stitch_react.txt', mainContent);
