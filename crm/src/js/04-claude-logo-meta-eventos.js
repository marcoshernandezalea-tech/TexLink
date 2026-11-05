/* ---------- importar leads de Meta (CSV) ---------- */
function nk(s){return String(s||"").toLowerCase().normalize("NFD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function decodeText(buf){
  var u=new Uint8Array(buf);
  if(u[0]===0xFF&&u[1]===0xFE)return new TextDecoder("utf-16le").decode(buf.slice(2));
  if(u[0]===0xFE&&u[1]===0xFF)return new TextDecoder("utf-16be").decode(buf.slice(2));
  var t=new TextDecoder("utf-8").decode(buf);return t.charCodeAt(0)===0xFEFF?t.slice(1):t;
}
function parseCSV(text){
  var first=text.split(/\r?\n/,1)[0]||"";
  var cnt={"\t":(first.match(/\t/g)||[]).length,";":(first.match(/;/g)||[]).length,",":(first.match(/,/g)||[]).length},d=",";
  ["\t",";",","].forEach(function(c){if(cnt[c]>cnt[d])d=c;});
  var rows=[],row=[],cur="",q=false,flush=function(){row.push(cur);cur="";if(row.some(function(x){return x!=="";}))rows.push(row);row=[];};
  for(var i=0;i<text.length;i++){
    var ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}
    else if(ch==='"')q=true;
    else if(ch===d){row.push(cur);cur="";}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;flush();}
    else cur+=ch;
  }
  if(cur!==""||row.length)flush();
  return rows;
}
function cleanChoice(v){return String(v||"").replace(/_/g," ").replace(/\s*[–-]\s*/g,"–").replace(/\s+/g," ").trim();}
function isoToDMY(s){var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||""));return m?m[3]+"/"+m[2]+"/"+m[1]:"";}
async function importMeta(file){
  if(!file||S.busy||!caps.db)return;
  if(/\.xlsx?$/i.test(file.name)){toast("Guarda el archivo como CSV desde Excel y vuelve a subirlo.");return;}
  S.busy="meta";S.log=["Leyendo "+file.name+"…"];schedule();
  var created=0,skipped=0,empty=0;
  try{
    var sinContacto=all().filter(function(l){return (l.camp===1||l.camp===2)&&!l.dup&&!l.raw;}).length;
    if(sinContacto)throw {message:"Antes de subir leads de Meta, pulsa «Leer mis hojas de Google» (opción 2). Así el CRM conoce el correo y el teléfono de tus "+sinContacto+" clientes actuales y no se duplican."};
    var rows=parseCSV(decodeText(await file.arrayBuffer()));
    if(rows.length<2)throw {message:"El archivo no tiene filas de leads."};
    var head=rows[0].map(nk);
    var idx=function(){for(var a=0;a<arguments.length;a++){var i=head.indexOf(arguments[a]);if(i>=0)return i;}return -1;};
    var iName=idx("full_name","nombre_completo","nombre","name"),iFirst=idx("first_name"),iLast=idx("last_name"),
      iMail=idx("email","correo","correo_electronico","e_mail"),iTel=idx("phone_number","telefono","phone","numero_de_telefono","movil"),
      iCo=idx("company_name","empresa","marca"),iAd=idx("ad_name","anuncio"),iPlat=idx("platform","plataforma"),iDate=idx("created_time","fecha"),
      iId=idx("id","lead_id"),iCity=idx("city","ciudad"),iVer=idx("phone_number_verified");
    if(iMail<0&&iTel<0)throw {message:"No encuentro columnas de correo ni de teléfono. ¿Es el CSV de leads de Meta?"};
    var known={};[iName,iFirst,iLast,iMail,iTel,iCo,iAd,iPlat,iDate,iId,iCity,iVer].forEach(function(i){if(i>=0)known[i]=1;});
    var SKIP={ad_id:1,adset_id:1,adset_name:1,campaign_id:1,campaign_name:1,form_id:1,form_name:1,is_organic:1,lead_status:1,state:1,zip_code:1,country:1,street_address:1};
    var seen=new Map();all().forEach(function(l){var k=keyOf(l.raw||{});if(k)seen.set(k,l.src);});
    var stamp=Date.now().toString(36),docs=[];
    for(var r=1;r<rows.length;r++){
      var row=rows[r],g=function(i){return i>=0&&row[i]!==undefined?String(row[i]).trim():"";};
      var email=g(iMail).toLowerCase(),tel=g(iTel).replace(/^p:\s*/i,"").trim();
      var name=g(iName)||(g(iFirst)+" "+g(iLast)).trim()||g(iCo)||email;
      if(!name&&!tel){empty++;continue;}
      var plat=g(iPlat),raw={fecha:isoToDMY(g(iDate)),plataforma:({ig:"Instagram",fb:"Facebook"})[plat.toLowerCase()]||plat,anuncio:g(iAd),email:email,tel:tel,ciudad:g(iCity)},notes=[];
      for(var c=0;c<head.length;c++){
        if(known[c]||SKIP[head[c]])continue;var v=g(c);if(!v)continue;var h=head[c];
        if(h.indexOf("unidades")>=0)raw.unidades=cleanChoice(v);
        else if(h.indexOf("presupuesto")>=0)raw.presupuesto=cleanChoice(v);
        else if(h.indexOf("tech")>=0||h.indexOf("diseno")>=0)raw.techpack=cleanChoice(v);
        else if(h.indexOf("vende")>=0)raw.tipo=cleanChoice(v);
        else if(h.indexOf("web")>=0||h.indexOf("instagram")>=0)raw.web=v;
        else notes.push(String(rows[0][c]).replace(/_/g," ")+": "+cleanChoice(v));
      }
      if(notes.length)raw.notas=notes.join("; ");
      raw.telBad=!!tel&&(/[a-z]/i.test(tel)||digits(tel).length<7);
      Object.keys(raw).forEach(function(k){if(raw[k]===""||raw[k]===false)delete raw[k];});
      var key=keyOf(raw);if(key&&seen.has(key)){skipped++;continue;}if(key)seen.set(key,"nuevo");
      var id=("m-"+(g(iId).replace(/[^A-Za-z0-9]/g,"")||stamp+"-"+r)).slice(0,120);
      if(S.leads.has(id)){skipped++;continue;}
      docs.push({src:id,camp:4,name:name.slice(0,120),brand:g(iCo).slice(0,120),seg:"marca",stage:"nuevo",score:0,tags:[],reason:"",next:"Primer contacto",sug:"",ai:false,raw:raw});
    }
    log(docs.length+" leads nuevos de "+(rows.length-1)+" filas.");
    for(var k=0;k<docs.length;k++){await caps.db.doc("leads/"+docs[k].src).set(docs[k]);created++;if((k+1)%20===0)log("Guardados "+(k+1)+" de "+docs.length+"…");}
    log("Listo. "+created+(created===1?" lead nuevo":" leads nuevos")+", "+skipped+(skipped===1?" ya estaba":" ya estaban")+" en el CRM"+(empty?", "+empty+" filas vacías":"")+".");
    if(created)toast(created+(created===1?" lead importado":" leads importados")+" de Meta.");
  }catch(e){log("✕ "+((e&&e.message)||"No se pudo importar el archivo."));}
  finally{S.busy="";schedule();}
  if(created&&caps.sample){await new Promise(function(r){setTimeout(r,300);});classifyPending(true);}
}

