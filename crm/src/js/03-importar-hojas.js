/* ---------- clasificar con Claude ---------- */
function sampleMsg(e){
  var c=e&&e.code;
  return c==="not_granted"?"No has permitido que esta página use Claude.":
    c==="rate_limited"?"Demasiadas peticiones seguidas o has llegado a tu límite de uso. Espera un poco y reintenta.":
    c==="invalid_json"?"Claude devolvió un formato que no puedo leer. Vuelve a pulsar el botón.":
    c==="cancelled"?"Cancelado.":c==="sampling_disabled"?"Claude no está disponible en tu cuenta.":
    "No se pudo completar con Claude ("+((e&&e.message)||"error")+"). Vuelve a pulsar.";
}
var VOCAB='seg: marca | merch | club | otro. stage: nuevo | contacto | reunion | presupuesto | ganado | standby | sinresp | poco | nocual | perdido. '+
  'tags: de 2 a 6 etiquetas cortas en minúsculas con guiones (ejemplos: dolor-proveedor, presupuesto-alto, volumen-alto, tech-pack, sin-tech-pack, ya-vende, sensible-precio, visita-presencial, form-pendiente, sin-respuesta, merch-empresa, reactivar, futuro, fuera-de-perfil).';
function leadForPrompt(l){var r=l.raw||{};return {src:l.src,nombre:l.name,marca:l.brand||r.marca||"",tipo:r.tipo||"",producto:r.producto||"",unidades:r.unidades||"",presupuesto:r.presupuesto||"",techpack:r.techpack||"",
  estado_en_hoja:r.estado||"",contactado:r.contactado||"",notas:String(r.notas||"").slice(0,500),reuniones:r.reuniones||"",ciudad:r.ciudad||"",alta:r.fecha||""};}
