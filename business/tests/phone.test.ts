import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfLANConnection } from '../backend/phone.ts';

test('HTTPS owner setup permits the computer itself, excluding another LAN device and proxy claims',()=>{
  assert.equal(selfLANConnection(true,'192.168.100.4','192.168.100.4','192.168.100.4'),true);
  assert.equal(selfLANConnection(true,'::ffff:192.168.100.4','192.168.100.4','192.168.100.4'),true);
  assert.equal(selfLANConnection(true,'192.168.100.5','192.168.100.4','192.168.100.4'),false);
  assert.equal(selfLANConnection(false,'192.168.100.4','192.168.100.4','192.168.100.4'),false);
  assert.equal(selfLANConnection(true,'192.168.100.4','192.168.100.4','other.example'),false);
  assert.equal(selfLANConnection(true,undefined,undefined,'192.168.100.4'),false);
});
