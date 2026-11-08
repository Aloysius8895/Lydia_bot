import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfLANConnection,phoneInfo } from '../backend/phone.ts';

test('Tailscale phone instructions retain the private HTTPS origin without local CA setup',async()=>{
  const origin='https://lydia.tail123.ts.net:4318';
  const info=await phoneInfo(origin,true);
  assert.equal(info.enabled,true);assert.equal(info.mode,'tailscale');
  assert.equal(info.suggestedOrigin,origin);assert.equal(info.certificate,null);assert.equal(info.bootstrapURL,null);
  assert.equal((await phoneInfo(origin,false)).mode,'lan');
  assert.equal((await phoneInfo('https://lydia.ts.net.evil.com:4318',true)).mode,'lan');
});

test('HTTPS owner setup permits the computer itself, excluding another LAN device and proxy claims',()=>{
  assert.equal(selfLANConnection(true,'192.168.100.4','192.168.100.4','192.168.100.4'),true);
  assert.equal(selfLANConnection(true,'::ffff:192.168.100.4','192.168.100.4','192.168.100.4'),true);
  assert.equal(selfLANConnection(true,'192.168.100.5','192.168.100.4','192.168.100.4'),false);
  assert.equal(selfLANConnection(false,'192.168.100.4','192.168.100.4','192.168.100.4'),false);
  assert.equal(selfLANConnection(true,'192.168.100.4','192.168.100.4','other.example'),false);
  assert.equal(selfLANConnection(true,undefined,undefined,'192.168.100.4'),false);
});
