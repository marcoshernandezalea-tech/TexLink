(function(){
"use strict";
/* ---------- constantes ---------- */
var STAGES=[
 {id:"nuevo",label:"Nuevo",grp:"pipe"},{id:"contacto",label:"En contacto",grp:"pipe"},
 {id:"reunion",label:"Reunión",grp:"pipe"},{id:"presupuesto",label:"Presupuesto enviado",grp:"pipe"},
 {id:"ganado",label:"Ganado",grp:"won"},{id:"standby",label:"Standby",grp:"park"},
 {id:"sinresp",label:"Sin respuesta",grp:"park"},{id:"poco",label:"Poco cualificado",grp:"park"},
 {id:"nocual",label:"No cualificado",grp:"park"},{id:"perdido",label:"Perdido",grp:"lost"}];
var STAGE={}; STAGES.forEach(function(s){STAGE[s.id]=s;});
var SEGS={marca:"Marca de ropa",merch:"Merch o uniformes",club:"Club o comunidad",otro:"Otro"};
var SHEET_STAGE={"nuevo":"nuevo","en contacto":"contacto","reunión":"reunion","reunion":"reunion","presupuesto enviado":"presupuesto","ganado":"ganado","perdido":"perdido","sin respuesta":"sinresp","standby / no contactar aún":"standby","lead poco cualificado":"poco","lead no cualificado":"nocual"};
var SHEETS=[
 {camp:2,id:"1K2GU2CoNOh4ohPn7hxpylPdcSSO5O1CdKo-89mMi2Mg",range:"'Seguimiento de Leads'!A1:Y200"},
 {camp:1,id:"1m0W8rtPHTaHosYPhLuI_DJzUDapadfu0Bmeqw9Ifh24",range:"'LEADS Campaña TexLink Meta Ads'!A1:AC300"}];
var TABS=[["hoy","Hoy toca"],["tablero","Tablero"],["cierre","Cierre"],["embudo","Embudo"],["importar","Importar"]];
var CRITERIOS="Puntuación 0-100: presupuesto (hasta 40), unidades (hasta 30), tech pack completo (20), ya vende (10). Suma criterio propio: dolor con su proveedor actual, urgencia, decisor localizado y encaje con lo que TexLink fabrica.";

/* ---------- estado ---------- */
var S={brand:{},leads:new Map(),camp:"all",q:"",tab:"hoy",open:null,loaded:false,failed:false,log:[],busy:"",draft:null,dragging:null};
var caps={db:null,mcp:null,sample:null,downloads:null};
var $=function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function dmy(s){var m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s||"").trim());return m?m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"):"";}
function daysSince(iso){if(!iso)return null;var a=new Date(todayISO()+"T00:00:00"),b=new Date(iso+"T00:00:00");return Math.round((a-b)/864e5);}
function lastTouch(l){return l.touched||dmy(l.raw&&l.raw.fecha)||"";}
function sc(n){return n>=60?"s-hi":n>=40?"s-mid":"s-lo";}
function scoreHTML(n){n=Math.max(0,Math.min(100,Number(n)||0));return '<span class="score '+sc(n)+'" style="--p:'+n+'" title="Puntuación 0-100">'+n+'</span>';}
function tagLabel(t){return String(t).replace(/-/g," ");}
function digits(s){return String(s||"").replace(/\D/g,"");}
function toast(msg){var t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(function(){t.hidden=true;},3800);}
function all(){return Array.from(S.leads.values());}
function hay(l){var r=l.raw||{};return [l.name,l.brand,l.reason,l.next,(l.tags||[]).join(" "),SEGS[l.seg],r.email,r.tel,r.ciudad,r.notas].join(" ").toLowerCase();}
function filtered(){
  var q=S.q.trim().toLowerCase();
  return all().filter(function(l){
    if(l.dup)return false;
    if(S.camp!=="all"&&String(l.camp)!==S.camp)return false;
    return !q||hay(l).indexOf(q)>=0;
  });
}
function byScore(a,b){return (b.score||0)-(a.score||0);}
var PROG={nuevo:10,contacto:35,reunion:60,presupuesto:82,ganado:100,standby:18,sinresp:8,poco:6,nocual:3,perdido:0};
function progOf(l){var p=PROG[l.stage];return p==null?0:p;}
function hueOf(p){return Math.round(p*1.35);}
function neonHTML(l){var p=progOf(l);return '<div class="neon" style="--p:'+p+';--h:'+hueOf(p)+'" title="Cercanía al cierre: '+p+'%"><i></i></div>';}

/* ---------- escritura ---------- */
async function save(src,patch){
  if(!caps.db){toast("La base de datos no está disponible en esta vista.");return false;}
  try{await caps.db.doc("leads/"+src).update(patch);return true;}
  catch(e){toast(e&&e.code==="invalid_argument"?"Solo quien tiene permiso de edición puede cambiar los clientes.":"No se pudo guardar. Inténtalo de nuevo.");return false;}
}
function setStage(src,stage){var l=S.leads.get(src);if(!l||l.stage===stage||!STAGE[stage])return;save(src,{stage:stage}).then(function(ok){if(ok)toast(l.name+" → "+STAGE[stage].label);});}

/* ---------- vistas ---------- */
function kpis(list){
  var n=function(f){return list.filter(f).length;};
  var items=[
    [list.length,"Clientes únicos",""],
    [n(function(l){return l.stage==="nuevo";}),"Sin contactar",""],
    [n(function(l){return l.stage==="contacto"||l.stage==="reunion"||l.stage==="presupuesto";}),"En proceso",""],
    [n(function(l){return l.stage==="ganado";}),"Ganados","good"],
    [n(function(l){return l.stage==="standby"&&(l.tags||[]).indexOf("reactivar")>=0;}),"A reactivar",""]];
  return items.map(function(i){return '<div class="kpi '+i[2]+'"><b>'+i[0]+'</b><span>'+i[1]+'</span></div>';}).join("");
}
function chips(l,max){return '<div class="chips">'+(l.tags||[]).slice(0,max||4).map(function(t){return '<span class="chip">'+esc(tagLabel(t))+'</span>';}).join("")+'</div>';}
function campTag(l){return '<span class="camp">'+(l.camp===1?"C1":l.camp===2?"C2":l.camp===4?"Meta":"Manual")+'</span>';}
function nameLine(l){return '<div class="rname"><b>'+esc(l.name)+'</b>'+(l.brand&&l.brand!=="—"?'<span class="muted">'+esc(l.brand)+'</span>':"")+campTag(l)+'</div>';}
function ageNote(l){var d=daysSince(lastTouch(l));return d==null?"":'<span class="note"> · '+(l.touched?"último contacto":"alta")+" hace "+d+" d</span>";}
function rowHTML(l,btns){
  var sugg=l.sug&&l.sug!==l.stage&&STAGE[l.sug]?'<div class="sugg"><b>Sugerencia:</b> pasar a «'+STAGE[l.sug].label+'». '+esc(l.sugWhy||"")+'</div>':"";
  return '<div class="row'+((l.score||0)>=60?" hot":"")+'" data-act="open" data-src="'+esc(l.src)+'" tabindex="0" role="button">'+
    scoreHTML(l.score)+
    '<div>'+nameLine(l)+'<p class="reason">'+esc(l.reason||"Sin clasificar todavía.")+'</p>'+
    (l.next&&l.next!=="—"?'<p class="next"><span class="lbl">Siguiente</span>'+esc(l.next)+ageNote(l)+'</p>':"")+chips(l,4)+sugg+'</div>'+
    '<div class="ract">'+(btns||"")+'</div></div>';
}
function section(title,hint,rows,empty){
  return '<section class="sec"><div class="sec-h"><h2>'+title+'</h2><p>'+hint+'</p></div>'+
    (rows.length?'<div class="list">'+rows.join("")+'</div>':'<div class="empty">'+empty+'</div>')+'</section>';
}
function viewHoy(list){
  var nuevos=list.filter(function(l){return l.stage==="nuevo";}).sort(byScore);
  var sugs=list.filter(function(l){return l.sug&&l.sug!==l.stage&&STAGE[l.sug];}).sort(byScore);
  var seg=list.filter(function(l){return l.stage==="contacto"||l.stage==="reunion"||l.stage==="presupuesto";}).sort(function(a,b){
    var da=daysSince(lastTouch(a)),db=daysSince(lastTouch(b));return (db==null?-1:db)-(da==null?-1:da)||byScore(a,b);});
  var rea=list.filter(function(l){return l.stage==="standby"&&(l.tags||[]).indexOf("reactivar")>=0;}).sort(byScore);
  var done='<button class="btn sm" data-act="touch" data-src="@">Contactado hoy</button>';
  var out="";
  out+=section("Seguimiento de leads en marcha","En contacto, reunión o presupuesto"+(seg.length>10?" (10 de "+seg.length+")":"")+". Los de más puntuación y más tiempo sin tocar, primero.",seg.slice(0,10).map(function(l){return rowHTML(l,done.replace("@",esc(l.src)));}),"No hay leads en marcha en este filtro.");
  if(sugs.length)out+=section("Revisar sugerencias de Claude","Fases que no encajan con lo que dicen las notas.",sugs.map(function(l){
    return rowHTML(l,'<button class="btn sm pri" data-act="accept" data-src="'+esc(l.src)+'">Aceptar</button><button class="btn sm" data-act="dismiss" data-src="'+esc(l.src)+'">Ignorar</button>');}),"");
  out+=section("Sin contactar","Nunca se les ha escrito. Ordenados por puntuación.",nuevos.map(function(l){return rowHTML(l,done.replace("@",esc(l.src)));}),"No queda nadie sin contactar en este filtro.");
  out+=section("Reactivar de la campaña antigua","Standby con interés real"+(rea.length>10?" (los 10 mejores de "+rea.length+")":"")+".",rea.slice(0,10).map(function(l){return rowHTML(l,done.replace("@",esc(l.src)));}),"No hay leads para reactivar en este filtro.");
  return out;
}
function cardHTML(l){
  return '<article class="card" draggable="true" tabindex="0" role="button" data-act="open" data-src="'+esc(l.src)+'">'+
    '<div class="t"><b>'+esc(l.name)+'</b>'+scoreHTML(l.score)+'</div>'+
    (l.brand&&l.brand!=="—"?'<small>'+esc(l.brand)+'</small>':"")+chips(l,2)+'</article>';
}
function viewTablero(list){
  var cols=STAGES.map(function(s){
    var items=list.filter(function(l){return l.stage===s.id;}).sort(byScore);
    return '<section class="col" data-stage="'+s.id+'" aria-label="'+s.label+'"><div class="col-h '+s.grp+'">'+s.label+'<i>'+items.length+'</i></div><div class="col-b">'+items.map(cardHTML).join("")+'</div></section>';
  }).join("");
  return '<p class="note" style="margin:0 0 8px">Arrastra una tarjeta a otra columna para cambiar su fase. También puedes cambiarla dentro de la ficha.</p><div class="board-wrap"><div class="board">'+cols+'</div></div>';
}
function viewCierre(list){
  var rows=list.slice().sort(function(a,b){return progOf(b)-progOf(a)||byScore(a,b);});
  var near=rows.filter(function(l){return progOf(l)>=60;}).length,mid=rows.filter(function(l){var p=progOf(l);return p>=25&&p<60;}).length,far=rows.length-near-mid;
  var tile=function(n,t,c){return '<div class="kpi '+c+'"><b>'+n+'</b><span>'+t+'</span></div>';};
  return '<div class="legend"><span>Lejos de cerrar</span><span class="bar-l"></span><span>Cerrado</span></div>'+
    '<div class="kpis" style="margin-bottom:18px">'+tile(near,"Cerca del cierre","good")+tile(mid,"En camino","")+tile(far,"Fríos o parados","")+'</div>'+
    '<p class="note" style="margin:0 0 12px">La línea marca cuánto se acerca cada cliente al cierre según su fase. Rojo es frío o perdido, verde es ganado. Cambia la fase y la línea se mueve.</p>'+
    '<div class="cl-list">'+rows.map(function(l){var p=progOf(l),h=hueOf(p);
      return '<div class="cl-row" data-act="open" data-src="'+esc(l.src)+'" tabindex="0" role="button"><div class="cl-name"><b>'+esc(l.name)+'</b><small>'+esc((l.brand&&l.brand!=="—"?l.brand+" · ":"")+(STAGE[l.stage]||{}).label)+'</small></div>'+
        neonHTML(l)+'<span class="cl-pct" style="--h:'+h+'">'+p+'%</span></div>';}).join("")+'</div>';
}
function bars(rows,max,cls){
  return '<div class="bars">'+rows.map(function(r){
    var w=max?Math.max(r[1]?2:0,Math.round(r[1]/max*100)):0;
    return '<div class="bar" title="'+esc(r[0])+': '+r[1]+'"><span>'+esc(r[0])+'</span><div class="track"><div class="fill '+(r[2]||cls)+'" style="width:'+w+'%"></div></div><em>'+r[1]+'</em></div>';}).join("")+'</div>';
}
function viewEmbudo(list){
  var cnt=STAGES.map(function(s){return [s.label,list.filter(function(l){return l.stage===s.id;}).length,s.grp];});
  var mx=Math.max.apply(null,cnt.map(function(c){return c[1];}).concat([1]));
  var segs=Object.keys(SEGS).map(function(k){return [SEGS[k],list.filter(function(l){return l.seg===k;}).length];});
  var smx=Math.max.apply(null,segs.map(function(c){return c[1];}).concat([1]));
  var tagc={};list.forEach(function(l){(l.tags||[]).forEach(function(t){tagc[t]=(tagc[t]||0)+1;});});
  var tags=Object.keys(tagc).sort(function(a,b){return tagc[b]-tagc[a]||a.localeCompare(b);}).slice(0,24);
  var ads={};list.forEach(function(l){var a=l.raw&&l.raw.anuncio;if(!a)return;var o=ads[a]||(ads[a]={n:0,proc:0,won:0,sum:0});o.n++;o.sum+=(l.score||0);
    if(l.stage==="ganado")o.won++;if(l.stage==="contacto"||l.stage==="reunion"||l.stage==="presupuesto")o.proc++;});
  var adKeys=Object.keys(ads).sort();
  var adHtml=adKeys.length?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Anuncio</th><th>Leads</th><th>En proceso</th><th>Ganados</th><th>Puntuación media</th></tr></thead><tbody>'+
    adKeys.map(function(k){var o=ads[k];return '<tr><td>'+esc(k)+'</td><td>'+o.n+'</td><td>'+o.proc+'</td><td>'+o.won+'</td><td>'+Math.round(o.sum/o.n)+'</td></tr>';}).join("")+'</tbody></table></div>'+
    '<p class="note" style="margin-top:8px">Cuenta los leads con anuncio de Meta (campaña 2). Con pocos leads por anuncio, no saques conclusiones todavía.</p>':
    '<p class="note">Sin datos de anuncio. Pulsa «Leer mis hojas de Google» en Importar para traerlos.</p>';
  return '<div class="charts"><div class="panel"><h3>Dónde está cada cliente</h3>'+bars(cnt,mx)+'</div>'+
    '<div class="panel"><h3>Tipo de cliente</h3>'+bars(segs,smx,"seg")+'<h3 style="margin-top:18px">Lo que más se repite</h3><div class="chips">'+
      tags.map(function(t){return '<button class="chip" data-act="tag" data-tag="'+esc(t)+'" title="Filtrar por esta etiqueta">'+esc(tagLabel(t))+' · '+tagc[t]+'</button>';}).join("")+'</div></div>'+
    '<div class="panel" style="grid-column:1/-1"><h3>Rendimiento por anuncio</h3>'+adHtml+'</div></div>';
}
function viewImportar(){
  var pend=all().filter(function(l){return !l.ai&&!l.dup;}).length;
  var b=S.busy,dis=b?" disabled":"";
  var noMcp=caps.mcp?"":'<p class="note">Esta vista no puede conectar con Google Sheets. Ábrelo desde claude.ai con la sesión iniciada.</p>';
  var noSample=caps.sample?"":'<p class="note">Esta vista no puede pedirle nada a Claude. Ábrelo desde claude.ai con la sesión iniciada.</p>';
  return '<div class="grid2">'+
   '<div class="panel" style="grid-column:1/-1"><h3>1. Subir leads de Meta</h3><p>Descarga tus leads desde Meta (Business Suite → Leads Center o Formularios instantáneos → elige el formulario → Descargar → CSV) y súbelos aquí. Se leen nombre, correo, teléfono, anuncio, plataforma y las respuestas del formulario. Los que ya tienes se saltan y los nuevos se clasifican con Claude.</p>'+
    '<label class="btn pri" for="metafile"'+(b?' style="opacity:.4;pointer-events:none"':"")+'>Elegir archivo CSV de Meta</label><input id="metafile" type="file" accept=".csv,.tsv,.txt,text/csv" hidden></div>'+
   '<div class="panel"><h3>2. Leer mis hojas de Google</h3><p>Trae los datos de contacto, anuncio, presupuesto y notas de la campaña 1 y la campaña 2, une los duplicados por correo o teléfono y añade los clientes nuevos que haya en las hojas.</p>'+
    '<button class="btn pri" data-act="import-sheets"'+(caps.mcp?dis:" disabled")+'>Leer mis hojas</button>'+noMcp+'</div>'+
   '<div class="panel"><h3>3. Clasificar pendientes</h3><p>'+(pend?'Hay <b>'+pend+'</b> clientes sin clasificar. Claude lee el resumen de cada uno y le pone tipo, fase, puntuación, etiquetas y próxima acción.':'Todos los clientes están clasificados.')+'</p>'+
    '<button class="btn pri" data-act="classify"'+(caps.sample&&pend?dis:" disabled")+'>Clasificar '+(pend||"")+' pendientes</button>'+noSample+'</div>'+
   '<div class="panel" style="grid-column:1/-1"><h3>4. Pegar clientes nuevos</h3><p>Pega una lista, un CSV o una nota suelta («Juan, marca de running, 200 camisetas, presupuesto 3k, 600 111 222»). Claude separa los clientes, los clasifica y los añade.</p>'+
    '<textarea id="paste" placeholder="Un cliente por línea, o texto libre…" aria-label="Clientes a pegar"></textarea><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn pri" data-act="paste"'+(caps.sample?dis:" disabled")+'>Clasificar y añadir</button>'+
    '<button class="btn" data-act="export"'+(caps.downloads?dis:" disabled")+'>Exportar todo a CSV</button></div></div>'+
  '</div>'+(S.log.length?'<pre class="log" aria-live="polite">'+esc(S.log.join("\n"))+'</pre>':"")+
  '<p class="note" style="margin-top:12px">Cada lectura de hojas escribe en la base de datos del CRM y cada clasificación usa tu cuota de Claude. Los permisos se piden la primera vez.</p>';
}
