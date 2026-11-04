import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Store, hash } from '../../data/database/store.ts';
import { assert } from '../shared/config.ts';
const scrypt=promisify(scryptCallback);
export class Auth {
  store:Store;secure:boolean; failures=new Map<string,{count:number;until:number}>();
  constructor(store:Store,secure:boolean){this.store=store;this.secure=secure;}
  async configured(){return !!await this.store.setting('owner');}
  async setup(password:string){assert(!await this.configured(),'ALREADY_CONFIGURED','账号已设置',409);assert(password.length>=12&&password.length<=128,'PASSWORD_LENGTH','密码长度需为 12–128 字符');
    const salt=randomBytes(24).toString('hex'),derived=await scrypt(password,salt,64) as Buffer;
    await this.store.db.query('INSERT INTO settings(key,data) VALUES($1,$2) ON CONFLICT DO NOTHING',['owner',{salt,hash:derived.toString('hex')}]);
  }
  async login(password:string,address:string){
    const attempt=this.failures.get(address);assert(!attempt||attempt.until<Date.now()||attempt.count<5,'LOGIN_RATE_LIMIT','登录尝试过多，请15分钟后重试',429);
    const owner=await this.store.setting('owner');assert(owner,'SETUP_REQUIRED','请先在电脑本机设置密码',409);
    const calculated=await scrypt(password,owner.salt,64) as Buffer,expected=Buffer.from(owner.hash,'hex');
    if(!timingSafeEqual(calculated,expected)){
      if(this.failures.size>1000)this.failures.clear();
      this.failures.set(address,{count:attempt&&attempt.until>Date.now()?attempt.count+1:1,until:Date.now()+900000});
      assert(false,'LOGIN_INVALID','密码不正确',401);
    }
    this.failures.delete(address);const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
    await this.store.db.query('DELETE FROM sessions WHERE expires_at<now()');
    await this.store.db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",[hash(token),csrf]);
    return {token,csrf};
  }
  token(req:IncomingMessage){return /(?:^|;\s*)crew_session=([\w-]+)/.exec(req.headers.cookie||'')?.[1];}
  async session(req:IncomingMessage){const token=this.token(req);if(!token)return null;return this.store.one('SELECT csrf FROM sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);}
  setCookie(res:ServerResponse,token:string,remove=false){res.setHeader('Set-Cookie',`crew_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remove?0:43200}${this.secure?'; Secure':''}`);}
  async logout(req:IncomingMessage,res:ServerResponse){const token=this.token(req);if(token)await this.store.db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]);this.setCookie(res,'',true);}
}
