let opening;

// Only inspect this extension's own pages, never the user's browsing history.
export function openDownloader(source = {}, api = chrome) {
  if (opening) return opening;
  opening = showDownloader(source, api).finally(() => { opening = null; });
  return opening;
}

async function showDownloader(source, api) {
  const url = api.runtime.getURL('app.html');
  let contexts = [];
  try { contexts = await api.runtime.getContexts({contextTypes:['TAB'],documentUrls:[url]}); }
  catch { /* Opening a new tab must still work if context lookup is unavailable. */ }
  contexts.sort((a,b) => Number(b.windowId === source.windowId)-Number(a.windowId === source.windowId));
  for (const context of contexts) {
    if (context.tabId < 0) continue;
    try {
      let windowId=context.windowId;
      if(Number.isInteger(source.windowId)&&source.windowId>=0&&source.windowId!==windowId){
        await api.tabs.move(context.tabId,{windowId:source.windowId,index:-1});
        windowId=source.windowId;
      }
      await api.tabs.update(context.tabId,{active:true});
      await api.windows.update(windowId,{focused:true});
      return context.tabId;
    } catch { /* A previously open page may have been closed during the click. */ }
  }
  const tab = await api.tabs.create({url,active:true});
  if (Number.isInteger(tab.windowId)) await api.windows.update(tab.windowId,{focused:true});
  return tab.id;
}
