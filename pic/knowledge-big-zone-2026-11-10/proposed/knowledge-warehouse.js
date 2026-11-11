// Isometric warehouse for the knowledge library.
// One SVG holds every shape and is painted strictly back-to-front, so shapes can
// never poke through each other. Pan/zoom only change one CSS transform on the
// camera layer (compositor work, no React render, no geometry rebuild).
import {pressToDrag,touchDragging} from './material-drag.js';

export const PALETTE=['#d4a463','#e9e3d3','#4f6cae','#9aa1aa','#b86a43','#8e9a62','#7fa596','#8a6f9e','#c9b48a','#5d6570','#f1f0ec','#a4533f'];
export const NEWS_ZONES={security:'安全',business_finance:'商业与融资',models:'模型',policy:'政策',products:'产品',infrastructure:'基础设施',research:'研究',unclassified:'未分类'};
const hash=s=>[...String(s)].reduce((h,c)=>(h*33+c.codePointAt(0))>>>0,5381);
export const titleColor=title=>PALETTE[hash(title)%PALETTE.length];
export const zoneKey=item=>item.kind==='news'?(item.category||'unclassified'):item.source_id;
export const zoneLabel=(key,kind)=>kind==='news'?(NEWS_ZONES[key]||key):String(key).toUpperCase();

function hsl(hex){
 const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
 let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=(mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4)*60;}return [h,s*100,l*100];
}
const shadeCache=new Map();
function shade(hex,dl){const k=hex+dl;if(!shadeCache.has(k)){const [h,s,l]=hsl(hex);shadeCache.set(k,`hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${Math.max(4,Math.min(97,l+dl)).toFixed(0)}%)`);}return shadeCache.get(k);}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const wide=ch=>/[　-鿿＀-￯]/.test(ch);
function clip(s,n){let w=0,o='';for(const ch of String(s)){w+=wide(ch)?2:1;if(w>n)return o+'…';o+=ch;}return o;}
const units=s=>[...String(s)].reduce((w,ch)=>w+(wide(ch)?2:1),0);

const S=40,C=Math.cos(Math.PI/6),SLOT=1.05,LANE=1,LGAP=.55,PER=6,PAD=.5,TOPPAD=.45,STRIP=1.05,AISLE=1.5,M=1.4,BH=.66,WALL=1.6,WT=.18;
const MIN=.5,MAX=4;

// A zone with more than BIG items would make its grid row far deeper than its
// neighbours. Such a zone gets its own full-width band at the back of the floor,
// with long lanes, so the ordinary zones keep a compact grid in front of it.
const BIG=PER*3,ZW=PAD*2+PER*SLOT,FULL=ZW*3+AISLE*2,BAND_GAP=AISLE*1.6;
const zoneDepth=lanes=>TOPPAD+lanes*(LANE+LGAP)-LGAP+STRIP;