function norm(o){
  var tags=Array.isArray(o.tags)?o.tags:[];
  return {seg:SEGS[o.seg]?o.seg:"otro",stage:STAGE[o.stage]?o.stage:"nuevo",score:Math.max(0,Math.min(100,Math.round(Number(o.score)||0))),
    tags:tags.map(function(t){return String(t).toLowerCase().replace(/[^a-z0-9áéíóúñ-]+/g,"-").replace(/^-+|-+$/g,"");}).filter(Boolean).slice(0,6),
    reason:String(o.reason||"").slice(0,400),next:String(o.next||"").slice(0,200)};
}
async function classifyPending(keep){
  var sample=caps.sample;if(!sample||S.busy)return;
  var pend=all().filter(function(l){return !l.ai&&!l.dup;});if(!pend.length)return;
  S.busy="classify";S.log=(keep?S.log:[]).concat(["Clasificando "+pend.length+(pend.length===1?" cliente":" clientes")+" con Claude…"]);schedule();
  var done=0;
  try{
    for(var i=0;i<pend.length;i+=10){
      var batch=pend.slice(i,i+10);
      var prompt="Eres el analista comercial de TexLink, una empresa que fabrica ropa personalizada (camisetas, sudaderas, polos, camisetas oversize) para marcas, clubes y empresas.\n"+CRITERIOS+"\n"+
        "Para cada cliente lee sus datos y notas y devuelve su clasificación. Reglas: no inventes datos que no estén; si las notas contradicen el estado de la hoja, manda el contenido de las notas; reason en una frase de máximo 30 palabras que explique la puntuación; next es la acción concreta siguiente.\n"+
        VOCAB+"\nResponde SOLO con un array JSON de objetos {src, seg, stage, score, tags, reason, next}, uno por cliente y en el mismo orden.\n\nCLIENTES:\n"+JSON.stringify(batch.map(leadForPrompt));
      var res=await sample.json(prompt,{modelTier:"default",cache:false});
      if(!Array.isArray(res))throw {code:"invalid_json",message:"no es un array"};
      for(var j=0;j<res.length;j++){
        var o=res[j],l=S.leads.get(o&&o.src);if(!l)continue;
        var n=norm(o),patch={seg:n.seg,score:n.score,tags:n.tags,reason:n.reason,next:n.next||l.next||"",ai:true};
        if(l.camp===2&&l.raw&&l.raw.estado){patch.stage=l.stage;if(n.stage!==l.stage){patch.sug=n.stage;patch.sugWhy="Claude lo ve distinto a la hoja.";}}
        else patch.stage=n.stage;
        if(await save(l.src,patch))done++;
      }
      log("Clasificados "+done+" de "+pend.length+"…");
    }
    log("Listo: "+done+" clientes clasificados.");toast("Clasificación terminada.");
  }catch(e){log("✕ "+sampleMsg(e)+(done?" (se guardaron "+done+")":""));}
  finally{S.busy="";schedule();}
}
async function pasteImport(){
  var sample=caps.sample,ta=$("#paste");if(!sample||!ta||S.busy)return;
  var text=ta.value.trim();if(!text){toast("Pega primero algún cliente.");return;}
  S.busy="paste";S.log=["Claude está leyendo el texto…"];schedule();
  try{
    var prompt="Eres el analista comercial de TexLink, una empresa que fabrica ropa personalizada para marcas, clubes y empresas.\n"+CRITERIOS+"\n"+
      "Del texto siguiente extrae CADA cliente distinto y clasifícalo. No inventes correos ni teléfonos: déjalos vacíos si no aparecen. "+VOCAB+"\n"+
      "Responde SOLO con un array JSON de objetos {name, brand, email, tel, ciudad, notas, seg, stage, score, tags, reason, next}.\n\nTEXTO:\n"+text.slice(0,20000);
    var res=await sample.json(prompt,{modelTier:"default",cache:false});
    if(!Array.isArray(res))throw {code:"invalid_json",message:"no es un array"};
    var stamp=Date.now().toString(36),n=0;
    for(var i=0;i<res.length;i++){
      var o=res[i];if(!o||!o.name)continue;var c=norm(o);
      var raw={email:String(o.email||""),tel:String(o.tel||""),ciudad:String(o.ciudad||""),notas:String(o.notas||"")};Object.keys(raw).forEach(function(k){if(!raw[k])delete raw[k];});
      var doc={src:"p-"+stamp+"-"+i,camp:3,name:String(o.name).slice(0,120),brand:String(o.brand||"").slice(0,120),seg:c.seg,stage:c.stage,score:c.score,tags:c.tags,reason:c.reason,next:c.next,sug:"",ai:true,raw:raw};
      await caps.db.doc("leads/"+doc.src).set(doc);n++;
    }
    log("Añadidos "+n+" clientes. Los verás con la etiqueta «Manual».");ta.value="";toast(n+" clientes añadidos.");
  }catch(e){log("✕ "+sampleMsg(e));}
  finally{S.busy="";schedule();}
}
async function draftMsg(src){
  var sample=caps.sample,l=S.leads.get(src);if(!sample||!l||S.busy)return;
  S.busy="draft";S.draft={src:src,text:"",busy:true};schedule();
  var prompt="Escribe un mensaje de WhatsApp en español de España, cercano y directo, de máximo 70 palabras, de parte de TexLink (fabricación de ropa personalizada) para este cliente. "+
    "Objetivo del mensaje: "+(l.next&&l.next!=="—"?l.next:"retomar la conversación")+". Usa su situación real si la conoces. No inventes precios, plazos, mínimos ni promesas. Termina con una pregunta concreta. Sin firma ni emojis. Devuelve solo el texto del mensaje.\n\nCLIENTE:\n"+JSON.stringify(leadForPrompt(l))+"\nResumen: "+(l.reason||"");
  try{var r=await sample(prompt,{modelTier:"quick",cache:false});S.draft={src:src,text:r.text.trim(),busy:false};}
  catch(e){S.draft={src:src,err:sampleMsg(e),busy:false};}
  finally{S.busy="";schedule();}
}
async function exportCsv(){
  var dl=caps.downloads;if(!dl)return;
  var cols=["id","campaña","nombre","marca","tipo","fase","puntuación","etiquetas","motivo","próxima acción","correo","teléfono","ciudad"];
  var q=function(v){v=String(v==null?"":v);return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  var lines=[cols.join(",")].concat(all().filter(function(l){return !l.dup;}).sort(byScore).map(function(l){var r=l.raw||{};
    return [l.src,l.camp,l.name,l.brand,SEGS[l.seg]||"",(STAGE[l.stage]||{}).label||"",l.score,(l.tags||[]).join(" "),l.reason,l.next,r.email,r.tel,r.ciudad].map(q).join(",");}));
  try{await dl.save({filename:"texlink-clientes-"+todayISO()+".csv",data:String.fromCharCode(0xFEFF)+lines.join("\n")});toast("Exportado.");}
  catch(e){if(e&&e.code!=="declined")toast("No se pudo exportar.");}
}

/* ---------- logo ---------- */
function logoHTML(){var b=S.brand;return b&&b.logo?'<img class="logo'+(b.plate?" plate":"")+'" alt="TexLink" src="'+esc(b.logo)+'">':'<span class="logo-add">+ Subir logo</span>';}
async function setLogo(file){
  if(!file||!caps.db)return;
  var url=URL.createObjectURL(file);
  try{
    var img=await new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im);};im.onerror=function(){rej(new Error("img"));};im.src=url;});
    if(!img.naturalWidth||!img.naturalHeight)throw new Error("size");
    var scale=Math.min(1,120/img.naturalHeight,480/img.naturalWidth),out="",plate=false;
    for(var t=0;t<4;t++){
      var w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
      var cv=document.createElement("canvas");cv.width=w;cv.height=h;var cx=cv.getContext("2d");cx.drawImage(img,0,0,w,h);
      out=cv.toDataURL("image/png");
      if(t===0){var d=cx.getImageData(0,0,w,h).data,sum=0,n=0;for(var i=0;i<d.length;i+=4){if(d[i+3]>40){sum+=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;n++;}}plate=n>0&&sum/n<0.45;}
      if(out.length<190000)break;scale*=0.7;
    }
    await caps.db.doc("config/brand").set({logo:out,plate:plate,name:file.name});
    toast("Logo actualizado.");
  }catch(e){toast("No se pudo usar esa imagen. Prueba con un PNG o un JPG.");}
  finally{URL.revokeObjectURL(url);}
}