/* ---------- eventos ---------- */
document.addEventListener("click",function(ev){
  var t=ev.target.closest("[data-act]");if(!t)return;
  var a=t.dataset.act,src=t.dataset.src;
  if(a==="open"){S.open=src;S.draft=null;schedule();}
  else if(a==="close"){S.open=null;S.draft=null;schedule();}
  else if(a==="tab"){S.tab=t.dataset.tab;try{history.replaceState(null,"","#"+S.tab);}catch(e){location.hash=S.tab;}schedule();}
  else if(a==="touch"){ev.stopPropagation();var tl=S.leads.get(src),moved=tl&&tl.stage==="nuevo";
    save(src,moved?{touched:todayISO(),stage:"contacto"}:{touched:todayISO()}).then(function(ok){if(ok)toast(moved?"Anotado y movido a «En contacto».":"Anotado: contactado hoy.");});}
  else if(a==="accept"){ev.stopPropagation();var l=S.leads.get(src);if(l&&l.sug)save(src,{stage:l.sug,sug:"",sugWhy:""}).then(function(ok){if(ok)toast("Fase actualizada.");});}
  else if(a==="dismiss"){ev.stopPropagation();save(src,{sug:"",sugWhy:""});}
  else if(a==="tag"){S.q=t.dataset.tag;$("#q").value=S.q;S.tab="tablero";schedule();}
  else if(a==="copy"){ev.stopPropagation();var v=t.dataset.v;(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){toast("Copiado.");},function(){toast("No se pudo copiar. Selecciona el texto a mano.");});}
  else if(a==="copy-draft"){var d=$("#draft-text");if(d){(navigator.clipboard?navigator.clipboard.writeText(d.value):Promise.reject()).then(function(){toast("Mensaje copiado.");},function(){d.select();toast("Selecciona y copia el texto.");});}}
  else if(a==="import-sheets")importSheets();
  else if(a==="classify")classifyPending();
  else if(a==="paste")pasteImport();
  else if(a==="draft")draftMsg(src);
  else if(a==="export")exportCsv();
});
document.addEventListener("keydown",function(ev){
  if(ev.key==="Escape"&&S.open){S.open=null;S.draft=null;schedule();}
  if((ev.key==="Enter"||ev.key===" ")&&ev.target.matches&&ev.target.matches('[data-act="open"]')){ev.preventDefault();S.open=ev.target.dataset.src;S.draft=null;schedule();}
});
document.addEventListener("change",function(ev){
  var t=ev.target,f=t.dataset&&t.dataset.field;
  if(t.id==="logofile"||t.id==="metafile"){var file=t.files&&t.files[0];t.value="";if(t.id==="logofile")setLogo(file);else importMeta(file);return;}
  if(f==="stage")setStage(t.dataset.src,t.value);
  else if(f==="note")save(t.dataset.src,{note:t.value}).then(function(ok){if(ok)toast("Nota guardada.");});
});
$("#camp").addEventListener("change",function(e){S.camp=e.target.value;lsSet("crm-camp",S.camp);schedule();});
$("#q").addEventListener("input",function(e){S.q=e.target.value;schedule();});
document.addEventListener("dragstart",function(ev){var c=ev.target.closest&&ev.target.closest(".card");if(!c)return;S.dragging=c.dataset.src;try{ev.dataTransfer.setData("text/plain",c.dataset.src);ev.dataTransfer.effectAllowed="move";}catch(e){}});
document.addEventListener("dragover",function(ev){var c=ev.target.closest&&ev.target.closest(".col");if(!c||!S.dragging)return;ev.preventDefault();c.classList.add("over");});
document.addEventListener("dragleave",function(ev){var c=ev.target.closest&&ev.target.closest(".col");if(c&&!c.contains(ev.relatedTarget))c.classList.remove("over");});
document.addEventListener("drop",function(ev){var c=ev.target.closest&&ev.target.closest(".col");if(!c||!S.dragging)return;ev.preventDefault();c.classList.remove("over");var s=S.dragging;S.dragging=null;setStage(s,c.dataset.stage);});
document.addEventListener("dragend",function(){S.dragging=null;});
window.addEventListener("hashchange",function(){var h=location.hash.slice(1);if(TABS.some(function(t){return t[0]===h;})){S.tab=h;schedule();}});

