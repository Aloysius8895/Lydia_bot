import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {assertPhonePortAvailable,existingPhoneService} from '../scripts/phone-launcher-check.ts';

test('phone launcher rejects an occupied exact-address port, then permits it after release',async()=>{
  const server=net.createServer();await new Promise<void>(resolve=>server.listen({host:'127.0.0.1',port:0,exclusive:true},resolve));
  const port=(server.address() as net.AddressInfo).port;
  try{await assert.rejects(assertPhonePortAvailable('127.0.0.1',port),new RegExp(`端口 ${port} 已被使用`));}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  await assertPhonePortAvailable('127.0.0.1',port);
});

test('an unrelated TCP service is not reused as Lydia',async()=>{
  const server=net.createServer(socket=>{socket.on('error',()=>{});socket.resume();socket.end('not Lydia');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as net.AddressInfo).port;
  try{assert.equal(await existingPhoneService('127.0.0.1',port,port),false);}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
