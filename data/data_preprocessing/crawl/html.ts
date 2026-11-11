import {parse,serializeOuter,type DefaultTreeAdapterMap} from 'parse5';
export type HtmlNode=DefaultTreeAdapterMap['node'];
export type HtmlElement=DefaultTreeAdapterMap['element'];
export function document(html:string){return parse(html,{sourceCodeLocationInfo:true});}
export function attr(node:HtmlNode,name:string){return 'attrs'in node?node.attrs.find(a=>a.name===name)?.value||'':'';}
export function tag(node:HtmlNode){return 'tagName'in node?node.tagName:'';}
export function children(node:HtmlNode):HtmlNode[]{return 'childNodes'in node?node.childNodes:[];}
export function parentOf(node:HtmlNode){return 'parentNode'in node?node.parentNode:null;}
export function find(node:HtmlNode,predicate:(n:HtmlNode)=>boolean):HtmlNode[]{const out:HtmlNode[]=[];const walk=(n:HtmlNode)=>{if(predicate(n))out.push(n);for(const c of children(n))walk(c);};walk(node);return out;}
export function text(node:HtmlNode):string{
 if('value'in node&&node.nodeName==='#text')return String(node.value);
 if(['script','style','noscript','nav','footer'].includes(tag(node)))return '';
 const t=children(node).map(text).join('');return /^(h[1-6]|p|div|li|tr|section|article|br)$/.test(tag(node))?'\n'+t+'\n':t;
}
export function cleanText(node:HtmlNode){return text(node).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();}
export function outer(node:HtmlNode){return 'tagName'in node?serializeOuter(node as HtmlElement):'';}
export function locator(node:HtmlNode){const loc=node.sourceCodeLocation;return loc?`HTML offsets ${loc.startOffset}:${loc.endOffset}`:tag(node);}
export function anchors(node:HtmlNode,base:string){return find(node,n=>tag(n)==='a'&&!!attr(n,'href')).flatMap(n=>{try{const u=new URL(attr(n,'href'),base);if(!['https:','http:'].includes(u.protocol))return [];return [{url:u.href,text:cleanText(n),node:n}];}catch{return [];}});}
export function sectionNodes(node:HtmlNode){
 const list=children(node),out:{heading:HtmlNode;nodes:HtmlNode[];text:string}[]=[];
 for(let i=0;i<list.length;i++)if(/^h[1-6]$/.test(tag(list[i]))){const level=Number(tag(list[i]).slice(1));let end=i+1;while(end<list.length&&!(/^h[1-6]$/.test(tag(list[end]))&&Number(tag(list[end]).slice(1))<=level))end++;const nodes=list.slice(i+1,end);out.push({heading:list[i],nodes,text:nodes.map(cleanText).join('\n')});}
 return out;
}
