import {TwitterBrowser} from '../fetch/twitter.ts';
import {crawlStorageRoot} from '../../data/crawl/snapshots.ts';

// Run only on the user's desktop. Credentials are entered by the user in X itself.
const session=new TwitterBrowser(crawlStorageRoot);let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;await session.close();};
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try{
 await session.login();console.log('X_LOGIN_WINDOW_OPEN: Log in manually in the dedicated browser. No API key is needed.');
 const deadline=Date.now()+10*60000;
 while(!stopping&&session.context&&Date.now()<deadline){
  const context=session.context,cookies=await context.cookies('https://x.com').catch(()=>[]);
  const page=context.pages()[0];
  const loggedIn=cookies.some(c=>c.name==='auth_token'&&!!c.value)&&!!page&&!/\/i\/flow\/login/.test(page.url());
  if(loggedIn){console.log('X_LOGIN_SAVED: Dedicated browser profile is ready for a read-only collection check.');await stop();break;}
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 if(!stopping){console.log('X_LOGIN_NOT_CONFIRMED: Close and reopen the login window to try again.');await stop();}
}catch(e){console.log('X_LOGIN_ERROR: '+((e as any).code||'LOGIN_WINDOW_FAILED'));await stop().catch(()=>{});process.exitCode=1;}
