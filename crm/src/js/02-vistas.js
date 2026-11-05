/* ---------- ficha ---------- */
function waLink(tel){var d=digits(tel);if(!d)return"";if(d.length===9)d="34"+d;return "https://wa.me/"+d;}
function copyBtn(v){return v?'<button class="btn sm copy" data-act="copy" data-v="'+esc(v)+'">Copiar</button>':"";}
function drawerHTML(l){
  var r=l.raw||{},st=STAGE[l.stage]||STAGE.nuevo;
  var rows=[["Fase",""],["Correo",r.email?esc(r.email)+copyBtn(r.email):""],["Teléfono",r.tel?esc(r.tel)+copyBtn(r.tel)+(waLink(r.tel)&&!r.telBad?' <a class="btn sm" target="_blank" rel="noopener" href="'+esc(waLink(r.tel))+'">WhatsApp</a>':""):""],
    ["Ciudad",esc(r.ciudad)],["Alta",esc(r.fecha)],["Anuncio",esc(r.anuncio)],["Plataforma",esc(r.plataforma)],["Producto",esc(r.producto||r.tipo)],["Unidades",esc(r.unidades)],
    ["Presupuesto",esc(r.presupuesto)],["Tech pack",esc(r.techpack)],["Responsable",esc(r.responsable)],["Proveedor",esc(r.proveedor)],["Web o IG",esc(r.web)]].filter(function(x){return x[1];});
  var imported=!!l.raw;
  var dd=state_draft(l);
  return '<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Ficha de '+esc(l.name)+'">'+
   '<div class="dh"><div><h2>'+esc(l.name)+'</h2><div class="muted">'+esc(l.brand&&l.brand!=="—"?l.brand+" · ":"")+esc(SEGS[l.seg]||"")+" · "+(l.camp===1?"Campaña 1":l.camp===2?"Campaña 2":l.camp===4?"Importado de Meta":"Añadido a mano")+'</div></div><button class="btn" data-act="close" aria-label="Cerrar">Cerrar</button></div>'+
   '<div class="box"><h3>Fase</h3><select class="stage" id="stage-sel" data-field="stage" data-src="'+esc(l.src)+'" aria-label="Fase">'+STAGES.map(function(s){return '<option value="'+s.id+'"'+(s.id===l.stage?" selected":"")+'>'+s.label+'</option>';}).join("")+'</select>'+'<div style="margin-top:14px"><span class="lbl">Camino al cierre</span> '+progOf(l)+'%</div><div style="margin-top:8px">'+neonHTML(l)+'</div>'+
     (l.sug&&l.sug!==l.stage&&STAGE[l.sug]?'<div class="sugg"><b>Sugerencia:</b> pasar a «'+STAGE[l.sug].label+'». '+esc(l.sugWhy||"")+'<div style="margin-top:6px;display:flex;gap:6px"><button class="btn sm pri" data-act="accept" data-src="'+esc(l.src)+'">Aceptar</button><button class="btn sm" data-act="dismiss" data-src="'+esc(l.src)+'">Ignorar</button></div></div>':"")+'</div>'+
   '<div class="box"><h3>Clasificación</h3><div style="display:flex;align-items:center;gap:14px">'+scoreHTML(l.score)+'<div style="flex:1"><div class="meter"><i style="width:'+(l.score||0)+'%"></i></div></div></div>'+
     '<p style="margin:10px 0 0">'+esc(l.reason||"Sin clasificar todavía.")+'</p>'+(l.next&&l.next!=="—"?'<p style="margin:8px 0 0"><span class="lbl">Siguiente</span>'+esc(l.next)+'</p>':"")+chips(l,12)+'</div>'+
   (r.telBad?'<div class="warnbox">El teléfono de la hoja parece corrupto («'+esc(r.tel)+'»). Corrígelo en la hoja y vuelve a leerla.</div>':"")+
   '<div class="box"><h3>Contacto y datos</h3>'+(imported?'<dl class="kv">'+rows.map(function(x){return '<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>';}).join("")+'</dl>':'<p class="note" style="margin:0">Aún no se han traído sus datos de contacto. Ve a Importar y pulsa «Leer mis hojas».</p>')+'</div>'+
   (r.notas||r.reuniones?'<div class="box"><h3>Notas de la hoja</h3><p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere">'+esc([r.notas,r.reuniones&&"Reuniones: "+r.reuniones,r.proxima&&"Próxima acción: "+r.proxima].filter(Boolean).join("\n"))+'</p></div>':"")+
   '<div class="box"><h3>Mis notas</h3><textarea id="note" data-field="note" data-src="'+esc(l.src)+'" placeholder="Lo que hablaste, lo que prometiste…" aria-label="Mis notas">'+esc(l.note||"")+'</textarea>'+
     '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="touch" data-src="'+esc(l.src)+'">Contactado hoy</button>'+
     '<button class="btn pri" data-act="draft" data-src="'+esc(l.src)+'"'+(caps.sample&&!S.busy?"":" disabled")+'>Redactar mensaje</button></div></div>'+dd+'</aside>';
}
function state_draft(l){
  var d=S.draft;if(!d||d.src!==l.src)return"";
  return '<div class="box"><h3>Borrador de mensaje</h3>'+(d.err?'<p class="warnbox">'+esc(d.err)+'</p>':'<textarea id="draft-text" aria-label="Borrador">'+esc(d.text||"")+'</textarea>'+
   (d.text&&!d.busy?'<div style="margin-top:8px"><button class="btn sm" data-act="copy-draft">Copiar mensaje</button></div>':'<p class="note">'+(d.busy?"Claude está escribiendo…":"")+'</p>'))+'</div>';
}

