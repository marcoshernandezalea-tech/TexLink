/* ---------- fichas de tech pack que llegan del formulario ---------- */
/* Se guardan aparte (una por envío) y aparecen solas en Tech packs → Guardados, enganchadas al cliente. */
S.fichas=new Map();S.fichasLoaded=false;S.fichasOpen={};S.fichaImgs={};
var ESTADOS_TP=[["nuevo","Nuevo"],["presupuestado","Presupuestado"],["mockup","Mockup"],["produccion","Producción"]];
var fichasSince=0;
function labelEstado(e){for(var i=0;i<ESTADOS_TP.length;i++)if(ESTADOS_TP[i][0]===e)return ESTADOS_TP[i][1];return e;}
function fichasList(){return Array.from(S.fichas.values()).sort(function(a,b){return String(b.enviado).localeCompare(String(a.enviado));});}
function fichasDe(src){return fichasList().filter(function(f){return f.clienteId===src;});}
function fechaHora(iso){var d=new Date(iso);if(isNaN(d))return"";return ("0"+d.getDate()).slice(-2)+"/"+("0"+(d.getMonth()+1)).slice(-2)+"/"+d.getFullYear()+" "+("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);}
function telBonito(t){t=String(t||"");return /^34\d{9}$/.test(t)?"+34 "+t.slice(2,5)+" "+t.slice(5,7)+" "+t.slice(7,9)+" "+t.slice(9):"+"+t;}
function esEditor(){return !!(window.CRM_API&&window.CRM_API.role()==="editor");}

var tpHas0=tpHas;
tpHas=function(l){return tpHas0(l)||(Number(l.tpForm)||0)>0;};

async function cargarFichas(primera){
  if(!window.CRM_API||!caps.db)return;
  try{
    var r=await window.CRM_API.call("tp_list",{since:primera?0:fichasSince});
    if(r.max>fichasSince)fichasSince=r.max;
    var nuevas=0;
    r.docs.forEach(function(d){if(!S.fichas.has(d.id)&&S.fichasLoaded)nuevas++;S.fichas.set(d.id,d.doc);});
    S.fichasLoaded=true;
    if(nuevas)toast(nuevas===1?"Ha llegado una ficha nueva del formulario.":"Han llegado "+nuevas+" fichas nuevas del formulario.");
    schedule();
  }catch(e){}
}
var arranqueFichas=setInterval(function(){
  if(!caps.db)return;
  clearInterval(arranqueFichas);cargarFichas(true);
  setInterval(function(){if(!document.hidden)cargarFichas(false);},20000);
},400);

async function cambiarEstadoFicha(id,estado){
  var f=S.fichas.get(id);if(!f||f.estado===estado)return;
  if(!esEditor()){toast("Tu usuario solo puede mirar.");schedule();return;}
  S.fichas.set(id,Object.assign({},f,{estado:estado}));schedule();
  try{await window.CRM_API.call("tp_update",{id:id,patch:{estado:estado}});toast("Estado: "+labelEstado(estado)+".");}
  catch(e){S.fichas.set(id,f);toast("No se pudo cambiar el estado.");schedule();}
}
async function cargarImagenesFicha(id){
  var f=S.fichas.get(id);if(!f||S.fichaImgs[id])return;
  var urls=[],n=(f.imagenes||[]).length;
  S.fichaImgs[id]={loading:true,urls:[]};schedule();
  for(var i=0;i<n;i++){
    try{
      var r=await window.CRM_API.call("download",{id:f.imagenes[i].id},120000);
      var bin=atob(r.b64),u=new Uint8Array(bin.length);for(var k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
      urls.push(URL.createObjectURL(new Blob([u],{type:r.mime||f.imagenes[i].tipo||"image/jpeg"})));
    }catch(e){urls.push("");}
    S.fichaImgs[id]={loading:i<n-1,urls:urls.slice()};schedule();
  }
}

function filaDato(k,v){return v===""||v==null||v==="—"?"":'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>';}
function fichaHTML(f){
  var cli=S.leads.get(f.clienteId),nombre=cli?cli.name:f.clienteNombre,c=f.campos||{},t=c.tallas||{};
  var imgs=S.fichaImgs[f.id],n=(f.imagenes||[]).length,ed=esEditor();
  var opciones=ESTADOS_TP.map(function(e){return '<option value="'+e[0]+'"'+(e[0]===f.estado?" selected":"")+'>'+e[1]+'</option>';}).join("");
  var im=!n?'<span class="note">Sin imágenes de referencia</span>':!imgs?'<button class="btn sm" data-act="ficha-imgs" data-id="'+esc(f.id)+'">Ver imágenes de referencia ('+n+')</button>':
    '<div class="fi-imgs">'+imgs.urls.map(function(u){return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener" data-act="x"><img src="'+esc(u)+'" alt="Imagen de referencia"></a>':'<span class="fi-miss">No se pudo cargar</span>';}).join("")+(imgs.loading?'<span class="note">Cargando…</span>':"")+'</div>';
  var tallas="S "+(t.s||0)+" · M "+(t.m||0)+" · L "+(t.l||0)+" · XL "+(t.xl||0)+" · XXL "+(t.xxl||0);
  return '<article class="ficha"><div class="fi-top"><div class="fi-who"><b>'+esc(nombre)+'</b>'+(f.nuevoCliente?'<span class="chip">cliente nuevo</span>':"")+(f.referencia?'<span class="chip ref">'+esc(f.referencia)+'</span>':"")+
    '<small>'+esc(fechaHora(f.enviado))+' · '+esc(telBonito(f.telefono))+'</small></div>'+
    '<div class="fi-estado"><select class="fi-sel e-'+esc(f.estado)+'" data-field="ficha-estado" data-id="'+esc(f.id)+'" aria-label="Estado de la ficha"'+(ed?"":" disabled")+'>'+opciones+'</select></div></div>'+
    '<div class="fi-datos"><span><i>Prenda</i>'+esc(f.tipoPrenda||"—")+'</span><span><i>Unidades</i>'+esc(f.unidades||0)+'</span><span><i>Entrega</i>'+esc(c.fechaEntrega||"—")+'</span></div>'+
    '<div class="fi-img-zone">'+im+'</div>'+
    '<details data-fid="'+esc(f.id)+'"'+(S.fichasOpen[f.id]?" open":"")+'><summary>Ver la ficha completa</summary><dl class="kv">'+
      filaDato("Reunión",c.fechaReunion)+filaDato("Composición",c.composicion)+filaDato("Gramaje",c.gramaje)+filaDato("Corte",c.corte)+filaDato("Color",c.color)+
      filaDato("Branding",c.branding)+filaDato("Etiqueta cuello",c.etiquetaCuello)+filaDato("Tallas",tallas)+filaDato("Notas de tallaje",c.notasTallaje)+
      filaDato("Envío",c.modalidadEnvio)+filaDato("Notas",c.notas)+filaDato("Teléfono original",f.telefonoOriginal)+'</dl></details>'+
    (cli?'<div class="fi-acc"><button class="btn sm" data-act="open" data-src="'+esc(cli.src)+'">Abrir cliente</button></div>':"")+'</article>';
}

var viewTechpacks1=viewTechpacks;
viewTechpacks=function(list){
  var set=new Set(list),fichas=fichasList().filter(function(f){var l=S.leads.get(f.clienteId);return !l||set.has(l);});
  var manual=list.filter(function(l){return tpFiles(l).length>0||tpLinks(l).length>0;}).sort(byScore);
  var falta=list.filter(function(l){return !tpHas(l)&&tpSays(l);}).sort(byScore);
  var sin=list.length-list.filter(tpHas).length-falta.length;
  var tile=function(n,t,c){return '<div class="kpi '+c+'"><b>'+n+'</b><span>'+t+'</span></div>';};
  return '<div class="kpis" style="margin-bottom:18px">'+tile(fichas.length,"Fichas del formulario","good")+tile(fichas.filter(function(f){return f.estado==="nuevo";}).length,"Nuevas","")+tile(falta.length,"Dicen tenerlo y falta el archivo","")+tile(sin,"Sin tech pack","")+'</div>'+
    '<p class="note" style="margin:0 0 14px">Las fichas del formulario llegan solas y se enganchan al cliente por su teléfono. Cambia su estado según avance el trabajo. Los archivos que subas a mano a un cliente salen más abajo.</p>'+
    section("Guardados · fichas del formulario","Las más recientes, primero.",fichas.map(fichaHTML),S.fichasLoaded?"Todavía no ha llegado ninguna ficha del formulario.":"Cargando fichas…")+
    section("Guardados · archivos y enlaces","Clientes con archivo o enlace subido a mano.",manual.map(tpRow),"No hay archivos subidos a mano.")+
    section("Falta guardar el archivo","Dicen tener tech pack, pero no hay nada guardado. Los de más puntuación, primero.",falta.map(tpRow),"No falta ningún tech pack en este filtro.");
};

var drawerHTML3=drawerHTML;
drawerHTML=function(l){
  var h=drawerHTML3(l),fs=fichasDe(l.src);
  if(l.camp===5)h=h.replace("Añadido a mano","Entró por el formulario");
  if(!fs.length)return h;
  var box='<div class="box"><h3>Fichas del formulario</h3>'+fs.map(function(f){
    return '<div class="tp-item"><b>'+esc(fechaHora(f.enviado).slice(0,10))+'</b><span>'+esc(f.tipoPrenda||"—")+' · '+esc(f.unidades||0)+' uds'+(f.referencia?" · "+esc(f.referencia):"")+'</span><span class="chip">'+esc(labelEstado(f.estado))+'</span></div>';}).join("")+
    '<div class="tp-actions"><button class="btn sm" data-act="tab" data-tab="techpacks">Ver en Tech packs</button></div></div>';
  return h.replace('<div class="box" id="tp-box">',box+'<div class="box" id="tp-box">');
};
var campTag0=campTag;
campTag=function(l){return l.camp===5?'<span class="camp">Form</span>':campTag0(l);};
(function(){var sel=document.getElementById("camp");if(sel&&!sel.querySelector('option[value="5"]')){var o=document.createElement("option");o.value="5";o.textContent="Formulario";sel.appendChild(o);}})();

document.addEventListener("click",function(ev){var t=ev.target.closest&&ev.target.closest("[data-act]");if(t&&t.dataset.act==="ficha-imgs")cargarImagenesFicha(t.dataset.id);});
document.addEventListener("change",function(ev){var t=ev.target;if(t.dataset&&t.dataset.field==="ficha-estado")cambiarEstadoFicha(t.dataset.id,t.value);});
document.addEventListener("toggle",function(ev){var d=ev.target;if(d&&d.dataset&&d.dataset.fid)S.fichasOpen[d.dataset.fid]=d.open;},true);

/* Los clientes nuevos del formulario se puntúan solos con tus criterios en cuanto un editor abre el CRM. */
setInterval(function(){
  if(!caps.db||S.busy||!esEditor())return;
  if(all().some(function(l){return l.camp===5&&!l.ai&&!l.dup;}))classifyPending(true);
},10000);
