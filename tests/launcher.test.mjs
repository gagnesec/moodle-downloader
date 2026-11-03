import test from 'node:test';
import assert from 'node:assert/strict';
import {openDownloader} from '../extension/launcher.js';
function browser(contexts=[]){
 const calls=[];
 return {calls,runtime:{getURL:p=>'chrome-extension://test/'+p,getContexts:async filter=>{calls.push(['contexts',filter]);return contexts;}},tabs:{move:async(id,options)=>{calls.push(['move',id,options]);},update:async(id,options)=>{calls.push(['activate',id,options]);},create:async options=>{calls.push(['create',options]);return {id:90,windowId:9};}},windows:{update:async(id,options)=>{calls.push(['focusWindow',id,options]);}}};
}
test('toolbar activates the actual utility and focuses its window without browsing-history permission',async()=>{
 const api=browser([{tabId:8,windowId:4}]);
 assert.equal(await openDownloader({windowId:2},api),8);
 assert.deepEqual(api.calls.map(c=>c[0]),['contexts','move','activate','focusWindow']);
 assert.deepEqual(api.calls.at(-1),['focusWindow',2,{focused:true}]);
});
test('toolbar prefers a utility already in the current window',async()=>{
 const api=browser([{tabId:8,windowId:4},{tabId:9,windowId:2}]);
 assert.equal(await openDownloader({windowId:2},api),9);
});
test('toolbar still opens when page/context inspection is unavailable',async()=>{
 const api=browser();api.runtime.getContexts=async()=>{throw new Error('Lookup unavailable');};
 assert.equal(await openDownloader({},api),90);
 assert.equal(api.calls[0][0],'create');
 assert.equal(api.calls[0][1].active,true);
});
test('a closed utility is replaced and simultaneous clicks do not create duplicates',async()=>{
 const api=browser([{tabId:8,windowId:4}]);api.tabs.update=async()=>{throw new Error('No tab');};
 const result=await Promise.all([openDownloader({},api),openDownloader({},api)]);
 assert.deepEqual(result,[90,90]);
 assert.equal(api.calls.filter(c=>c[0]==='create').length,1);
});
