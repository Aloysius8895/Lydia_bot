import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { businessRoot } from '../shared/config.ts';
function crc32(buf:Buffer){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type:string,data:Buffer){const t=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
function png(size:number){const rows=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){const offset=y*(size*4+1);for(let x=0;x<size;x++){const dx=(x-size/2)/size,dy=(y-size/2)/size,dist=Math.hypot(dx,dy);const ring=dist>.265&&dist<.325&&!(dx>0&&Math.abs(dy)<dx*.9);const dot=dist<.048;const color=ring||dot?[184,203,167,255]:[24,38,33,255];for(let i=0;i<4;i++)rows[offset+1+x*4+i]=color[i];}}const h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
const root=path.join(businessRoot,'frontend','public','icons');await mkdir(root,{recursive:true});for(const [name,size]of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]] as [string,number][])await writeFile(path.join(root,name),png(size));console.log('Generated three PWA icons.');
