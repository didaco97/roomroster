import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
mkdirSync('public/textures',{recursive:true});
for(const path of ['src/lib/ink/textures.generated.ts','src/lib/ink/textures-paper.generated.ts']){
 let count=0;
 const source=readFileSync(path,'utf8').replace(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g,(_,data)=>{const bytes=Buffer.from(data,'base64');const name=createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.png';writeFileSync('public/textures/'+name,bytes);count++;return '/textures/'+name});
 writeFileSync(path,source);console.log(path+': extracted '+count+' images from JS');
}
