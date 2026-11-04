import {collectFiles,fetchContents} from './core.js';

export function createCourseCache({load=fetchContents,now=()=>Date.now()}={}) {
 const entries=new Map();
 let owner='',generation=0;
 const clear=()=>{entries.clear();owner='';generation++;};
 return {
  clear,
  async get(connection,course,signal,{refresh=false}={}) {
   signal?.throwIfAborted();
   const scope=JSON.stringify([connection.site.base,connection.user.id,connection.token]);
   if(owner!==scope){clear();owner=scope;}
   const current=generation;
   const cached=entries.get(course.id);
   if(!refresh && cached && now()-cached.scannedAt<300000)return cached.found;
   const sections=[];
   for(const kind of ['resource','folder']){
    try{sections.push(...await load(connection,course.id,kind,signal));}
    catch(error){
     if(!signal?.aborted && current===generation && error instanceof Error)error.partial=collectFiles(connection.site,course,sections);
     throw error;
    }
    signal?.throwIfAborted();
    if(current!==generation)throw new DOMException('The Moodle connection changed.','AbortError');
   }
   const found=collectFiles(connection.site,course,sections);
   entries.set(course.id,{found,scannedAt:now()});
   return found;
  }
 };
}