export function layout(items,kind){
 const groups=new Map();for(const it of items){const k=zoneKey(it);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(it);}
 const all=[...groups].sort((a,b)=>b[1].length-a[1].length||String(a[0]).localeCompare(String(b[0]))).map(([id,list])=>({id,label:zoneLabel(id,kind),list}));
 const bands=all.filter(z=>z.list.length>BIG),grid=all.filter(z=>!bands.includes(z));
 const longPer=Math.floor((FULL-PAD*2)/SLOT);
 let y=0;
 for(const z of bands){
  Object.assign(z,{band:true,per:longPer,lanes:Math.ceil(z.list.length/longPer),w:FULL,x:0,y});
  z.d=zoneDepth(z.lanes);y+=z.d+BAND_GAP;
 }
 for(const z of grid){z.per=PER;z.lanes=Math.max(2,Math.ceil(z.list.length/PER));z.w=ZW;z.d=zoneDepth(z.lanes);}
 const cols=Math.min(3,Math.max(1,grid.length)),colW=Array(cols).fill(0),rowD=[];
 grid.forEach((z,i)=>{colW[i%cols]=Math.max(colW[i%cols],z.w);const r=Math.floor(i/cols);rowD[r]=Math.max(rowD[r]||0,z.d);});
 grid.forEach((z,i)=>{const c=i%cols,r=Math.floor(i/cols);z.x=colW.slice(0,c).reduce((a,b)=>a+b+AISLE,0);z.y=y+rowD.slice(0,r).reduce((a,b)=>a+b+AISLE,0);});
 const zones=[...bands,...grid],placed=[],colors=new Map();
 for(const z of zones){
  let prev=-1;
  z.items=z.list.map((it,k)=>{
   let ci=hash(it.title)%PALETTE.length;if(ci===prev)ci=(ci+5)%PALETTE.length;prev=ci;colors.set(it.id,PALETTE[ci]);
   const p={id:it.id,title:it.title,kind:it.kind||kind,source:zoneLabel(z.id,kind),zone:z,x:z.x+PAD+(k%z.per)*SLOT,y:z.y+TOPPAD+Math.floor(k/z.per)*(LANE+LGAP),color:PALETTE[ci],data:it};
   placed.push(p);return p;
  });
  z.slots=z.lanes*z.per;
 }
 const gridW=colW.reduce((a,b)=>a+b,0)+AISLE*(cols-1),gridD=grid.length?rowD.reduce((a,b)=>a+b,0)+AISLE*Math.max(0,rowD.length-1):-BAND_GAP;
 const W=bands.length?Math.max(FULL,gridW):gridW,D=y+gridD;
 return {zones,items:placed,W,D,colors};
}

