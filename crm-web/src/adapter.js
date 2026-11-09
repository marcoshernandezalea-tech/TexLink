/* TexLink CRM, versión para la web.
   Sustituye las capacidades de claude.ai (base de datos, archivos, lectura de hojas, descargas)
   por un servidor propio en Google Apps Script, con usuario y contraseña. */
(function(){
"use strict";
var CFG=window.CRM_CONFIG||{};
window.CRM_STANDALONE=true;
window.CRM_ANY_TYPE=true;
window.CRM_MAX_UPLOAD_MB=15;
window.CRM_FILE_HREF=function(id){return "#file:"+id;};
var POLL=Number(CFG.pollMs)||45000;
var A={token:"",user:"",rol:"",remember:false};
var cache=new Map(),since=0,loaded=false,pollT=0,lsn=[],brandLsn=[],queue=[],flushT=0,pendingIds={};
var resolveReady,readyP=new Promise(function(r){resolveReady=r;});
var $=function(s){return document.querySelector(s);};

/* ---- almacenamiento de la sesión ---- */
function keep(k,v){try{sessionStorage.removeItem(k);localStorage.removeItem(k);if(v!=null)(A.remember?localStorage:sessionStorage).setItem(k,v);}catch(e){}}
function saved(k){try{return sessionStorage.getItem(k)||localStorage.getItem(k);}catch(e){return null;}}
function say(msg){var t=$("#toast");if(!t)return;t.textContent=msg;t.hidden=false;clearTimeout(say._t);say._t=setTimeout(function(){t.hidden=true;},3800);}

/* ---- llamada al servidor ---- */
async function api(action,payload,ms){
  if(!CFG.api||/PEGA_AQUI/.test(CFG.api))throw {code:"config",message:"Falta la dirección del servidor en config.js."};
  var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort();},ms||40000),j;
  try{
    var res=await fetch(CFG.api,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({action:action,token:A.token},payload||{})),signal:ctl.signal,redirect:"follow"});
    j=await res.json();
  }catch(e){throw {code:"network",message:"No se pudo conectar con el servidor. Revisa la dirección de config.js y que la implementación sea para «Cualquier usuario»."};}
  finally{clearTimeout(timer);}
  if(!j||!j.ok){
    if(j&&j.error==="auth"&&A.token)logout("La sesión ha caducado. Vuelve a entrar.");
    throw {code:(j&&j.error)||"server",message:(j&&j.message)||"Error del servidor."};
  }
  return j;
}

/* ---- pantalla de acceso ---- */
function showLogin(msg){var l=$("#login");if(l)l.hidden=false;var e=$("#login-err");if(e){e.hidden=!msg;e.textContent=msg||"";}}
function hideLogin(){var l=$("#login");if(l)l.hidden=true;}
function logout(msg){
  try{sessionStorage.removeItem("crm-token");localStorage.removeItem("crm-token");if(msg)sessionStorage.setItem("crm-msg",msg);}catch(e){}
  location.reload();
}
function addLogoutButton(){
  if($("#logout"))return;
  var tools=$(".tools");if(!tools)return;
  var b=document.createElement("button");b.id="logout";b.className="btn sm";b.type="button";b.textContent="Salir ("+A.user+")";
  b.addEventListener("click",function(){logout();});tools.appendChild(b);
}
async function firstLoad(){
  var r=await api("list",{since:0},60000);
  A.user=r.yo.user;A.rol=r.yo.rol;
  apply(r.docs);since=r.max||0;loaded=true;
  hideLogin();addLogoutButton();startPoll();resolveReady();notify();
}
async function doLogin(user,pass,remember){
  A.remember=!!remember;
  var r=await api("login",{user:user,password:pass},30000);
  A.token=r.token;keep("crm-token",r.token);
  await firstLoad();
}

