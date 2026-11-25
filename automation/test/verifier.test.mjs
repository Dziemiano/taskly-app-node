import test from 'node:test';
import assert from 'node:assert/strict';
import { dockerArguments, dockerVerify } from '../verifier.mjs';

test('container boundary has no provider secrets, socket or network during tests',()=>{
 const args=dockerArguments('/tmp/candidate','test-container','test');
 for(const required of ['--network=none','--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--memory=3g','--pids-limit=256'])assert.ok(args.includes(required));
 assert.ok(args.includes('type=bind,src=/tmp/candidate,dst=/work'));
 assert.equal(args.some(x=>/OPENAI|GITHUB_TOKEN|docker.sock|--privileged|--network=host/.test(x)),false);
 assert.equal(dockerArguments('/tmp/candidate','install-container','install').includes('--network=none'),false);
});

test('successful install and test phases both remove containers and sanitize runner env',async()=>{
 const calls=[];const result=await dockerVerify('/tmp/candidate',{runner:async(file,args,options)=>{calls.push({file,args,options});return {code:0,stdout:'ok',stderr:''};}});
 assert.equal(result.ok,true);assert.deepEqual(result.steps.map(x=>x.phase),['install','test']);assert.equal(calls.length,4);
 assert.deepEqual(calls.map(x=>x.args[0]),['run','rm','run','rm']);
 for(const call of calls)assert.deepEqual(Object.keys(call.options.env).sort(),['HOME','PATH']);
 assert.equal(calls[0].args[3],calls[1].args[2]);assert.equal(calls[2].args[3],calls[3].args[2]);
});

test('install failure and timeout stop execution and still clean up',async()=>{
 for(const throws of [false,true]){
  const calls=[];const result=await dockerVerify('/tmp/candidate',{runner:async(file,args)=>{calls.push(args);if(args[0]==='rm')return {code:0,stdout:'',stderr:''};if(throws)throw new Error('Command timed out');return {code:1,stdout:'',stderr:'install failed'};}});
  assert.equal(result.ok,false);assert.equal(calls.length,2);assert.equal(calls[1][0],'rm');assert.equal(result.steps[0].phase,'install');
 }
});
