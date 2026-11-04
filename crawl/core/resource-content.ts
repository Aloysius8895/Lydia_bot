import type {Row} from '../../data/database/store.ts';
import type {FetchResult} from '../types.ts';
import {plain} from '../sources/ethglobal.ts';

export function resourceContent(task:Row,r:FetchResult){
  if(task.input.mode==='github_readme'){
    const json=JSON.parse(r.bytes.toString('utf8'));
    if(json.encoding!=='base64'||typeof json.content!=='string'||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(json.sha||''))throw new Error('Unknown GitHub README response');
    const content=Buffer.from(json.content.replace(/\s/g,''),'base64').toString('utf8');
    if(content.length>500000)throw new Error('README text exceeds 500000 character budget');
    return {status:'readme_checked',content,basis:{provider:'github_public_readme_api',blob_sha:json.sha,path:json.path,html_url:json.html_url,event_time_implementation:'unknown; current README blob only',code_executed:false}};
  }
  const html=r.bytes.toString('utf8');
  if(/youtube\.com|youtu\.be|vimeo\.com/.test(new URL(r.finalUrl).hostname))return {status:'video_page_checked_no_transcript',content:null,basis:{event_time_implementation:'unknown',transcript:'not_fetched',video_downloaded:false}};
  const content=plain(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html);
  return {status:content.length?'public_page_checked':'empty',content:content.slice(0,100000)||null,basis:{source:'public_page',truncated:content.length>100000,event_time_implementation:'unknown',forms_submitted:false}};
}
