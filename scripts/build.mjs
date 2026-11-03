import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{force:true,recursive:true});await mkdir('dist');
for(const name of ['index.html','app.js','push-ui.js','sw.js','manifest.webmanifest','icon.svg'])await cp(name,`dist/${name}`);
