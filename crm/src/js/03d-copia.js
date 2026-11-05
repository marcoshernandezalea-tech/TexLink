/* ---------- copia de seguridad: descargar y restaurar los clientes ---------- */
function backupJSON(){return JSON.stringify({version:1,exportado:new Date().toISOString(),clientes:all()},null,1);}
async function exportBackup(){
  var dl=caps.downloads;if(!dl){toast("Esta vista no puede descargar archivos.");return;}
  try{await dl.save({filename:"texlink-crm-copia-"+todayISO()+".json",data:backupJSON()});toast("Copia descargada.");}
  catch(e){if(e&&e.code!=="declined")toast("No se pudo descargar la copia.");}
}
async function restoreBackup(file){
  if(!file||S.busy||!caps.db)return;
  S.busy="restore";S.log=["Leyendo "+file.name+"…"];schedule();
  try{
    var data=JSON.parse(await file.text()),list=Array.isArray(data)?data:data.clientes;
    if(!Array.isArray(list))throw {message:"El archivo no es una copia del CRM."};
    var n=0;
    for(var i=0;i<list.length;i++){
      var d=list[i];if(!d||!d.src||!/^[A-Za-z0-9_.~:@+-]{1,200}$/.test(d.src))continue;
      await caps.db.doc("leads/"+d.src).set(Object.assign({},d));n++;
      if(n%20===0)log("Restaurados "+n+" de "+list.length+"…");
    }
    log("Listo. "+n+(n===1?" cliente restaurado.":" clientes restaurados."));toast(n+(n===1?" cliente restaurado.":" clientes restaurados."));
  }catch(e){log("✕ "+((e&&e.message)||"No se pudo restaurar la copia."));}
  finally{S.busy="";schedule();}
}
function copiaPanel(){
  var b=S.busy;
  return '<div class="panel" style="margin-top:16px"><h3>5. Copia de seguridad</h3><p>Descarga todos los clientes (fases, notas, puntuaciones y referencias a tech packs) en un archivo, o restaura uno. Sirve para pasar los datos de un CRM a otro.</p>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="backup"'+(caps.downloads&&!b?"":" disabled")+'>Descargar copia</button>'+
    '<label class="btn" for="backupfile"'+(b?' style="opacity:.4;pointer-events:none"':"")+'>Restaurar copia</label><input id="backupfile" type="file" accept=".json,application/json" hidden></div></div>';
}
var viewImportar2=viewImportar;
viewImportar=function(){var h=viewImportar2();return S.tab==="importar"?h+copiaPanel():h;};
document.addEventListener("click",function(ev){var t=ev.target.closest("[data-act]");if(t&&t.dataset.act==="backup")exportBackup();});
document.addEventListener("change",function(ev){if(ev.target.id==="backupfile"){var f=ev.target.files&&ev.target.files[0];ev.target.value="";restoreBackup(f);}});
