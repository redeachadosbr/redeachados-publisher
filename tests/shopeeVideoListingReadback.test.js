import test from 'node:test';
import assert from 'node:assert/strict';
import {videoPublishedAfterPlan,verifyShopeeExecution,shopeeExecutionUnconfirmedFields} from '../shopeeExecutionPlan.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const itemId='58272083884';
const video={sha256:'approved-sha',id:'task-that-shopee-rejected',phase:'ready'};
const plan={itemId,video:{sha256:'approved-sha'},original:{video_info:[]},proposed:{}};
const published={item_id:itemId,video_info:[{video_url:'https://cvf.shopee.com.br/file/video-new',duration:10}]};

test('live listing readback recognizes new video despite a rejected upload task',()=>{
 assert.equal(videoPublishedAfterPlan(plan,published,video),true);
 assert.equal(verifyShopeeExecution(plan,published,{video}),true);
 assert.deepEqual(shopeeExecutionUnconfirmedFields(plan,published,{video}),[]);
});
test('matching old video does not prove a new upload',()=>{
 const old={video_url:'https://cvf.shopee.com.br/file/video-old'};
 const baseline={...plan,original:{video_info:[old]}};
 assert.equal(videoPublishedAfterPlan(baseline,{...published,video_info:[old]},video),false);
});
test('new video must belong to the exact approved Shopee Item ID',()=>{
 assert.equal(videoPublishedAfterPlan(plan,{...published,item_id:'12345'},video),false);
});
test('placeholder, rejected and processing videos are not published',()=>{
 assert.equal(videoPublishedAfterPlan(plan,{...published,video_info:[{}]},video),false);
 assert.equal(videoPublishedAfterPlan(plan,{...published,video_info:[{video_url:published.video_info[0].video_url,status:'FAILED'}]},video),false);
 assert.equal(videoPublishedAfterPlan(plan,{...published,video_info:[{video_url:published.video_info[0].video_url,status:'TRANSCODING'}]},video),false);
});
test('historical failed job shows confirmed video on verified official readback',()=>{
 const progress=shopeeExecutionProgress({state:'failed',last_error:'video task not found',
  plan,result:{phase:'video_attach_updating',video,videoReadbackConfirmed:true,videoRejected:false}});
 assert.equal(progress.videoPublished,true);
 assert.equal(progress.steps.find(x=>x.id==='video').status,'done');
 assert.doesNotMatch(progress.title,/Vídeo recusado/);
});