export default class Warehouse {
 constructor({viewport,cam,world,labels,hits,zoomLabel},callbacks){
  Object.assign(this,{viewport,camEl:cam,world,labels,hits,zoomLabel,cb:callbacks});
  this.T=0;this.cam={x:0,y:0,k:1};this.kFit=1;this.L=layout([],'hackathon');this.kind='hackathon';this.sig='';
  this.selected=null;this.tray=[];this.hover=null;this.hoverZone=null;this.focusZone=null;this.userMoved=false;
  this.ptrs=new Map();this.gesture=null;this.suppress=false;this.anim=0;this.inertia=0;this.raf=0;this.size={w:0,h:0};
  this.bind();
 }
 /* ---------- projection ---------- */
 P(x,y,z=0){const ix=(x-y)*C*S,iy=(x+y)*.5*S-z*S*.82,tx=x*S*.94,ty=y*S*.94,T=this.T;return [ix+(tx-ix)*T,iy+(ty-iy)*T];}
 pts(a){return a.map(p=>this.P(...p).map(v=>v.toFixed(1)).join(',')).join(' ');}
 quad(x,y,w,d,z=0){return this.pts([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]]);}
 basis(){const o=this.P(0,0),ex=this.P(1,0),ey=this.P(0,1);return [(ex[0]-o[0])/S,(ex[1]-o[1])/S,(ey[0]-o[0])/S,(ey[1]-o[1])/S];}
 floorText(x,y,cls,size,text,anchor){const [a,b,c,d]=this.basis(),[e,f]=this.P(x,y);return `<text class="${cls}" font-size="${size}"${anchor?` text-anchor="${anchor}"`:''} transform="matrix(${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)} ${d.toFixed(4)} ${e.toFixed(1)} ${f.toFixed(1)})">${esc(text)}</text>`;}
 toScreen(x,y,z=0){const [px,py]=this.P(x,y,z);return [this.cam.x+px*this.cam.k,this.cam.y+py*this.cam.k];}

 /* ---------- data ---------- */
 setData(items,kind){
  const sig=kind+'|'+items.map(i=>i.id+':'+i.title+':'+zoneKey(i)).join('|');
  if(sig===this.sig)return;
  const floorChanged=kind!==this.kind||!this.sig;this.sig=sig;this.kind=kind;this.L=layout(items,kind);
  if(this.focusZone)this.focusZone=this.L.zones.find(z=>z.id===this.focusZone.id)||null;
  this.cb.onColors?.(this.L.colors);this.buildHits();this.render();
  if(floorChanged||!this.userMoved){this.userMoved=false;this.focusZone?this.focus(this.focusZone.id,0):this.overview(0);}
 }
 setSelected(id){if(this.selected===id)return;this.selected=id;for(const b of this.hits.children)b.setAttribute('aria-pressed',String(b.dataset.id===id));this.render();}
 setTray(ids){const next=ids.join(',');if(next===this.tray.join(','))return;this.tray=ids;this.applyCam();}
 itemById(id){return this.L.items.find(i=>i.id===id);}

 /* ---------- painting ---------- */
 solids(it){
  const out=[];
  if(it.kind==='news'){const w=.78,d=.62,h=.1;for(let i=0;i<4;i++){const o=((hash(it.title+i)%5)-2)*.025;out.push({x:it.x+.12+o,y:it.y+.06-o,w,d,h,z:i*h,dl:i%2?-5:3,spine:false});}}
  else{const bw=.22,g=.035,d=.58;for(let i=0;i<3;i++)out.push({x:it.x+.1+i*(bw+g),y:it.y+.08,w:bw,d,h:BH-(hash(it.title+i)%3)*.05,z:0,dl:(i-1)*4,spine:true});}
  return out;
 }
 solid(b,base){
  const {x,y,w,d,h,z}=b,t=z+h;
  let s=`<polygon fill="${shade(base,b.dl-22)}" points="${this.pts([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,t],[x+w,y,t]])}"/>`
   +`<polygon fill="${shade(base,b.dl-10)}" points="${this.pts([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,t],[x,y+d,t]])}"/>`
   +`<polygon fill="${shade(base,b.dl+8)}" points="${this.quad(x,y,w,d,t)}"/>`;
  if(b.spine)s+=`<polygon class="ks-spine" fill="${shade(base,b.dl+26)}" points="${this.pts([[x+w*.2,y+d,z+h*.55],[x+w*.8,y+d,z+h*.55],[x+w*.8,y+d,z+h*.78],[x+w*.2,y+d,z+h*.78]])}"/>`;
  else s+=`<polyline fill="none" stroke="${shade(base,b.dl-16)}" stroke-width=".8" points="${this.pts([[x+w*.12,y+d*.3,t],[x+w*.7,y+d*.3,t]])}"/>`;
  return s;
 }
 render(){
  const {zones,items,W,D}=this.L,o=[];
  if(!zones.length){this.world.innerHTML='';this.applyCam();return;}
  const x0=-M,y0=-M,x1=W+M,y1=D+M;
  o.push(`<polygon class="ks-wall-face" points="${this.pts([[x0,y0+WT,0],[x1,y0+WT,0],[x1,y0+WT,WALL],[x0,y0+WT,WALL]])}"/>`,`<polygon class="ks-wall-top" points="${this.quad(x0,y0,x1-x0,WT,WALL)}"/>`);
  o.push(`<polygon class="ks-wall-face ks-wall-side" points="${this.pts([[x0+WT,y0,0],[x0+WT,y1,0],[x0+WT,y1,WALL],[x0+WT,y0,WALL]])}"/>`,`<polygon class="ks-wall-top" points="${this.quad(x0,y0,WT,y1-y0,WALL)}"/>`);
  o.push(`<polygon class="ks-wall-stripe" points="${this.pts([[x0+WT,y0+WT,.05],[x1,y0+WT,.05],[x1,y0+WT,.12],[x0+WT,y0+WT,.12]])}"/>`);
  o.push(`<polygon class="ks-plate" points="${this.quad(x0,y0,x1-x0,y1-y0)}"/>`);
  const g=[],line=(a,b)=>g.push(`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
  for(let x=Math.ceil(x0+WT);x<=x1;x++)line(this.P(x,y0+WT),this.P(x,y1));
  for(let y=Math.ceil(y0+WT);y<=y1;y++)line(this.P(x0+WT,y),this.P(x1,y));
  o.push(`<path class="ks-grid" d="${g.join('')}"/>`);
  // Column aisles start below the full-width bands; each row aisle sits midway in its gap.
  const grid=zones.filter(z=>!z.band),bandEnd=zones.filter(z=>z.band).reduce((e,z)=>Math.max(e,z.y+z.d),-Infinity);
  const ax=[],xs=[...new Set(grid.map(z=>z.x))].sort((a,b)=>a-b),ys=[...new Set(zones.map(z=>z.y))].sort((a,b)=>a-b);
  const top=Number.isFinite(bandEnd)?Math.max(y0+.6,grid.length?Math.min(...grid.map(z=>z.y))-.3:y1):y0+.6;
  xs.slice(1).forEach(cx=>{const a=this.P(cx-AISLE/2,top),b=this.P(cx-AISLE/2,y1-.4);ax.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`);});
  ys.slice(1).forEach(ry=>{const prev=Math.max(...zones.filter(z=>z.y<ry).map(z=>z.y+z.d)),my=(prev+ry)/2,a=this.P(x0+.6,my),b=this.P(x1-.4,my);ax.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`);});
  o.push(`<path class="ks-aisle" d="${ax.join('')}"/>`);
  const sel=this.itemById(this.selected),lit=this.focusZone||sel?.zone;
  for(const z of zones){
   const on=lit===z;
   o.push(`<g class="ks-zone-g${on?' is-on':''}" data-zone="${esc(z.id)}"><polygon class="ks-zone${on?' is-on':this.hoverZone===z?' is-hover':''}" points="${this.quad(z.x,z.y,z.w,z.d)}"/>`);
   for(let l=0;l<z.lanes;l++)o.push(`<polygon class="ks-lane" points="${this.quad(z.x+PAD*.5,z.y+TOPPAD+l*(LANE+LGAP)-.1,z.w-PAD,LANE+.05)}"/>`);
   for(let k=z.items.length;k<z.slots;k++)o.push(`<polygon class="ks-bay" points="${this.quad(z.x+PAD+(k%z.per)*SLOT+.06,z.y+TOPPAD+Math.floor(k/z.per)*(LANE+LGAP)+.02,SLOT-.16,.72)}"/>`);
   const fy=z.y+z.d-.32,size=Math.min(this.kind==='news'?22:19,(z.w-PAD*2-2.4)*S/Math.max(1,units(z.label))/.66);
   o.push(this.floorText(z.x+PAD,fy,'ks-zname',size.toFixed(1),z.label),this.floorText(z.x+z.w-PAD,fy,'ks-zcount',13,`${z.items.length} ${this.kind==='news'?'条新闻':'个项目'}`,'end'),'</g>');
  }
  for(const it of items){
   o.push(`<polygon class="ks-shadow" points="${this.quad(it.x+.12,it.y+.12,.9,.68)}"/>`);
   if(it===sel)o.push(`<polygon class="ks-glow" points="${this.quad(it.x-.02,it.y-.04,SLOT-.04,.86)}"/>`);
  }
  const all=[];items.forEach(it=>this.solids(it).forEach(b=>all.push({b,it})));
  all.sort((p,q)=>(p.b.x+p.b.w/2+p.b.y+p.b.d/2+p.b.z*.01)-(q.b.x+q.b.w/2+q.b.y+q.b.d/2+q.b.z*.01));
  for(const {b,it} of all)o.push(`<g class="ks-item${it===sel?' is-selected':''}${it===this.hover?' is-hover':''}${it.id===this.lifted?' is-lifted':''}" data-item="${esc(it.id)}"><g>${this.solid(b,it.color)}</g></g>`);
  this.world.innerHTML=o.join('');
  this.applyCam();
 }
 /* Transparent HTML buttons over each item: keyboard focus, native drag to the tray, screen-reader names. */
 buildHits(){
  const frag=document.createDocumentFragment();
  for(const it of [...this.L.items].sort((a,b)=>(a.x+a.y)-(b.x+b.y))){
   const b=document.createElement('button');b.type='button';b.className='knowledge-object';b.draggable=true;b.dataset.id=it.id;
   b.setAttribute('aria-label','查看项目 '+it.title);b.setAttribute('aria-pressed',String(it.id===this.selected));b.title=it.title+' · 双击加入分析';
   frag.appendChild(b);
  }
  this.hits.replaceChildren(frag);
 }
 applyCam(){
  const {cam}=this;
  this.camEl.style.transform=`translate3d(${cam.x.toFixed(2)}px,${cam.y.toFixed(2)}px,0) scale(${cam.k.toFixed(4)})`;
  if(this.zoomLabel)this.zoomLabel.textContent=Math.round(cam.k/this.kFit*100)+'%';
  for(const b of this.hits.children){
   const it=this.itemById(b.dataset.id);if(!it)continue;
   const a=this.toScreen(it.x+.05,it.y+.75,0),c=this.toScreen(it.x+.95,it.y,BH),d=this.toScreen(it.x+.05,it.y,BH),e=this.toScreen(it.x+.95,it.y+.75,0);
   const l=Math.min(a[0],d[0]),t=Math.min(c[1],d[1]),r=Math.max(c[0],e[0]),btm=Math.max(a[1],e[1]);
   b.style.transform=`translate(${l.toFixed(1)}px,${t.toFixed(1)}px)`;b.style.width=(r-l).toFixed(1)+'px';b.style.height=(btm-t).toFixed(1)+'px';
  }
  this.paintLabels();
 }
 paintLabels(){
  const {cam}=this,sel=this.itemById(this.selected),hov=this.hover,placed=[],trayIds=this.tray;let h='';
  const hit=r=>placed.some(p=>r.x<p.x+p.w&&r.x+r.w>p.x&&r.y<p.y+p.h&&r.y+r.h>p.y);
  const tag=(it,cls)=>{const [sx,sy]=this.toScreen(it.x+.45,it.y+.35,BH+.1),ti=trayIds.indexOf(it.id),txt=clip(it.title,34),w=Math.min(280,units(txt)*7.2+96);placed.push({x:sx-w/2,y:sy-46,w,h:40});
   return `<div class="ks-tag ${cls}" style="transform:translate(${sx.toFixed(1)}px,${(sy-6).toFixed(1)}px)"><span>${ti>=0?`<em>${ti+1}</em>`:`<i style="background:${it.color}"></i>`}${esc(txt)}<small>${esc(it.source)}</small></span><b></b></div>`;};
  if(sel)h+=tag(sel,'');
  if(hov&&hov!==sel)h+=tag(hov,'is-hover');
  trayIds.forEach((id,i)=>{const it=this.itemById(id);if(!it||it===sel||it===hov)return;const [sx,sy]=this.toScreen(it.x+.9,it.y+.1,BH+.3);placed.push({x:sx-11,y:sy-11,w:22,h:22});h+=`<div class="ks-badge" style="transform:translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)">${i+1}</div>`;});
  const alpha=Math.max(0,Math.min(1,(cam.k*S-52)/18));
  if(alpha>0){
   const {w:W,h:H}=this.size;
   for(const it of this.L.items){
    if(it===sel||it===hov)continue;const [sx,sy]=this.toScreen(it.x+.48,it.y+.8,0);if(sx<-80||sy<-20||sx>W+80||sy>H+20)continue;
    const txt=clip(it.title,it.kind==='news'?20:18),w=units(txt)*5.9+12,box={x:sx-w/2,y:sy+2,w,h:19};if(hit(box))continue;placed.push(box);
    h+=`<div class="ks-name" style="transform:translate(${sx.toFixed(1)}px,${(sy+2).toFixed(1)}px);opacity:${alpha.toFixed(2)}">${esc(txt)}</div>`;
   }
  }
  this.labels.innerHTML=h;
 }

 /* ---------- camera ---------- */
 bounds(list){let a=[1e9,1e9,-1e9,-1e9];for(const [x,y,z] of list){const [px,py]=this.P(x,y,z);a=[Math.min(a[0],px),Math.min(a[1],py),Math.max(a[2],px),Math.max(a[3],py)];}return a;}
 corners(x,y,w,d,h=0){return [[x,y,0],[x+w,y,0],[x+w,y+d,0],[x,y+d,0],[x,y,h],[x+w,y,h],[x,y+d,h]];}
 fit(b,pad=24,top=46,bottom=62){const {w,h}=this.size,aw=Math.max(40,w-pad*2),ah=Math.max(40,h-top-bottom),k=Math.min(aw/(b[2]-b[0]),ah/(b[3]-b[1]));return {k,x:pad+(aw-(b[2]-b[0])*k)/2-b[0]*k,y:top+(ah-(b[3]-b[1])*k)/2-b[1]*k};}
 fly(t,ms=520){
  cancelAnimationFrame(this.anim);cancelAnimationFrame(this.inertia);
  if(!ms||matchMedia('(prefers-reduced-motion: reduce)').matches){Object.assign(this.cam,t);this.applyCam();return;}
  const s={...this.cam},t0=performance.now();this.camEl.classList.add('is-moving');
  const step=now=>{const p=Math.min(1,(now-t0)/ms),e=1-Math.pow(1-p,3);this.cam.x=s.x+(t.x-s.x)*e;this.cam.y=s.y+(t.y-s.y)*e;this.cam.k=s.k+(t.k-s.k)*e;this.applyCam();
   if(p<1)this.anim=requestAnimationFrame(step);else this.camEl.classList.remove('is-moving');};
  this.anim=requestAnimationFrame(step);
 }
 overview(ms=560){
  if(this.focusZone){this.focusZone=null;this.cb.onFocus?.(null);this.render();}
  if(!this.L.zones.length)return;const f=this.fit(this.bounds(this.corners(-M,-M,this.L.W+2*M,this.L.D+2*M,WALL)));this.kFit=f.k;this.userMoved=false;this.fly(f,ms);
 }
 focus(id,ms=560){
  const z=this.L.zones.find(z=>z.id===id);if(!z)return;
  if(this.focusZone!==z){this.focusZone=z;this.cb.onFocus?.(z.id);this.render();}
  if(!this.kFit||!isFinite(this.kFit))this.kFit=this.fit(this.bounds(this.corners(-M,-M,this.L.W+2*M,this.L.D+2*M,WALL))).k;
  const f=this.fit(this.bounds(this.corners(z.x-.2,z.y-.2,z.w+.4,z.d+.4,BH)),20,44,58);
  if(f.k>this.kFit*MAX){const {w,h}=this.size,k=this.kFit*MAX,c=[(w)/2,(h+44-58)/2],b=this.bounds(this.corners(z.x,z.y,z.w,z.d)),m=[(b[0]+b[2])/2,(b[1]+b[3])/2];Object.assign(f,{k,x:c[0]-m[0]*k,y:c[1]-m[1]*k});}
  this.userMoved=true;this.fly(f,ms);
 }
 zoomAt(px,py,k){k=Math.max(this.kFit*MIN,Math.min(this.kFit*MAX,k));const c=this.cam;c.x=px-(px-c.x)*k/c.k;c.y=py-(py-c.y)*k/c.k;c.k=k;this.userMoved=true;this.applyCam();}
 zoomBy(f){const {w,h}=this.size,k=Math.max(this.kFit*MIN,Math.min(this.kFit*MAX,this.cam.k*f));this.userMoved=true;this.fly({k,x:w/2-(w/2-this.cam.x)*k/this.cam.k,y:h/2-(h/2-this.cam.y)*k/this.cam.k},240);}
 /* Morph between isometric and top-down; the floor point under the centre stays put. */
 setView(view,ms=460){
  const target=view==='top'?1:0;if(target===this.T)return;
  const {w,h}=this.size,cx=w/2,cy=h/2,[a,b,c,d]=this.basis().map(v=>v*S),det=a*d-b*c,px=(cx-this.cam.x)/this.cam.k,py=(cy-this.cam.y)/this.cam.k;
  const ux=(d*px-c*py)/det,uy=(-b*px+a*py)/det,T0=this.T,t0=performance.now();
  if(!this.sig||matchMedia('(prefers-reduced-motion: reduce)').matches)ms=0;
  const step=now=>{const p=ms?Math.min(1,(now-t0)/ms):1,e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;this.T=T0+(target-T0)*e;this.render();const [qx,qy]=this.P(ux,uy);this.cam.x=cx-qx*this.cam.k;this.cam.y=cy-qy*this.cam.k;this.applyCam();
   if(p<1)this.raf=requestAnimationFrame(step);else if(!this.userMoved)this.focusZone?this.focus(this.focusZone.id,300):this.overview(300);};
  cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(step);
 }
 resize(w,h){
  const old=this.size;this.size={w,h};if(!old.w){this.focusZone?this.focus(this.focusZone.id,0):this.overview(0);return;}
  if(!this.userMoved){this.focusZone?this.focus(this.focusZone.id,0):this.overview(0);return;}
  this.cam.x+=(w-old.w)/2;this.cam.y+=(h-old.h)/2;this.applyCam();
 }

 /* ---------- input ---------- */
 pos(e){const r=this.viewport.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 bind(){
  const v=this.viewport,on=(t,f,o)=>{v.addEventListener(t,f,o);(this.off||=[]).push(()=>v.removeEventListener(t,f,o));};
  on('pointerdown',e=>this.down(e));on('pointermove',e=>this.move(e));on('pointerup',e=>this.up(e));on('pointercancel',e=>this.up(e,true));
  on('lostpointercapture',e=>{if(!v.hasPointerCapture(e.pointerId))this.up(e,true);});
  on('wheel',e=>{e.preventDefault();cancelAnimationFrame(this.anim);const p=this.pos(e);this.zoomAt(p.x,p.y,this.cam.k*Math.exp(-e.deltaY*.0016));},{passive:false});
  on('pointerleave',()=>{if(!this.ptrs.size&&(this.hover||this.hoverZone)){this.hover=this.hoverZone=null;this.render();}});
  const guard=e=>{if(this.suppress&&e.detail!==0){e.preventDefault();e.stopPropagation();}};on('click',guard,true);on('dblclick',guard,true);
  // Native drag is for mouse/pen only; touch uses the long-press lift (pressToDrag).
  on('dragstart',e=>{if(this.lastPointer==='touch'||touchDragging()||this.ptrs.size>1||this.gesture?.moved){e.preventDefault();return;}const it=this.itemById(e.target.dataset?.id);if(it)this.cb.onDragStart?.(e,it.data,it.color);});
  on('click',e=>{const b=e.target.closest?.('.knowledge-object');if(b)this.cb.onSelect?.(b.dataset.id);});
  on('dblclick',e=>{const b=e.target.closest?.('.knowledge-object');if(b){const it=this.itemById(b.dataset.id);if(it)this.cb.onAdd?.(it.data);}});
  on('focusin',e=>{const it=this.itemById(e.target.dataset?.id);if(it&&e.target.matches(':focus-visible')){this.hover=it;this.render();}});
  on('focusout',()=>{if(this.hover){this.hover=null;this.render();}});
 }
 down(e){
  if(e.button!==0||this.lifted)return;const onItem=e.target.closest?.('.knowledge-object');this.lastPointer=e.pointerType;
  if(e.pointerType!=='touch'&&onItem){this.suppress=false;return;}   // mouse on an item: native click / drag to tray
  cancelAnimationFrame(this.anim);cancelAnimationFrame(this.inertia);
  if(!this.ptrs.size)this.suppress=false;
  const p=this.pos(e);this.ptrs.set(e.pointerId,p);this.camEl.classList.add('is-moving');
  if(this.ptrs.size===1){
   this.gesture={kind:'pan',start:p,cam:{...this.cam},moved:false,last:performance.now(),vel:{x:0,y:0},n:0};
   // Touch on a book: hold still to lift it and carry it to the tray; move first to pan as usual.
   const it=onItem&&e.pointerType==='touch'?this.itemById(onItem.dataset.id):null;
   if(it)this.press=pressToDrag(e,it.data,{color:it.color,source:onItem,onLift:()=>this.lift(it,e.pointerId),onEnd:()=>this.land()});
  }else{this.press?.();this.beginPinch();}
  if(!onItem||this.ptrs.size>1)for(const id of this.ptrs.keys()){try{this.viewport.setPointerCapture(id);}catch{}}
 }
 beginPinch(){const [a,b]=[...this.ptrs.values()];this.gesture={kind:'pinch',d:Math.max(8,Math.hypot(a.x-b.x,a.y-b.y)),k:this.cam.k,m:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},moved:true};this.suppress=true;}
 move(e){
  if(!this.ptrs.size){
   if(e.pointerType==='touch')return;
   const b=e.target.closest?.('.knowledge-object'),zg=e.target.closest?.('[data-zone]');
   const hi=b?this.itemById(b.dataset.id):null,hz=zg?this.L.zones.find(z=>z.id===zg.dataset.zone):null;
   if(hi!==this.hover||hz!==this.hoverZone){this.hover=hi;this.hoverZone=hz;cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(()=>this.render());}
   return;
  }
  if(!this.ptrs.has(e.pointerId))return;
  const p=this.pos(e),prev=this.ptrs.get(e.pointerId);this.ptrs.set(e.pointerId,p);const g=this.gesture;if(!g)return;
  if(g.kind==='pinch'&&this.ptrs.size>=2){
   const [a,b]=[...this.ptrs.values()],m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};this.cam.x+=m.x-g.m.x;this.cam.y+=m.y-g.m.y;g.m=m;
   this.zoomAt(m.x,m.y,g.k*Math.hypot(a.x-b.x,a.y-b.y)/g.d);e.preventDefault();
  }else if(g.kind==='pan'){
   const dx=p.x-g.start.x,dy=p.y-g.start.y;if(Math.hypot(dx,dy)>6){if(!g.moved)this.press?.();g.moved=true;this.suppress=true;}
   if(g.moved){const now=performance.now(),dt=Math.max(1,now-g.last);g.vel={x:(p.x-prev.x)/dt*.6+g.vel.x*.4,y:(p.y-prev.y)/dt*.6+g.vel.y*.4};g.last=now;g.n++;this.cam.x=g.cam.x+dx;this.cam.y=g.cam.y+dy;this.userMoved=true;this.applyCam();this.viewport.classList.add('is-dragging');e.preventDefault();}
  }
 }
 up(e,cancelled=false){
  if(!this.ptrs.delete(e.pointerId))return;this.viewport.classList.remove('is-dragging');
  if(this.ptrs.size>=2){this.beginPinch();return;}
  if(this.ptrs.size===1){const p=[...this.ptrs.values()][0];this.gesture={kind:'pan',start:p,cam:{...this.cam},moved:true,last:performance.now(),vel:{x:0,y:0},n:0};return;}
  const g=this.gesture;this.gesture=null;
  if(g&&!g.moved&&!cancelled&&g.kind==='pan'&&!e.target.closest?.('.knowledge-object')){
   const el=document.elementFromPoint(e.clientX,e.clientY),zg=el?.closest?.('[data-zone]');
   if(zg&&this.viewport.contains(zg))this.focus(zg.dataset.zone);
  }
  // Glide only after a real flick (several samples), never after a single jump.
  if(g?.kind==='pan'&&g.moved&&!cancelled&&g.n>=3&&performance.now()-g.last<60&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const v={...g.vel};const step=()=>{v.x*=.93;v.y*=.93;this.cam.x+=v.x*16;this.cam.y+=v.y*16;this.applyCam();if(Math.hypot(v.x,v.y)>.02)this.inertia=requestAnimationFrame(step);else this.camEl.classList.remove('is-moving');};
   this.inertia=requestAnimationFrame(step);return;
  }
  this.camEl.classList.remove('is-moving');
 }
 /* The long press won: stop panning, leave a dimmed gap where the book was. */
 lift(it,pointerId){
  this.ptrs.delete(pointerId);this.gesture=null;this.suppress=true;cancelAnimationFrame(this.inertia);
  this.camEl.classList.remove('is-moving');this.viewport.classList.remove('is-dragging');
  this.lifted=it.id;this.render();
 }
 land(){this.press=null;if(this.lifted){this.lifted=null;this.render();}}
 resetGesture(){this.ptrs.clear();this.gesture=null;}
 destroy(){cancelAnimationFrame(this.anim);cancelAnimationFrame(this.inertia);cancelAnimationFrame(this.raf);(this.off||[]).forEach(f=>f());}
}
