/* ---------- responsable: por ahora lleva todos Lucas ---------- */
/* Valor por defecto para todos los clientes. Se puede cambiar uno a uno en la ficha (campo «resp»). */
var RESP_DEFAULT="Lucas",RESP_LIST=["Lucas","Marcos"];
S.resp="";
function respOf(l){return l.resp||RESP_DEFAULT;}
var nameLine0=nameLine;
nameLine=function(l){return nameLine0(l).replace(/<\/div>$/,'<span class="resp" title="Responsable">'+esc(respOf(l))+"</span></div>");};
var filtered0=filtered;
filtered=function(){return filtered0().filter(function(l){return !S.resp||respOf(l)===S.resp;});};
var drawerHTML1=drawerHTML;
drawerHTML=function(l){
  var h=drawerHTML1(l).replace(/<dt>Responsable<\/dt><dd>.*?<\/dd>/,"");
  var box='<div class="box"><h3>Responsable</h3><select class="stage" id="resp-sel" data-src="'+esc(l.src)+'" aria-label="Responsable">'+
    RESP_LIST.map(function(n){return "<option"+(n===respOf(l)?" selected":"")+">"+n+"</option>";}).join("")+"</select></div>";
  return h.replace('<div class="box"><h3>Fase</h3>',box+'<div class="box"><h3>Fase</h3>');
};
document.addEventListener("change",function(ev){
  var t=ev.target;
  if(t.id==="resp-sel")save(t.dataset.src,{resp:t.value}).then(function(ok){if(ok)toast("Responsable: "+t.value+".");});
  else if(t.id==="resp"){S.resp=t.value;schedule();}
});
