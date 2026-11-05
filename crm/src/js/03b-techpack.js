/* ---------- tech packs: archivos y enlaces de cada cliente ---------- */
/* Extiende la aplicación sin tocar el resto: añade la pestaña «Tech packs», una caja en la ficha y la subida de archivos. */
TABS.splice(4,0,["techpacks","Tech packs"]);
S.tpTarget=null;S.tpBusy="";S.tpDel="";
caps.assets=null;
var TP_EXT={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",csv:"text/csv",md:"text/markdown",txt:"text/plain",json:"application/json"};
var TP_MAX_MB=window.CRM_MAX_UPLOAD_MB||20;
function tpType(f){if(window.CRM_ANY_TYPE)return f.type||"application/octet-stream";var m=/\.([a-z0-9]+)$/i.exec(f.name||"");return (m&&TP_EXT[m[1].toLowerCase()])||"";}
function tpFiles(l){return Array.isArray(l.tp)?l.tp:[];}
function tpLinks(l){return Array.isArray(l.tpLinks)?l.tpLinks:[];}
function tpHas(l){return tpFiles(l).length>0||tpLinks(l).length>0;}
function tpSays(l){var t=String((l.raw&&l.raw.techpack)||"").toLowerCase(),tg=l.tags||[];return /completo|parcial/.test(t)||tg.indexOf("tech-pack")>=0||tg.indexOf("tech-pack-parcial")>=0||tg.indexOf("tech-pack-pendiente")>=0;}
function fmtSize(n){n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";}
function tpErr(e){
  var c=e&&e.code;
  return c==="too_large"?"El archivo pesa demasiado (máximo "+TP_MAX_MB+" MB).":
    c==="unsupported_type"?"Ese tipo de archivo no se admite. Usa PDF o imagen, o guarda el enlace de Drive.":
    c==="quota_or_state"?"Se ha llenado el espacio de archivos del CRM. Quita alguno antiguo.":
    c==="rate_limited"?"Demasiadas subidas seguidas. Espera un momento.":
    c==="not_granted"||c==="capability_disabled"||c==="capability_removed"?"Esta vista no puede subir archivos.":
    "No se pudo subir el archivo. Inténtalo de nuevo.";
}
function tpHref(id){return window.CRM_FILE_HREF?window.CRM_FILE_HREF(id):"/_blob/"+id;}
function tpAddTag(l){var tags=(l.tags||[]).slice();if(tags.indexOf("tech-pack-recibido")<0)tags.push("tech-pack-recibido");return tags;}
async function tpUpload(file,src){
  var assets=caps.assets,l=S.leads.get(src);
  if(!file||!l)return;
  if(!assets){toast("Solo quien puede editar el CRM puede subir archivos.");return;}
  var type=tpType(file);
  if(!type){toast("Solo PDF, imágenes, CSV o texto. Para Excel o Word, guarda el enlace de Drive.");return;}
  if(file.size>TP_MAX_MB*1024*1024){toast("El archivo pesa más de "+TP_MAX_MB+" MB.");return;}
  S.tpBusy=src;drawerKey="";schedule();
  try{
    window.CRM_UPLOAD_CTX={src:src,name:l.name};
    var r=await assets.upload(file,{type:type});
    var item={id:r.id,name:String(file.name).slice(0,120),type:r.contentType||type,size:r.sizeBytes||file.size,at:todayISO()};
    var cur=S.leads.get(src)||l;
    var ok=await save(src,{tp:tpFiles(cur).concat([item]),tags:tpAddTag(cur)});
    if(ok)toast("Tech pack guardado en la ficha de "+cur.name+".");
  }catch(e){toast(tpErr(e));}
  finally{S.tpBusy="";drawerKey="";schedule();}
}
async function tpAddLink(src){
  var inp=$("#tp-link"),l=S.leads.get(src);if(!inp||!l)return;
  var u=inp.value.trim();
  if(!/^https:\/\/\S+$/i.test(u)){toast("Pega un enlace que empiece por https://");return;}
  var host="";try{host=new URL(u).hostname.replace(/^www\./,"");}catch(e){toast("Ese enlace no es válido.");return;}
  var ok=await save(src,{tpLinks:tpLinks(l).concat([{url:u.slice(0,500),label:host,at:todayISO()}]),tags:tpAddTag(l)});
  if(ok){inp.value="";toast("Enlace guardado.");}
}
async function tpRemove(src,id){
  var l=S.leads.get(src);if(!l)return;
  S.tpDel="";
  if(/^l\d+$/.test(id)){
    var i=Number(id.slice(1));
    await save(src,{tpLinks:tpLinks(l).filter(function(x,k){return k!==i;})});
  }else{
    try{if(caps.assets)await caps.assets.delete(id);}catch(e){toast(tpErr(e));drawerKey="";schedule();return;}
    if(await save(src,{tp:tpFiles(l).filter(function(f){return f.id!==id;})}))toast("Archivo eliminado.");
  }
  drawerKey="";schedule();
}
function tpDelBtns(l,id){
  if(!caps.assets)return"";
  var s='data-src="'+esc(l.src)+'" data-id="'+esc(id)+'"';
  return S.tpDel===id?'<button class="btn sm pri" data-act="tp-del-ok" '+s+'>Confirmar</button><button class="btn sm" data-act="tp-del-no">Cancelar</button>':'<button class="btn sm" data-act="tp-del" '+s+'>Quitar</button>';
}
function tpItemsHTML(l){
  var out=tpFiles(l).map(function(f){
    return '<div class="tp-item"><a class="tp-name" data-act="x" href="'+esc(tpHref(f.id))+'" target="_blank" rel="noopener">'+esc(f.name)+'</a><span class="note">'+fmtSize(f.size)+' · '+esc(f.at||"")+'</span>'+tpDelBtns(l,f.id)+'</div>';});
  return out.concat(tpLinks(l).map(function(k,i){
    return '<div class="tp-item"><a class="tp-name" data-act="x" href="'+esc(k.url)+'" target="_blank" rel="noopener">Enlace · '+esc(k.label||k.url)+'</a><span class="note">'+esc(k.at||"")+'</span>'+tpDelBtns(l,"l"+i)+'</div>';})).join("");
}
function tpBox(l){
  var busy=S.tpBusy===l.src;
  return '<div class="box" id="tp-box"><h3>Tech pack</h3>'+
    (tpHas(l)?tpItemsHTML(l):'<p class="note" style="margin:0">Todavía no hay ningún tech pack guardado'+(tpSays(l)?'. Según el formulario, este cliente dice tenerlo.':'.')+'</p>')+
    '<div class="tp-actions">'+(caps.assets?'<button class="btn" data-act="tp-add" data-src="'+esc(l.src)+'"'+(busy?" disabled":"")+'>'+(busy?"Subiendo…":"Subir archivo")+'</button>':'<span class="note">Solo quien puede editar el CRM sube archivos.</span>')+'</div>'+
    '<div class="tp-link"><input id="tp-link" type="url" placeholder="O pega un enlace de Drive o WeTransfer" aria-label="Enlace al tech pack"><button class="btn" data-act="tp-link" data-src="'+esc(l.src)+'">Guardar enlace</button></div>'+
    '<p class="note" style="margin:10px 0 0">'+(window.CRM_ANY_TYPE?"Cualquier tipo de archivo, hasta "+TP_MAX_MB+" MB.":"Archivos: PDF, imágenes, CSV o texto, hasta "+TP_MAX_MB+" MB. Para Excel, Word o Illustrator, guarda el enlace de Drive.")+'</p></div>';
}
function tpRow(l){
  var chips=tpFiles(l).map(function(f){return '<a class="chip" data-act="x" href="'+esc(tpHref(f.id))+'" target="_blank" rel="noopener">'+esc(f.name)+'</a>';}).concat(
    tpLinks(l).map(function(k){return '<a class="chip" data-act="x" href="'+esc(k.url)+'" target="_blank" rel="noopener">Enlace · '+esc(k.label||"")+'</a>';})).join("");
  return '<div class="tp-row" data-act="open" data-src="'+esc(l.src)+'" tabindex="0" role="button"><div class="cl-name"><b>'+esc(l.name)+'</b><small>'+esc((l.brand&&l.brand!=="—"?l.brand+" · ":"")+(STAGE[l.stage]||{}).label)+'</small></div>'+
    '<div class="tp-files">'+(chips||'<span class="note">'+((l.raw&&l.raw.techpack)?"Formulario: "+esc(l.raw.techpack):"Dice tener tech pack")+'</span>')+'</div>'+
    '<div class="ract">'+(caps.assets?'<button class="btn sm" data-act="tp-add" data-src="'+esc(l.src)+'">Subir archivo</button>':"")+'</div></div>';
}
function viewTechpacks(list){
  var con=list.filter(tpHas).sort(byScore),falta=list.filter(function(l){return !tpHas(l)&&tpSays(l);}).sort(byScore);
  var tile=function(n,t,c){return '<div class="kpi '+c+'"><b>'+n+'</b><span>'+t+'</span></div>';};
  return '<div class="kpis" style="margin-bottom:18px">'+tile(con.length,"Con tech pack guardado","good")+tile(falta.length,"Dicen tenerlo y falta el archivo","")+tile(list.length-con.length-falta.length,"Sin tech pack","")+'</div>'+
    '<p class="note" style="margin:0 0 14px">Guarda aquí lo que te manda cada cliente. Abre su ficha para subir el archivo o pegar un enlace. Los clientes que se marcan como «tech pack completo» o «parcial» en el formulario salen en la primera lista hasta que guardes algo.</p>'+
    section("Falta guardar el archivo","Dicen tener tech pack, pero no hay nada guardado. Los de más puntuación, primero.",falta.map(tpRow),"No falta ningún tech pack en este filtro.")+
    section("Guardados","Clientes con archivo o enlace.",con.map(tpRow),"Todavía no has guardado ningún tech pack.");
}
var drawerHTML0=drawerHTML;
drawerHTML=function(l){return drawerHTML0(l).replace(/<\/aside>$/,tpBox(l)+"</aside>");};
var viewImportar0=viewImportar;
viewImportar=function(){return S.tab==="techpacks"?viewTechpacks(filtered()):viewImportar0();};
document.addEventListener("click",function(ev){
  var t=ev.target.closest("[data-act]");if(!t)return;
  var a=t.dataset.act;
  if(a==="tp-add"){ev.stopPropagation();S.tpTarget=t.dataset.src;var f=$("#tpfile");if(f)f.click();}
  else if(a==="tp-link")tpAddLink(t.dataset.src);
  else if(a==="tp-del"){S.tpDel=t.dataset.id;drawerKey="";schedule();}
  else if(a==="tp-del-no"){S.tpDel="";drawerKey="";schedule();}
  else if(a==="tp-del-ok")tpRemove(t.dataset.src,t.dataset.id);
});
document.addEventListener("change",function(ev){
  if(ev.target.id==="tpfile"){var file=ev.target.files&&ev.target.files[0];ev.target.value="";tpUpload(file,S.tpTarget);}
});
if(window.claude&&window.claude.use)window.claude.use("assets").then(function(m){caps.assets=m;schedule();},function(){});