/* ---- datos ---- */
function apply(docs){
  var changed=false;
  docs.forEach(function(d){
    if(pendingIds[d.id])return;
    var cur=cache.get(d.id);
    if(JSON.stringify(cur)!==JSON.stringify(d.doc)){cache.set(d.id,d.doc);changed=true;}
  });
  return changed;
}
function snap(){var ids=Array.from(cache.keys());return {docs:ids.map(function(id){return {id:id,exists:true,data:function(){return cache.get(id);}};}),size:ids.length};}
function notify(){var s=snap();lsn.slice().forEach(function(f){try{f(s);}catch(e){}});}
function startPoll(){clearInterval(pollT);pollT=setInterval(poll,POLL);}
async function poll(){
  if(document.hidden||!A.token)return;
  try{var r=await api("list",{since:since});if(r.max>since)since=r.max;if(apply(r.docs))notify();}catch(e){}
}
document.addEventListener("visibilitychange",function(){if(!document.hidden&&A.token&&loaded)poll();});

function queueSet(id,doc){
  return new Promise(function(res,rej){queue.push({id:id,doc:doc,res:res,rej:rej});clearTimeout(flushT);flushT=setTimeout(flush,120);});
}
async function flush(){
  var items=queue.splice(0,queue.length);
  while(items.length){
    var chunk=items.splice(0,20);
    try{
      var r=await api("batch",{docs:chunk.map(function(x){return {id:x.id,doc:x.doc};})},90000);
      if(r.max>since)since=r.max;
      chunk.forEach(function(x){delete pendingIds[x.id];x.res();});
    }catch(e){
      chunk.forEach(function(x){delete pendingIds[x.id];if(x.prev===undefined)cache.delete(x.id);else cache.set(x.id,x.prev);x.rej({code:e.code==="auth"?"revoked":"unavailable",message:e.message});});
      notify();
    }
  }
}
function denied(){return Promise.reject({code:"invalid_argument",message:"Tu usuario solo puede mirar."});}
function leadDoc(id){
  return {
    update:function(patch){
      if(A.rol!=="editor")return denied();
      var prev=cache.get(id);if(!prev)return Promise.reject({code:"invalid_argument"});
      cache.set(id,Object.assign({},prev,patch));pendingIds[id]=(pendingIds[id]||0)+1;notify();
      return api("update",{id:id,patch:patch}).then(function(r){if(r.max>since)since=r.max;},function(e){cache.set(id,prev);notify();throw {code:e.code==="auth"?"revoked":"unavailable",message:e.message};}).finally(function(){pendingIds[id]=(pendingIds[id]||1)-1;if(!pendingIds[id])delete pendingIds[id];});
    },
    set:function(doc){
      if(A.rol!=="editor")return denied();
      var prev=cache.get(id);cache.set(id,doc);pendingIds[id]=1;notify();
      var p=queueSet(id,doc);queue[queue.length-1].prev=prev;return p;
    }
  };
}
function brandSnap(){
  var b=null;try{b=JSON.parse(localStorage.getItem("crm-brand")||"null");}catch(e){}
  b=b||{logo:CFG.logo||"",plate:!!CFG.logoPlate};
  return {exists:!!b.logo,data:function(){return b;}};
}
function brandDoc(){
  return {
    onSnapshot:function(next){brandLsn.push(next);setTimeout(function(){next(brandSnap());},0);return function(){brandLsn=brandLsn.filter(function(f){return f!==next;});};},
    set:function(d){try{localStorage.setItem("crm-brand",JSON.stringify(d));}catch(e){}brandLsn.forEach(function(f){f(brandSnap());});return Promise.resolve();}
  };
}
var dbApi={
  collection:function(){return {onSnapshot:function(next){lsn.push(next);if(loaded)setTimeout(function(){next(snap());},0);return function(){lsn=lsn.filter(function(f){return f!==next;});};}};},
  doc:function(path){var p=String(path).split("/");return p[0]==="config"?brandDoc():leadDoc(p[1]);}
};

