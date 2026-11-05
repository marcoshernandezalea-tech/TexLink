/* ---------- versión web: sin Claude, con reglas propias ---------- */
/* Fuera de claude.ai no hay IA gratuita. La puntuación sigue tu hoja «Criterios» (presupuesto 40, unidades 30,
   tech pack 20, ya vende 10) y los mensajes salen de plantillas. */
function numsOf(s){return (String(s||"").match(/\d[\d.]*/g)||[]).map(function(x){return Number(x.replace(/\./g,""));}).filter(function(n){return n>0;});}
function ptsBudget(s){
  var t=String(s||""),n=numsOf(t);if(!n.length)return 0;
  if(/</.test(t))return 10;
  if(/>|más de/i.test(t)){var v=n[0];return v>=7000?40:v>=3000?35:v>=1500?25:10;}
  var hi=Math.max.apply(null,n);return hi<=1500?10:hi<=3000?25:hi<=7000?35:40;
}
function ptsUnits(s){
  var t=String(s||""),n=numsOf(t);if(!n.length)return 0;
  if(/>|más de/i.test(t))return 30;
  var hi=Math.max.apply(null,n);return hi<=100?10:hi<=300?20:hi<=500?25:30;
}
function ruleClassify(l){
  var r=l.raw||{},txt=((l.name||"")+" "+(l.brand||"")+" "+(r.notas||"")).toLowerCase();
  var pb=ptsBudget(r.presupuesto),pu=ptsUnits(r.unidades),tp=String(r.techpack||"");
  var pt=/^completo/i.test(tp)?20:/parcial/i.test(tp)?10:0,pv=/ya vende/i.test(r.tipo||"")?10:0;
  var tags=[];
  if(pb>=35)tags.push("presupuesto-alto");
  if(pu>=25)tags.push("volumen-alto");else if(pu>=20)tags.push("volumen-medio");
  if(pt===20)tags.push("tech-pack");else if(pt===10)tags.push("tech-pack-parcial");else if(/^no/i.test(tp))tags.push("sin-tech-pack");
  if(pv)tags.push("ya-vende");
  if(/proveedor/.test(txt)&&/(problema|tarda|falla|no ha|mal|calidad|plazos)/.test(txt))tags.push("dolor-proveedor");
  var seg="marca";
  if(/(merch|uniforme|empresa|corporativ)/.test(txt)){seg="merch";tags.push("merch-empresa");}
  else if(/(club|equipo|asociaci|comunidad|colegio)/.test(txt))seg="club";
  var partes=[];
  if(r.presupuesto)partes.push("Presupuesto "+r.presupuesto);
  if(r.unidades)partes.push(r.unidades+" uds");
  if(tp)partes.push("tech pack: "+tp.toLowerCase());
  var reason=partes.length?partes.join(", ")+(pv?". Ya vende.":"."):"Faltan datos para puntuarlo.";
  var next=pt===20?"Primer contacto: pedir el tech pack y enviar presupuesto.":"Primer contacto: enviar el formulario de proyecto y concretar cantidades.";
  return {seg:seg,score:Math.min(100,pb+pu+pt+pv),tags:tags.slice(0,6),reason:reason,next:next};
}
var classifyPending0=classifyPending;
classifyPending=async function(keep){
  if(caps.sample)return classifyPending0(keep);
  if(S.busy)return;
  var pend=all().filter(function(l){return !l.ai&&!l.dup;});if(!pend.length)return;
  S.busy="classify";S.log=(keep?S.log:[]).concat(["Puntuando "+pend.length+(pend.length===1?" cliente":" clientes")+" con tus criterios…"]);schedule();
  var done=0;
  try{
    for(var i=0;i<pend.length;i++){
      var l=pend[i],c=ruleClassify(l);
      var patch={seg:c.seg,score:c.score,tags:c.tags,reason:c.reason,next:(l.next&&l.next!=="Primer contacto")?l.next:c.next,ai:true};
      if(await save(l.src,patch))done++;
      if((i+1)%10===0)log("Puntuados "+(i+1)+" de "+pend.length+"…");
    }
    log("Listo: "+done+(done===1?" cliente puntuado.":" clientes puntuados."));toast("Puntuación terminada.");
  }catch(e){log("✕ No se pudo puntuar"+(done?" (se guardaron "+done+")":"")+".");}
  finally{S.busy="";schedule();}
};
var importMeta0=importMeta;
importMeta=async function(file){
  var antes=all().length;
  await importMeta0(file);
  if(all().length>antes){await new Promise(function(r){setTimeout(r,200);});classifyPending(true);}
};
pasteImport=async function(){
  var ta=$("#paste");if(!ta||S.busy||!caps.db)return;
  var lineas=ta.value.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
  if(!lineas.length){toast("Pega primero algún cliente.");return;}
  S.busy="paste";S.log=["Añadiendo "+lineas.length+(lineas.length===1?" cliente…":" clientes…")];schedule();
  var n=0;
  try{
    var stamp=Date.now().toString(36);
    for(var i=0;i<lineas.length;i++){
      var ln=lineas[i],mail=(ln.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/)||[""])[0],tel=(ln.match(/\+?\d[\d\s().-]{7,}\d/)||[""])[0].trim();
      var resto=ln.replace(mail,"").replace(tel,""),campos=resto.split(/[,;\t]/).map(function(x){return x.trim();}).filter(Boolean);
      var nombre=campos.shift()||mail||tel;
      var raw={email:mail.toLowerCase(),tel:tel,notas:campos.join("; ")};Object.keys(raw).forEach(function(k){if(!raw[k])delete raw[k];});
      var doc={src:"p-"+stamp+"-"+i,camp:3,name:nombre.slice(0,120),brand:"",seg:"marca",stage:"nuevo",score:0,tags:[],reason:"",next:"Primer contacto",sug:"",ai:false,raw:raw};
      await caps.db.doc("leads/"+doc.src).set(doc);n++;
    }
    log("Añadidos "+n+(n===1?" cliente.":" clientes."));ta.value="";toast(n+(n===1?" cliente añadido.":" clientes añadidos."));
  }catch(e){log("✕ No se pudo añadir.");}
  finally{S.busy="";schedule();}
  if(n)classifyPending(true);
};
function plantilla(l){
  var nombre=String(l.name||"").split(" ")[0]||"",marca=l.brand&&l.brand!=="—"?" de "+l.brand:"",yo=respOf(l);
  var hola="Hola "+nombre+", soy "+yo+" de TexLink. ";
  switch(l.stage){
    case "nuevo":return hola+"Vi que pediste información para fabricar ropa"+marca+". ¿Tienes un momento esta semana para contarme qué prendas y cuántas unidades tienes en mente?";
    case "contacto":return hola+"Te escribo para retomar lo que hablamos sobre tu proyecto"+marca+". ¿Pudiste ver lo que te mandé? Si quieres, lo repasamos en una llamada corta.";
    case "reunion":return hola+"Quedamos en vernos para hablar de tu proyecto"+marca+". ¿Te sigue encajando la fecha o prefieres cambiarla?";
    case "presupuesto":return hola+"¿Pudiste revisar el presupuesto que te enviamos"+marca+"? Si tienes dudas con cantidades o prendas, lo ajustamos.";
    case "ganado":return hola+"¿Qué tal fue el pedido"+marca+"? Si quieres repetir o añadir prendas, dime y lo preparamos.";
    default:return hola+"Hace un tiempo hablamos sobre tu proyecto de ropa"+marca+". ¿Sigue en marcha? Si quieres retomarlo, dime qué te gustaría fabricar y lo vemos.";
  }
}
draftMsg=async function(src){var l=S.leads.get(src);if(!l)return;S.draft={src:src,text:plantilla(l),busy:false};schedule();};
var viewImportar3=viewImportar;
viewImportar=function(){
  var h=viewImportar3();if(S.tab!=="importar")return h;
  var pend=all().filter(function(l){return !l.ai&&!l.dup;}).length;
  return h
    .replace('<p class="note">Esta vista no puede pedirle nada a Claude. Ábrelo desde claude.ai con la sesión iniciada.</p>',"")
    .replace(/(data-act="classify")( disabled)?/,pend&&!S.busy?"$1":"$1 disabled")
    .replace(/(data-act="paste")( disabled)?/,S.busy?"$1 disabled":"$1")
    .replace("Los que ya tienes se saltan y los nuevos se clasifican con Claude.","Los que ya tienes se saltan y los nuevos se puntúan con tus criterios.")
    .replace("Claude lee el resumen de cada uno y le pone tipo, fase, puntuación, etiquetas y próxima acción.","Se puntúan con tus criterios (presupuesto, unidades, tech pack y si ya venden) y se etiquetan.")
    .replace(/Pega una lista, un CSV o una nota suelta[^<]*/,"Pega un cliente por línea: nombre, correo, teléfono y notas, separados por comas. Se añaden y se puntúan.")
    .replace("Cada lectura de hojas escribe en la base de datos del CRM y cada clasificación usa tu cuota de Claude. Los permisos se piden la primera vez.","Cada lectura de hojas escribe en la base de datos del CRM.");
};
var drawerHTML2=drawerHTML;
drawerHTML=function(l){return drawerHTML2(l).replace(/(data-act="draft"[^>]*?) disabled/,"$1");};