/* ---------- render ---------- */
var raf=0;function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;render();});}
var drawerKey="",lastOpen=null;
function render(){
  var list=filtered();
  $("#sub").textContent=S.loaded?(all().filter(function(l){return !l.dup;}).length+" clientes · "+(all().filter(function(l){return l.dup;}).length)+" duplicados ocultos"):(S.failed?"No se pueden leer los datos":"Cargando clientes…");
  $("#kpis").innerHTML=kpis(list);
  var ls=$("#logo-slot"),lk=((S.brand&&S.brand.logo)||"").length+(S.brand&&S.brand.plate?"p":"");if(ls&&ls.dataset.k!==lk){ls.innerHTML=logoHTML();ls.dataset.k=lk;}
  var counts={hoy:list.filter(function(l){return l.stage==="nuevo";}).length};
  $("#tabs").innerHTML=TABS.map(function(t){return '<button class="tab" role="tab" data-act="tab" data-tab="'+t[0]+'" aria-selected="'+(S.tab===t[0])+'">'+t[1]+(t[0]==="hoy"&&counts.hoy?'<span class="n">'+counts.hoy+'</span>':"")+'</button>';}).join("");
  var v=$("#view");
  if(!caps.db&&S.loaded===false&&S.failed){v.innerHTML='<div class="empty"><b>No puedo leer los clientes</b>Abre el CRM desde claude.ai con la sesión iniciada.</div>';}
  else if(!S.loaded){v.innerHTML='<div class="empty"><b>Cargando clientes…</b>Un momento.</div>';}
  else if(S.leads.size===0&&S.tab!=="importar"){v.innerHTML='<div class="empty"><b>Todavía no hay clientes</b>Ve a Importar y pulsa «Leer mis hojas» para traer tus campañas.</div>';}
  else{
    var keepScroll=S.tab==="tablero"?($(".board-wrap")||{}).scrollLeft:0;
    v.innerHTML=S.tab==="hoy"?viewHoy(list):S.tab==="tablero"?viewTablero(list):S.tab==="cierre"?viewCierre(list):S.tab==="embudo"?viewEmbudo(list):viewImportar();
    if(S.tab==="tablero"&&keepScroll&&$(".board-wrap"))$(".board-wrap").scrollLeft=keepScroll;
  }
  var root=$("#drawer-root"),l=S.open&&S.leads.get(S.open);
  var key=l?JSON.stringify([l,S.draft,S.busy,!!caps.sample]):"";
  if(key!==drawerKey){
    drawerKey=key;root.innerHTML=l?drawerHTML(l):"";
    var dr=root.querySelector(".drawer");if(dr&&S.open!==lastOpen)dr.classList.add("in");
    lastOpen=l?S.open:null;
  }
}