/* ---- archivos (Drive), hojas de origen y descargas ---- */
function toB64(file){
  return new Promise(function(res,rej){var fr=new FileReader();fr.onload=function(){res(String(fr.result).split(",")[1]||"");};fr.onerror=function(){rej({code:"invalid_request"});};fr.readAsDataURL(file);});
}
var assetsApi={
  upload:async function(file,opts){
    var ctx=window.CRM_UPLOAD_CTX||{};
    var b64=await toB64(file);
    var r=await api("upload",{leadId:ctx.src||"",leadName:ctx.name||"",name:file.name,mime:file.type||(opts&&opts.type)||"application/octet-stream",b64:b64},180000);
    return {id:r.id,url:"#file:"+r.id,sizeBytes:r.size,contentType:r.mime};
  },
  delete:function(id){return api("deleteFile",{id:id}).then(function(){return {deleted:true};});}
};
var mcpApi={
  callTool:function(server,tool,input){
    if(tool!=="get_values")return Promise.reject({code:"bad_request",message:"Herramienta no disponible."});
    return api("sheet",{spreadsheetId:(input&&(input.spreadsheetId||input.spreadsheet_id))||"",range:(input&&input.range)||""},90000).then(
      function(r){return {payload:{range:input.range,values:r.values}};},
      function(e){throw {code:e.code==="auth"?"needs_reauth":"upstream_error",message:e.message};});
  },
  describeTool:function(){return Promise.reject({code:"bad_request"});}
};
var downloadsApi={
  save:function(o){
    return new Promise(function(res,rej){
      try{
        var type=/\.csv$/i.test(o.filename)?"text/csv;charset=utf-8":/\.json$/i.test(o.filename)?"application/json":"text/plain;charset=utf-8";
        var blob=o.data instanceof Blob?o.data:new Blob([o.data],{type:type});
        var url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=o.filename;document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},30000);res({status:"saved"});
      }catch(e){rej({code:"unavailable"});}
    });
  }
};
document.addEventListener("click",async function(ev){
  var a=ev.target.closest&&ev.target.closest('a[href^="#file:"]');if(!a)return;
  ev.preventDefault();ev.stopPropagation();
  say("Descargando…");
  try{
    var r=await api("download",{id:a.getAttribute("href").slice(6)},180000);
    var bin=atob(r.b64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    var url=URL.createObjectURL(new Blob([u],{type:r.mime||"application/octet-stream"})),d=document.createElement("a");
    d.href=url;d.download=r.name||"tech-pack";document.body.appendChild(d);d.click();d.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},30000);
  }catch(e){say(e&&e.message||"No se pudo descargar el archivo.");}
},true);

/* ---- llamadas directas al servidor para extensiones de la página (fichas del formulario) ---- */
window.CRM_API={call:api,role:function(){return A.rol;}};

/* ---- puerta de entrada para el resto de la aplicación ---- */
window.claude={use:function(name){
  if(name==="db")return readyP.then(function(){return dbApi;});
  if(name==="assets")return readyP.then(function(){return A.rol==="editor"?assetsApi:null;});
  if(name==="mcp")return readyP.then(function(){return A.rol==="editor"?mcpApi:null;});
  if(name==="downloads")return Promise.resolve(downloadsApi);
  return Promise.resolve(null);
}};

/* ---- arranque: formulario de acceso o sesión guardada ---- */
(function start(){
  var logo=$("#login-logo");if(logo&&CFG.logo){logo.src=CFG.logo;logo.hidden=false;}
  var form=$("#login-form");
  form.addEventListener("submit",async function(ev){
    ev.preventDefault();
    var btn=$("#login-btn");btn.disabled=true;btn.textContent="Entrando…";showLogin("");
    try{await doLogin($("#login-user").value,$("#login-pass").value,$("#login-remember").checked);}
    catch(e){showLogin(e&&e.message||"No se pudo entrar.");$("#login-pass").value="";}
    finally{btn.disabled=false;btn.textContent="Entrar";}
  });
  var msg=null;try{msg=sessionStorage.getItem("crm-msg");sessionStorage.removeItem("crm-msg");}catch(e){}
  var tk=saved("crm-token");
  if(tk&&!msg){A.token=tk;A.remember=!!(function(){try{return localStorage.getItem("crm-token");}catch(e){return null;}})();firstLoad().catch(function(){A.token="";showLogin("");});}
  else showLogin(msg||"");
})();
})();
