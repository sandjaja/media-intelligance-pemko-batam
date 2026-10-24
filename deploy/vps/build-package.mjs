#!/usr/bin/env node
// Build a release from this checkout. Never bundle .env, source secrets or node_modules.
import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(root,'release'));
await fs.mkdir(output,{recursive:true});const temp=await fs.mkdtemp(path.join(output,'.build-')),stage=path.join(temp,'media-intelligence-vps');await fs.mkdir(stage);
try{
 execFileSync('npm',['run','build'],{cwd:path.join(root,'backend'),stdio:'inherit'});
 await fs.mkdir(path.join(stage,'public'));for(const item of await fs.readdir(root,{withFileTypes:true})){if(item.isFile()&&!item.name.endsWith('.test.js')&&!item.name.startsWith('.')&&/\.(html|js|css|svg|png|jpg|jpeg|ico|webp|geojson)$/.test(item.name))await fs.copyFile(path.join(root,item.name),path.join(stage,'public',item.name))}
 await fs.mkdir(path.join(stage,'backend'));for(const item of ['dist','migrations','install','package.json','package-lock.json'])await fs.cp(path.join(root,'backend',item),path.join(stage,'backend',item),{recursive:true,filter:src=>!src.endsWith('.test.js')&&!src.endsWith('.test.ts')});
 await fs.cp(path.join(root,'deploy/vps'),path.join(stage,'deploy'),{recursive:true});
 let version='local';try{version=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())version+='-dirty'}catch{}
 await fs.writeFile(path.join(stage,'VERSION'),version+'\n');const archive=path.join(output,'media-intelligence-vps.tar.gz');execFileSync('tar',['-czf',archive,'-C',temp,'media-intelligence-vps']);console.log(archive);
}finally{await fs.rm(temp,{recursive:true,force:true})}