/* ---------- importar hojas ---------- */
function log(m){S.log.push(m);schedule();}
function mcpMsg(e){
  var c=e&&e.code;
  return c==="needs_reauth"?"Hay que volver a conectar Google Sheets en Ajustes → Conectores de claude.ai.":
    c==="server_not_connected"?"Google Sheets no está conectado en tu cuenta. Añádelo en Ajustes → Conectores de claude.ai.":
    c==="not_in_manifest"||c==="consent_required"?"No has permitido que esta página lea Google Sheets.":
    c==="approval_required"?"Hace falta tu aprobación para leer las hojas. Vuelve a pulsar el botón y acepta.":
    "No se pudo leer: "+((e&&e.message)||"error desconocido");
}
async function readRange(mcp,s){
  var order=[{spreadsheetId:s.id,range:s.range},{spreadsheet_id:s.id,range:s.range}];
  try{var d=await mcp.describeTool("Google Sheets","get_values");var keys=Object.keys((d.inputSchema&&d.inputSchema.properties)||{});if(keys.indexOf("spreadsheet_id")>=0)order.reverse();}catch(e){}
  var last;
  for(var i=0;i<order.length;i++){
    try{
      var r=await mcp.callTool("Google Sheets","get_values",order[i]);
      var p=r.payload;if(typeof p==="string"){try{p=JSON.parse(p);}catch(e){}}
      var vals=(p&&p.values)||(r.structuredContent&&r.structuredContent.values);
      if(Array.isArray(vals))return vals;
      last={code:"upstream_error",message:"La hoja no devolvió filas."};
    }catch(e){last=e;if(e.code!=="tool_error"&&e.code!=="bad_request")break;}
  }
  throw last;
}
function parseSheet(values,camp){
  var hi=-1;
  for(var i=0;i<Math.min(values.length,20);i++){var r=(values[i]||[]).map(function(x){return String(x||"").trim().toUpperCase();});if(r.indexOf("NOMBRE")>=0&&r.indexOf("CORREO")>=0){hi=i;break;}}
  if(hi<0)throw {code:"bad_sheet",message:"No encuentro la fila de cabeceras (NOMBRE y CORREO) en la campaña "+camp+"."};
  var col={};values[hi].forEach(function(h,idx){h=String(h||"").trim().toUpperCase();if(!h)return;while(h in col)h+="_2";col[h]=idx;});
  var out=[];
  for(var j=hi+1;j<values.length;j++){
    var row=values[j]||[];
    var g=function(){for(var a=0;a<arguments.length;a++){var n=arguments[a];if(n in col){var v=row[col[n]];if(v!==undefined&&String(v).trim()!=="")return String(v).trim();}}return"";};
    var name=g("NOMBRE");if(!name)continue;
    var email=g("CORREO");if(email.indexOf("@")<0||/\s/.test(email))email=email.indexOf("@")>=0?email.split(/\s/)[0]:"";
    var tel=g("TELÉFONO","NUMERO").replace(/^p:\s*/i,"").trim();
    var raw={fecha:g("FECHA ALTA"),plataforma:g("PLATAFORMA"),anuncio:g("ANUNCIO"),tipo:g("TIPO DE PROYECTO"),producto:g("PRODUCTO"),unidades:g("UNIDADES"),
      presupuesto:g("PRESUPUESTO"),techpack:g("TECH PACK"),web:g("WEB / IG"),prioridad:g("PRIORIDAD"),estado:g("ESTADO"),contactado:g("CONTACTADO"),
      responsable:g("RESPONSABLE"),notas:g("NOTAS","DESCRIPCIÓN"),proxima:g("PRÓXIMA ACCIÓN"),email:email,tel:tel,ciudad:g("CIUDAD"),proveedor:g("PROVEEDOR","PROVEEDORES"),reuniones:g("REUNIONES"),
      telBad:!!tel&&(/[a-z]/i.test(tel)||digits(tel).length<7)};
    Object.keys(raw).forEach(function(k){if(raw[k]===""||raw[k]===false)delete raw[k];});
    out.push({camp:camp,row:j+1,src:"c"+camp+"-r"+(j+1),name:name,brand:g("MARCA"),raw:raw});
  }
  return out;
}
function keyOf(r){var e=(r.email||"").toLowerCase();if(e.indexOf("@")>0)return "e:"+e;var d=digits(r.tel);return d.length>=9&&!r.telBad?"t:"+d.slice(-9):"";}
async function importSheets(){
  var mcp=caps.mcp;if(!mcp||S.busy)return;
  S.busy="import";S.log=["Leyendo tus hojas de Google…"];schedule();
  try{
    var parsed=[];
    for(var i=0;i<SHEETS.length;i++){
      var s=SHEETS[i];log("Campaña "+s.camp+": leyendo…");
      var vals=await readRange(mcp,s);var rows=parseSheet(vals,s.camp);parsed=parsed.concat(rows);log("Campaña "+s.camp+": "+rows.length+" filas con nombre.");
    }
    parsed.sort(function(a,b){return (b.camp-a.camp)||(a.row-b.row);});
    var seen=new Map(),created=0,updated=0,dups=0,same=0;
    for(var k=0;k<parsed.length;k++){
      var p=parsed[k],ex=S.leads.get(p.src),key=keyOf(p.raw),dupOf="";
      if(key){if(seen.has(key))dupOf=seen.get(key);else seen.set(key,p.src);}
      if(dupOf)dups++;
      if(ex){
        var patch={};
        if(JSON.stringify(ex.raw||null)!==JSON.stringify(p.raw))patch.raw=p.raw;
        if(dupOf&&!ex.dup)patch.dup=dupOf;
        if(Object.keys(patch).length){if(await save(p.src,patch))updated++;else throw {code:"write",message:"No se pudo escribir en la base de datos."};}else same++;
      }else{
        var est=SHEET_STAGE[String(p.raw.estado||"").toLowerCase()];
        var stage=p.camp===2?(est||"nuevo"):((p.raw.contactado||"").toUpperCase()==="NO"?"nuevo":"standby");
        var doc={src:p.src,camp:p.camp,name:p.name,brand:p.brand||"",seg:"marca",stage:stage,score:Number(p.raw.prioridad)||0,tags:[],reason:"",next:p.raw.proxima||"",sug:"",ai:false,raw:p.raw};
        if(dupOf)doc.dup=dupOf;
        try{await caps.db.doc("leads/"+p.src).set(doc);created++;}catch(e){throw {code:"write",message:"No se pudo crear "+p.name+"."};}
      }
      if((k+1)%20===0)log("Procesados "+(k+1)+" de "+parsed.length+"…");
    }
    log("Listo. "+created+(created===1?" nuevo, ":" nuevos, ")+updated+" actualizados, "+same+" sin cambios, "+dups+(dups===1?" duplicado detectado.":" duplicados detectados."));
    if(created)log(created===1?"Hay 1 cliente sin clasificar: pulsa «Clasificar pendientes».":"Hay "+created+" clientes sin clasificar: pulsa «Clasificar pendientes».");
    toast("Hojas importadas.");
  }catch(e){log("✕ "+(e&&e.code==="write"||e&&e.code==="bad_sheet"?e.message:mcpMsg(e)));}
  finally{S.busy="";schedule();}
}