/* ---------- arranque ---------- */
(function init(){
  var h=location.hash.slice(1);if(TABS.some(function(t){return t[0]===h;}))S.tab=h;
  var c=lsGet("crm-camp");if(c&&["all","1","2","3","4"].indexOf(c)>=0){S.camp=c;$("#camp").value=c;}
  render();
  var timer=setTimeout(function(){if(!S.loaded){S.failed=true;schedule();}},10000);
  if(!window.claude||!window.claude.use){S.failed=true;render();return;}
  window.claude.use("db").then(function(db){
    if(!db){S.failed=true;schedule();return;}
    caps.db=db;
    db.doc("config/brand").onSnapshot(function(sn){S.brand=(sn.exists&&sn.data())||{};schedule();},function(){});
    db.collection("leads").onSnapshot(function(snap){
      var m=new Map();snap.docs.forEach(function(d){var o=d.data();if(o)m.set(d.id,Object.assign({},o,{src:d.id}));});
      S.leads=m;S.loaded=true;S.failed=false;clearTimeout(timer);schedule();
    },function(){S.failed=true;schedule();});
  },function(){S.failed=true;schedule();});
  window.claude.use("mcp").then(function(m){caps.mcp=m;schedule();},function(){});
  window.claude.use("sample").then(function(m){caps.sample=m;schedule();},function(){});
  window.claude.use("downloads").then(function(m){caps.downloads=m;schedule();},function(){});
})();
})();