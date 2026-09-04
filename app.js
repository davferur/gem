
// ═══════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════
const STORE_KEY = "gem_cartera_mvp_v1";
let STATE = {
  creditos: [],       // cartera actual
  gestiones: [],      // bitácora
  promesas: [],       // compromisos
  pagos: [],          // pagos registrados
  importaciones: [],  // lotes
  vistas: [],         // vistas guardadas
  lastUpdate: null,
  plantillas: defaultPlantillas(),
  festivos: [],       // AAAA-MM-DD
  contadorInformes: {}, // por empresa, numeración electrónica del informe diario
  prospectos: [],     // pipeline comercial
  contadorRecibos: {}, // por empresa, numeración de recibos
  recibos: [],        // historial de recibos generados
};
let CURRENT = "dashboard";

function defaultPlantillas(){
  return {
    r3:"Hola *{nombre}* 👋\n\nLe recordamos de forma cordial que su cuota vence en *3 días* ⏳\n\n📅 Fecha de vencimiento: *{vence}*\n💰 Valor a pagar: *{cuota}*\n\nCon gusto le ayudamos a gestionarlo antes de esa fecha. 🙌\n\n_{empresa}_",
    r2:"Hola *{nombre}* 👋\n\nSu cuota vence en *2 días* ⏳\n\n📅 Fecha: *{vence}*\n💰 Valor: *{cuota}*\n\nQuedamos atentos para ayudarle con su pago. ✅\n\n_{empresa}_",
    r1:"Hola *{nombre}* 👋\n\n⚠️ *Mañana* vence su cuota:\n\n📅 Fecha: *{vence}*\n💰 Valor: *{cuota}*\n\nLe agradecemos su pago puntual. 🙏\n\n_{empresa}_",
    hoy:"Hola *{nombre}* 👋\n\n🔴 *Hoy* vence su cuota:\n\n💰 Valor: *{cuota}*\n\nPuede acercarse a nuestras oficinas o escribirnos por este medio para gestionarlo. 📲\n\n_{empresa}_",
    vencida:"Hola *{nombre}* 👋\n\n🔴 Su cuota se encuentra *vencida*:\n\n💰 Valor: *{cuota}*\n📅 Vencía: *{vence}*\n\nPor favor comuníquese con nosotros lo antes posible para ponerse al día y evitar mayores intereses de mora. 🙏\n\n_{empresa}_",
    promesa:"Hola *{nombre}* 👋\n\n✅ Confirmamos su *compromiso de pago*:\n\n💰 Valor: *{cuota}*\n📅 Fecha acordada: *{vence}*\n\n¡Gracias por su gestión y cumplimiento! 🙌\n\n_{empresa}_",
    comprobante:"Hola *{nombre}* 👋\n\n📎 ¿Nos puede compartir el *comprobante* de su último pago?\n\nEsto nos ayuda a mantener su historial al día. Gracias por su colaboración. 🙏\n\n_{empresa}_",
  };
}
function nombreEmpresa(entidad){
  if(entidad==="Coopfisol") return "Cooperativa Multiactiva Finanzas Solidarias COOPFISOL – GEM";
  return "Cooperativa Multiactiva Coomsertar – GEM";
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCIA
// ═══════════════════════════════════════════════════════════
// CONEXIÓN SUPABASE (con respaldo local automático)
// ═══════════════════════════════════════════════════════════
const SB_URL = "https://djsgzjcwnsctfaasvvom.supabase.co";
const SB_KEY = "sb_publishable_RCSrCDj96GqLh5EpTdxuZA_uAaIzjm_";
let sb = null;            // cliente supabase
let SB_OK = false;        // ¿conexión activa?
let SB_ROW_ID = "gem_estado_global"; // fila única donde vive el STATE compartido

function initSupabase(){
  try{
    if(window.supabase && SB_URL.startsWith("https://") && SB_KEY){
      sb = window.supabase.createClient(SB_URL, SB_KEY);
      return true;
    }
  }catch(e){ console.warn("Supabase no inicializó:", e); }
  return false;
}

// Guarda el STATE completo en Supabase (tabla estado_global) + respaldo local
let _saveTimer=null;
function save(){
  // respaldo local siempre (instantáneo, nunca se pierde nada)
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }catch(e){}
  // guardado en la nube (con debounce para no saturar)
  if(SB_OK && sb){
    clearTimeout(_saveTimer);
    _saveTimer=setTimeout(async ()=>{
      try{
        await sb.from("estado_global").upsert({id:SB_ROW_ID, data:STATE, actualizado:new Date().toISOString()});
      }catch(e){ console.warn("No se pudo guardar en la nube:", e); }
    }, 800);
  }
}

// Carga local (rápida) — la nube se carga aparte en loadCloud()
function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ STATE = Object.assign(STATE, JSON.parse(raw)); return true; }
  }catch(e){}
  return false;
}

async function loadCloud(){
  if(!SB_OK || !sb) return false;
  try{
    const {data, error} = await sb.from("estado_global").select("data").eq("id", SB_ROW_ID).maybeSingle();
    if(error){ console.warn("loadCloud error:", error); return false; }
    if(data && data.data){
      STATE = Object.assign(STATE, data.data);
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }catch(e){}
      return true;
    }
  }catch(e){ console.warn("loadCloud excepción:", e); }
  return false;
}

// ═══════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════
const fmt = n => (n==null||isNaN(n)) ? "—" : "$"+Math.round(n).toLocaleString("es-CO");
const fmtN = n => (n==null||isNaN(n)) ? "0" : Math.round(n).toLocaleString("es-CO");
const uid = () => "id"+Date.now()+Math.random().toString(36).slice(2,7);
const hoy = () => new Date();
const iso = d => d.toISOString().slice(0,10);
function fechaBonita(s){ if(!s)return"—"; const d=new Date(s+"T00:00"); if(isNaN(d))return s;
  return d.toLocaleDateString("es-CO",{day:"numeric",month:"short",year:"numeric"}); }

function esFestivo(d){ return STATE.festivos.includes(iso(d)); }
function esHabil(d){ const w=d.getDay(); return w!==0 && w!==6 && !esFestivo(d); }
// días hábiles hasta la fecha de corte (día de pago del mes)
function diasHabilesHasta(diaPago){
  if(!diaPago) return null;
  const h=hoy(); h.setHours(0,0,0,0);
  const y=h.getFullYear(), m=h.getMonth();
  let corte=new Date(y,m,diaPago); corte.setHours(0,0,0,0);
  if(corte<h) corte=new Date(y,m+1,diaPago);
  let dias=0; const cur=new Date(h);
  while(cur<corte){ cur.setDate(cur.getDate()+1); if(esHabil(cur))dias++; }
  return dias;
}

// semáforo según días hábiles y estado de mora
function semaforo(c){
  const dv = c.saldoVencido>0;
  const dh = diasHabilesHasta(c.diaPago);
  if(c.estado!=="Activo") return null;
  if(dv) return {k:"vencido",txt:"Vencida",dias:c.diasMora||"+",bg:"var(--vino)",fg:"#fff",dot:"#fff"};
  if(dh===0) return {k:"hoy",txt:"Vence hoy",dias:0,bg:"var(--red-dark)",fg:"#fff",dot:"#fff"};
  if(dh===1) return {k:"1",txt:"1 día",dias:1,bg:"var(--red-bg)",fg:"var(--red)",dot:"var(--red)"};
  if(dh===2) return {k:"2",txt:"2 días",dias:2,bg:"var(--orange-bg)",fg:"var(--orange)",dot:"var(--orange)"};
  if(dh===3) return {k:"3",txt:"3 días",dias:3,bg:"var(--yellow-bg)",fg:"var(--yellow)",dot:"var(--yellow)"};
  return null;
}

// puntaje de prioridad
function prioridad(c){
  let p=0;
  p += Math.min(c.diasMora||0,360)/360*35;
  p += Math.min((c.saldoVencido||0)/3000000,1)*25;
  const catW={A:0,B:5,C:12,D:20,E1:28,E2:30}; p += catW[c.categoria]||0;
  const promInc = STATE.promesas.filter(pr=>pr.creditoId===c.id && pr.estado==="Incumplida").length;
  p += Math.min(promInc*8,16);
  const ultG = ultimaGestion(c.id);
  if(ultG){ const dd=(hoy()-new Date(ultG.fecha))/(864e5); p+=Math.min(dd/30,1)*10; }
  else p+=10;
  if(p>=70)return{n:p,lbl:"Crítica",bg:"var(--red-bg)",fg:"var(--red)"};
  if(p>=45)return{n:p,lbl:"Alta",bg:"var(--orange-bg)",fg:"var(--orange)"};
  if(p>=22)return{n:p,lbl:"Media",bg:"var(--yellow-bg)",fg:"var(--yellow)"};
  return{n:p,lbl:"Baja",bg:"var(--green-bg)",fg:"var(--green)"};
}

function ultimaGestion(cid){
  const gs=STATE.gestiones.filter(g=>g.creditoId===cid).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  return gs[0]||null;
}

const CAT_STY={A:{bg:"var(--green-bg)",fg:"var(--green)"},B:{bg:"var(--blue-bg)",fg:"var(--blue)"},
  C:{bg:"var(--yellow-bg)",fg:"var(--yellow)"},D:{bg:"var(--orange-bg)",fg:"var(--orange)"},
  E1:{bg:"var(--red-bg)",fg:"var(--red)"},E2:{bg:"#F3E8F5",fg:"#7D3C98"}};
const EST_STY={Activo:{bg:"var(--blue-bg)",fg:"var(--blue)"},Pagado:{bg:"var(--green-bg)",fg:"var(--green)"},
  Cancelado:{bg:"#EEF0F2",fg:"var(--gray)"},Finalizado:{bg:"var(--green-bg)",fg:"#0F7B6C"},
  Refinanciado:{bg:"var(--orange-bg)",fg:"var(--orange)"},Castigado:{bg:"var(--red-bg)",fg:"var(--red)"}};

function catChip(c){const s=CAT_STY[c]||CAT_STY.A;return `<span class="chip" style="background:${s.bg};color:${s.fg}">${c}</span>`;}
function estChip(e,c){
  // Si el credito esta Activo pero en categoria de riesgo alto (E1/E2) con saldo vencido, mostrar "Retrasado" en rojo
  if(c && c.estado==="Activo" && (c.categoria==="E1"||c.categoria==="E2") && c.saldoVencido>0){
    return `<span class="chip" style="background:var(--red-bg);color:var(--red)">⚠ Retrasado</span>`;
  }
  const s=EST_STY[e]||EST_STY.Activo;return `<span class="chip" style="background:${s.bg};color:${s.fg}">${e}</span>`;
}

function waLink(c){
  if(!c.celular||c.celular.length!==10)return null;
  const p1=(c.nombre||"").split(" ")[0];
  const s=semaforo(c);
  let tplKey="r3";
  if(s){
    if(s.k==="vencido") tplKey="vencida";
    else if(s.k==="hoy") tplKey="hoy";
    else if(s.k==="1") tplKey="r1";
    else if(s.k==="2") tplKey="r2";
    else if(s.k==="3") tplKey="r3";
  }
  let msg=STATE.plantillas[tplKey]
    .replace("{nombre}",p1)
    .replace("{cuota}",fmt(c.cuotaValor))
    .replace("{vence}",fechaBonita(c.fechaVence))
    .replace("{empresa}",nombreEmpresa(c.entidad));
  return `https://wa.me/57${c.celular}?text=${encodeURIComponent(msg)}`;
}
function waLinkProspecto(p){
  if(!p.celular||p.celular.length!==10)return null;
  const p1=(p.nombre||"").split(" ")[0];
  const serv=p.servicio||"nuestros servicios";
  const msg=`Hola *${p1}* 👋\n\nGracias por tu interés en *${serv}* con *Grupo Empresarial Marcal (GEM)*. 🙌\n\nSoy tu asesor(a) y con gusto te acompaño en el proceso. ¿Tienes un momento para contarte cómo podemos ayudarte? 📲\n\n_Asesoría 100% gratuita._`;
  return `https://wa.me/57${p.celular}?text=${encodeURIComponent(msg)}`;
}

function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2200);}

// ═══════════════════════════════════════════════════════════
// LOGIN + BOOT
// ═══════════════════════════════════════════════════════════
function renderUserPicker(){
  const cont=document.getElementById("userPicker");
  cont.innerHTML = `
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:12.5px;font-weight:600;color:var(--gray);margin-bottom:5px">Usuario</label>
      <input id="loginUser" class="inp" style="width:100%" placeholder="ej. superusuario" autocomplete="username">
    </div>
    <div style="margin-bottom:16px">
      <label style="display:block;font-size:12.5px;font-weight:600;color:var(--gray);margin-bottom:5px">Contraseña</label>
      <input id="loginPass" type="password" class="inp" style="width:100%" placeholder="••••••••" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')intentarLogin()">
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;font-size:15px" onclick="intentarLogin()">Ingresar</button>
    <div id="loginError" style="color:var(--red);font-size:13px;margin-top:10px;text-align:center;display:none"></div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
      <div style="font-size:11.5px;color:var(--gray-l);text-align:center;margin-bottom:10px">Acceso rápido (demo) — toca un perfil para autocompletar</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${USERS.map(u=>`<div class="user-card" style="padding:9px 11px" onclick="autocompletar('${u.usuario}','${u.pass}')">
          <div class="av2" style="background:${u.color};width:34px;height:34px;font-size:12px">${u.init}</div>
          <div style="flex:1;min-width:0"><div class="un" style="font-size:12.5px">${u.nombre}</div>
          <div class="ur" style="font-size:10.5px">${u.rolLabel}</div></div>
        </div>`).join("")}
      </div>
    </div>`;
}
function autocompletar(usuario,pass){
  document.getElementById("loginUser").value=usuario;
  document.getElementById("loginPass").value=pass;
}
function intentarLogin(){
  const usuario=document.getElementById("loginUser").value;
  const pass=document.getElementById("loginPass").value;
  const err=document.getElementById("loginError");
  const u=getUserByLogin(usuario);
  if(!u || u.pass!==pass){
    err.textContent="Usuario o contraseña incorrectos.";
    err.style.display="block";
    return;
  }
  err.style.display="none";
  doLogin(u.id);
}
function doLogin(userId){
  STATE.currentUserId = userId;
  // colocar la sección inicial correcta según el rol
  const u=getUser(userId);
  if(u && u.rol==="comercial") CURRENT="panelcom";
  else CURRENT="dashboard";
  save();
  mostrarOverlay("app");
  buildNav(); buildMobileBar(); buildEmpresaBar(); updateUserChip();
  render();
}
function logout(){
  toggleSidebar(false);
  STATE.currentUserId = null;
  save();
  mostrarOverlay("login");
  renderUserPicker();
  window.scrollTo(0,0);
}
function updateUserChip(){
  const u=currentUser(); if(!u)return;
  const av=document.querySelector(".topbar .user .av");
  const nm=document.querySelector(".topbar .user .nm");
  const rl=document.querySelector(".topbar .user .rl");
  if(av){av.textContent=u.init; av.style.background=u.color;}
  if(nm)nm.textContent=u.nombre;
  if(rl)rl.textContent=u.rolLabel;
  // texto de gestión bajo el logo del sidebar según rol
  const gestionTxt={superadmin:"Gestión administrativa",superusuario:"Gestión superior",cartera:"Gestión de cartera",comercial:"Gestión comercial"};
  const sg=document.getElementById("sbGestion");
  if(sg) sg.textContent=gestionTxt[u.rol]||"Gestión";
}
async function boot(){
  // Ocultar overlays INMEDIATO, antes de cualquier intento de red, para que la
  // página pública nunca quede bloqueada por el login mientras se conecta a la nube.
  ocultarOverlays();
  document.getElementById("loginLogo").src=LOGO_SRC;
  document.getElementById("sbLogo").src=LOGO_SRC;
  renderUserPicker();

  // 1. Cargar respaldo local primero (rápido)
  const had=load();

  // 2. Intentar conectar a Supabase y traer datos compartidos (con timeout de seguridad)
  SB_OK = initSupabase();
  if(SB_OK){
    const nube = await Promise.race([
      loadCloud(),
      new Promise(res=>setTimeout(()=>res(false), 4000)) // nunca bloquear más de 4s
    ]);
    actualizarIndicadorNube(true);
    if(nube){ /* datos de la nube ya cargados */ }
  } else {
    actualizarIndicadorNube(false);
  }

  // 3. Si no hay datos en ningún lado, sembrar demo
  if((!had && !SB_OK) || !STATE.creditos || !STATE.creditos.length){
    if(!STATE.creditos || !STATE.creditos.length){
      STATE.creditos = [
        ...SEED.map((r,i)=>seedToCredito(r,"a"+i)),
        ...SEED_COOPFISOL.map((r,i)=>seedToCredito(r,"b"+i)),
      ];
      STATE.lastUpdate = new Date().toISOString();
      STATE.importaciones=[
        {id:uid(),fecha:new Date().toISOString(),archivo:"Carga inicial Coomsertar (julio, anonimizada)",
         entidad:"Coomsertar",periodo:"2026-07",registros:SEED.length,usuario:"Sistema"},
        {id:uid(),fecha:new Date().toISOString(),archivo:"Carga inicial Coopfisol (demo)",
         entidad:"Coopfisol",periodo:"2026-07",registros:SEED_COOPFISOL.length,usuario:"Sistema"},
      ];
      save();
    }
  }
  if(!STATE.empresaActiva) STATE.empresaActiva="Coomsertar";
  if(STATE.currentUserId && getUser(STATE.currentUserId)){
    mostrarOverlay("app");
    buildNav(); buildMobileBar(); buildEmpresaBar(); updateUserChip();
    render();
  }
}
function actualizarIndicadorNube(ok){
  // muestra en el sidebar si está conectado a la nube
  const el=document.getElementById("lastUpdate");
  if(!el) return;
  const badge = ok
    ? '<div style="font-size:10.5px;color:#4ade80;margin-top:6px">☁ Conectado a la nube</div>'
    : '<div style="font-size:10.5px;color:#f4b860;margin-top:6px">💾 Modo local (sin nube)</div>';
  if(!el.dataset.nube){ el.insertAdjacentHTML("beforeend", badge); el.dataset.nube="1"; }
}

function seedToCredito(r,i){
  const dias = r.saldoVencido>0 ? Math.round(r.saldoVencido/(r.cuotaValor||1)*30) : 0;
  return {
    id:"c"+i, numeroExterno:"", clienteDoc:r.nit, nombre:r.nombre, celular:r.celular,
    entidad:r.entidad||"Coomsertar", sede:r.sede||"Ibague", responsable:"Sin asignar",
    categoria:r.categoria||"A", estado:r.estado||"Activo",
    fechaInicio:r.fechaInicio||"", fechaVence:r.fechaVence||"", diaPago:r.diaPago||null,
    saldoTotal:r.saldoTotal||0, saldoSinVencer:(r.saldoTotal||0)-(r.saldoVencido||0),
    saldoVencido:r.saldoVencido||0, cuotaValor:r.cuotaValor||0,
    cuotasPend:r.cuotasPend||0, diasMora:dias, obs:r.obs||"", etiquetas:[],
  };
}

// ═══════════════════════════════════════════════════════════
// EMPRESA ACTIVA (Coomsertar / Coopfisol / Ambas)
// ═══════════════════════════════════════════════════════════
function buildEmpresaBar(){
  const bar=document.getElementById("empresaBar");
  const u=currentUser();
  if(!u || u.rol==="comercial"){ bar.style.display="none"; return; }
  bar.style.display="flex";
  const opts=["Coomsertar","Coopfisol","Ambas"];
  bar.innerHTML = `<span style="font-size:11.5px;color:var(--gray);font-weight:600;margin-right:4px">Empresa:</span>` +
    opts.map(o=>`<button class="empresa-btn ${STATE.empresaActiva===o?'active':''}" onclick="setEmpresa('${o}')">${o}</button>`).join("");
}
function setEmpresa(e){ STATE.empresaActiva=e; save(); buildEmpresaBar(); render(); }
function visibleCreditos(){
  if(STATE.empresaActiva==="Ambas") return STATE.creditos;
  return STATE.creditos.filter(c=>c.entidad===STATE.empresaActiva);
}

// ═══════════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════════
const NAV=[
  {g:"Operación diaria"},
  {k:"dashboard",ic:"📊",t:"Dashboard", roles:["superadmin","superusuario","cartera"]},
  {k:"hoy",ic:"📌",t:"Mi trabajo de hoy", roles:["superadmin","superusuario","cartera"]},
  {k:"cobros",ic:"🎯",t:"Gestión de cobros", roles:["superadmin","superusuario","cartera"]},
  {g:"Información"},
  {k:"cartera",ic:"📁",t:"Cartera general", roles:["superadmin","superusuario","cartera"]},
  {k:"clientes",ic:"👤",t:"Clientes y créditos", roles:["superadmin","superusuario","cartera"]},
  {k:"pagos",ic:"💵",t:"Pagos", roles:["superadmin","superusuario","cartera"]},
  {k:"promesas",ic:"🤝",t:"Promesas de pago", roles:["superadmin","superusuario","cartera"]},
  {g:"Comercial"},
  {k:"panelcom",ic:"📊",t:"Panel comercial", roles:["superadmin","superusuario","comercial"]},
  {k:"prospectoshoy",ic:"📌",t:"Prospectos de hoy", roles:["superadmin","superusuario","comercial"]},
  {k:"pipeline",ic:"📈",t:"Pipeline comercial", roles:["superadmin","superusuario","comercial"]},
  {k:"informescom",ic:"📄",t:"Informes comerciales", roles:["superadmin","superusuario","comercial"]},
  {g:"Datos y administración"},
  {k:"importar",ic:"📥",t:"Importar Excel", roles:["superadmin","superusuario","cartera"]},
  {k:"calidad",ic:"✔️",t:"Calidad de datos", roles:["superadmin","superusuario","cartera"]},
  {k:"informes",ic:"📄",t:"Informes", roles:["superadmin","superusuario","cartera"]},
  {k:"recibos",ic:"🧾",t:"Recibos", roles:["superadmin","superusuario","cartera"]},
  {k:"certificados",ic:"📜",t:"Certificados", roles:["superadmin","superusuario","cartera"]},
  {k:"documentos",ic:"📁",t:"Documentación", roles:["superadmin","superusuario","cartera"]},
  {k:"config",ic:"⚙️",t:"Plantillas rápidas", roles:["superadmin","superusuario","cartera"]},
  {g:"Control y supervisión"},
  {k:"supervision",ic:"👁️",t:"Supervisión general", roles:["superadmin","superusuario"]},
  {k:"informesger",ic:"📊",t:"Informes gerenciales", roles:["superadmin","superusuario"]},
  {k:"analitica",ic:"📉",t:"Analítica y campañas", roles:["superadmin","superusuario"]},
  {k:"casos",ic:"🗃️",t:"Centro de casos", roles:["superadmin","superusuario","cartera"]},
  {k:"blog",ic:"📰",t:"Blog / contenidos", roles:["superusuario"]},
  {k:"plantillasauto",ic:"🗂️",t:"Plantillas automáticas", roles:["superusuario"]},
  {k:"usuariosadmin",ic:"🔑",t:"Gestión de usuarios", roles:["superusuario"]},
];
function navAllowed(item){
  const u=currentUser(); if(!u) return false;
  if(!item.roles) return true;
  return item.roles.includes(u.rol);
}
function navBadge(k){
  if(k==="hoy"||k==="cobros") return cobrosUrgentes().length||"";
  if(k==="promesas") return STATE.promesas.filter(p=>p.estado==="Incumplida").length||"";
  if(k==="prospectoshoy") return prospectosHoy().length||"";
  return "";
}
function buildNav(){
  let h="";
  let lastWasGroup=false;
  NAV.forEach(it=>{
    if(it.g){ h+=`<div class="sb-group" data-g="1">${it.g}</div>`; lastWasGroup=true; return; }
    if(!navAllowed(it)) return;
    lastWasGroup=false;
    const b=navBadge(it.k);
    h+=`<div class="sb-item ${CURRENT===it.k?'active':''}" onclick="go('${it.k}')">
      <span class="ic">${it.ic}</span><span>${it.t}</span>${b?`<span class="badge">${b}</span>`:''}</div>`;
  });
  document.getElementById("navMenu").innerHTML=h;
  updateLastUpdate();
  // ajustar CURRENT si la pagina actual no es visible para este rol
  const u=currentUser();
  if(u){
    const item=NAV.find(n=>n.k===CURRENT);
    if(item && !navAllowed(item)){
      const primero=NAV.find(n=>!n.g && navAllowed(n));
      if(primero) CURRENT=primero.k;
    }
  }
}
function buildMobileBar(){
  const u=currentUser();
  let items;
  if(u && u.rol==="comercial"){
    items=[["panelcom","📊","Panel"],["prospectoshoy","📌","Hoy"],["pipeline","📈","Pipeline"],["informescom","📄","Informes"]];
  } else {
    items=[["dashboard","📊","Inicio"],["hoy","📌","Hoy"],["cobros","🎯","Cobros"],["cartera","📁","Cartera"],["importar","📥","Importar"]];
  }
  document.getElementById("mobileBar").innerHTML=items.map(([k,i,t])=>
    `<button class="${CURRENT===k?'active':''}" onclick="go('${k}')"><span class="ic">${i}</span>${t}</button>`).join("");
}
function updateLastUpdate(){
  const el=document.getElementById("lastUpdate");
  if(STATE.lastUpdate){const d=new Date(STATE.lastUpdate);
    el.innerHTML=`Última actualización:<br><b style="color:#c9d3de">${d.toLocaleDateString("es-CO")} ${d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</b>`;}
}
function go(k){CURRENT=k;buildNav();buildMobileBar();render();toggleSidebar(false);window.scrollTo(0,0);}
function toggleSidebar(open){
  const sb=document.getElementById("sidebar"),ov=document.getElementById("sbOverlay");
  if(open){sb.classList.add("open");ov.classList.add("show");}
  else{sb.classList.remove("open");ov.classList.remove("show");}
}

function cobrosUrgentes(){
  return visibleCreditos().map(c=>({c,s:semaforo(c)})).filter(x=>x.s).map(x=>x.c);
}



// ═══════════════════════════════════════════════════════════
// ROUTER DE RENDER
// ═══════════════════════════════════════════════════════════
function render(){
  const R={dashboard:renderDashboard,hoy:renderHoy,cobros:renderCobros,cartera:renderCartera,
    clientes:renderClientes,pagos:renderPagos,promesas:renderPromesas,importar:renderImportar,
    calidad:renderCalidad,informes:renderInformes,pipeline:renderPipeline,recibos:renderRecibos,config:renderConfig,
    panelcom:renderPanelComercial,prospectoshoy:renderProspectosHoy,informescom:renderInformesComerciales,
    supervision:renderSupervision,plantillasauto:renderPlantillasAuto,usuariosadmin:renderUsuariosAdmin,documentos:renderDocumentos,certificados:renderCertificados,blog:renderBlogAdmin,analitica:renderAnalitica,casos:renderCasos,informesger:renderInformesGerenciales};
  document.getElementById("content").innerHTML=(R[CURRENT]||renderDashboard)();
  if(typeof actualizarBadgeNotif==="function") actualizarBadgeNotif();
}
function head(t,d,action){
  return `<div class="page-head"><div class="row"><div><h2>${t}</h2><p>${d}</p></div>${action||""}</div></div>`;
}

// ─────────── DASHBOARD ───────────
function metaSplit(cuotaValor){
  const interes=Math.round((cuotaValor||0)*0.2);
  return {interes, capital:(cuotaValor||0)-interes};
}
function pagosDelMes(creditoIds){
  const ym=iso(hoy()).slice(0,7);
  return STATE.pagos.filter(p=>creditoIds.includes(p.creditoId)&&p.fecha.slice(0,7)===ym);
}
function renderDashboard(){
  const cs=visibleCreditos();
  const activos=cs.filter(c=>c.estado==="Activo");
  const saldoTotal=cs.reduce((s,c)=>s+c.saldoTotal,0);
  const vencido=cs.reduce((s,c)=>s+c.saldoVencido,0);
  const sinVencer=cs.reduce((s,c)=>s+c.saldoSinVencer,0);
  const urg=cobrosUrgentes();
  const promPend=STATE.promesas.filter(p=>p.estado==="Pendiente").length;
  const promInc=STATE.promesas.filter(p=>p.estado==="Incumplida").length;
  const sinContactar=activos.filter(c=>!ultimaGestion(c.id)).length;

  // Meta y recaudo del mes (general)
  const idsAll=cs.map(c=>c.id);
  const pagosMes=pagosDelMes(idsAll);
  const metaInteresGen=cs.reduce((s,c)=>s+metaSplit(c.cuotaValor).interes,0);
  const metaCapitalGen=cs.reduce((s,c)=>s+metaSplit(c.cuotaValor).capital,0);
  const recCapitalGen=pagosMes.reduce((s,p)=>s+(p.capital||0)+(p.anticipado||0),0);
  const recInteresGen=pagosMes.reduce((s,p)=>s+(p.interes||0)+(p.mora||0),0);
  const metaTotalGen=metaInteresGen+metaCapitalGen;
  const recTotalGen=recCapitalGen+recInteresGen;
  const cumplGen=metaTotalGen?Math.round(recTotalGen/metaTotalGen*100):0;

  // por categoria: saldo, personas, meta/recaudo, cumplimiento
  const cats=["A","B","C","D","E1","E2"];
  const porCat={};
  cats.forEach(cat=>{
    const sub=cs.filter(c=>c.categoria===cat);
    const ids=sub.map(c=>c.id);
    const pm=pagosDelMes(ids);
    const metaInt=sub.reduce((s,c)=>s+metaSplit(c.cuotaValor).interes,0);
    const metaCap=sub.reduce((s,c)=>s+metaSplit(c.cuotaValor).capital,0);
    const recCap=pm.reduce((s,p)=>s+(p.capital||0)+(p.anticipado||0),0);
    const recInt=pm.reduce((s,p)=>s+(p.interes||0)+(p.mora||0),0);
    const metaT=metaInt+metaCap, recT=recCap+recInt;
    porCat[cat]={n:sub.length, saldo:sub.reduce((s,c)=>s+c.saldoTotal,0), metaT, recT,
      cumpl: metaT? Math.round(recT/metaT*100) : 0};
  });
  const maxCatSaldo=Math.max(...cats.map(c=>porCat[c].saldo),1);

  return head("Dashboard · "+STATE.empresaActiva, "Visión ejecutiva de la cartera al corte actual.",
    `<button class="btn btn-primary" onclick="generarInformeDiario()">📄 Generar informe diario</button>`)+

  // ── Fila 1: Cartera general y Cartera al día, GRANDES ──
  `<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:14px" class="dash-cols">
    <div class="panel" style="background:linear-gradient(135deg,var(--navy),var(--navy2));border:none">
      <div style="color:#9fb3c8;font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Cartera general</div>
      <div style="color:#fff;font-size:34px;font-weight:800;margin-top:4px;letter-spacing:-1px">${fmt(saldoTotal)}</div>
      <div style="color:#c3cdd8;font-size:13px;margin-top:2px">${cs.length} créditos · ${activos.length} activos</div>
      <div style="display:flex;gap:18px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.15)">
        <div><div style="color:#9fb3c8;font-size:11px">Cumplimiento del mes</div><div style="color:${cumplGen>=90?'#6fd39a':cumplGen>=60?'#F4A623':'#f28b82'};font-size:22px;font-weight:800">${cumplGen}%</div></div>
        <div><div style="color:#9fb3c8;font-size:11px">Meta capital</div><div style="color:#fff;font-size:15px;font-weight:700">${fmt(metaCapitalGen)}</div></div>
        <div><div style="color:#9fb3c8;font-size:11px">Meta interés</div><div style="color:#fff;font-size:15px;font-weight:700">${fmt(metaInteresGen)}</div></div>
        <div><div style="color:#9fb3c8;font-size:11px">Recaudado</div><div style="color:#6fd39a;font-size:15px;font-weight:700">${fmt(recTotalGen)}</div></div>
      </div>
    </div>
    <div class="panel" style="background:var(--green-bg);border:none">
      <div style="color:var(--green);font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Cartera al día</div>
      <div style="color:var(--green);font-size:34px;font-weight:800;margin-top:4px;letter-spacing:-1px">${fmt(sinVencer)}</div>
      <div style="color:#4a8a6a;font-size:13px;margin-top:2px">${pct(sinVencer,saldoTotal)} del total de cartera</div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(30,142,90,.2)">
        <div style="color:var(--red);font-size:12px;font-weight:700">🔴 Cartera vencida: ${fmt(vencido)} (${pct(vencido,saldoTotal)})</div>
      </div>
    </div>
  </div>
  <div class="kpi-grid" style="margin-top:14px">
    ${kpiC("Cobros urgentes (≤3 días)",urg.length,"Ver Mi trabajo de hoy","orange")}
    ${kpiC("Promesas pendientes",promPend,promInc+" incumplidas","")}
    ${kpiC("Clientes sin contactar",sinContactar,"","blue")}
    ${kpiC("Créditos con mora",cs.filter(c=>c.saldoVencido>0&&c.estado==="Activo").length,"","red")}
  </div>

  <div class="panel" style="margin-top:14px">
    <div class="panel-title">Categorías de riesgo — saldo, personas y cumplimiento</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
      ${cats.map(cat=>{const v=porCat[cat];const s=CAT_STY[cat];
        return `<div style="background:${s.bg};border-radius:12px;padding:14px;border:1.5px solid ${s.fg}30">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:22px;font-weight:900;color:${s.fg}">${cat}</span>
            <span style="font-size:11.5px;color:${s.fg};font-weight:700;background:#fff;padding:2px 9px;border-radius:20px">${v.n} pers.</span>
          </div>
          <div style="font-size:19px;font-weight:800;color:var(--navy);margin-top:8px">${fmt(v.saldo)}</div>
          <div style="height:7px;background:rgba(0,0,0,.08);border-radius:5px;overflow:hidden;margin-top:8px">
            <div style="height:100%;width:${Math.min(v.cumpl,100)}%;background:${s.fg};border-radius:5px"></div>
          </div>
          <div style="font-size:12px;color:var(--gray);margin-top:5px;font-weight:600">Cumplimiento: <b style="color:${s.fg}">${v.cumpl}%</b></div>
        </div>`;}).join("")}
    </div>
  </div>

  ${renderResultadosPorSede(cs)}

  <div class="panel">
    <div class="panel-title" style="margin-bottom:10px">Antigüedad de cartera</div>
    ${antiguedadBars(cs)}
  </div>`;
}
function kpiC(lbl,val,sub,cls){return `<div class="kpi ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;}
function pct(a,b){return b?(a/b*100).toFixed(1)+"%":"0%";}
// ─────────── RESULTADOS POR SEDE (4 ciudades, formato tipo informe) ───────────
function filaCategoriaSede(sub){
  // sub = creditos de esa sede+categoria
  const ids=sub.map(c=>c.id);
  const pm=pagosDelMes(ids);
  const saldoCapital=sub.reduce((s,c)=>s+c.saldoTotal,0);
  const metaCap=sub.reduce((s,c)=>s+metaSplit(c.cuotaValor).capital,0);
  const metaInt=sub.reduce((s,c)=>s+metaSplit(c.cuotaValor).interes,0);
  const recCap=pm.reduce((s,p)=>s+(p.capital||0)+(p.anticipado||0),0);
  const recInt=pm.reduce((s,p)=>s+(p.interes||0)+(p.mora||0),0);
  const metaT=metaCap+metaInt, recT=recCap+recInt;
  return {n:sub.length, saldoCapital, metaCap, metaInt, metaT, recCap, recInt, recT,
    cumpl: metaT? Math.round(recT/metaT*100) : 0, dif: metaT-recT};
}
function tablaInformeSede(nombreSede, cs){
  const grupos=[["A","A"],["B","B"],["C","C"],["D","D"],["E","E1/E2 (incobrabilidad)"]];
  let rows="";
  let totRow={n:0,saldoCapital:0,metaCap:0,metaInt:0,metaT:0,recCap:0,recInt:0,recT:0};
  grupos.forEach(([key,label])=>{
    const sub = key==="E" ? cs.filter(c=>c.categoria==="E1"||c.categoria==="E2") : cs.filter(c=>c.categoria===key);
    if(!sub.length && key!=="A") return; // omitir categorias vacias salvo A
    const f=filaCategoriaSede(sub);
    totRow.n+=f.n;totRow.saldoCapital+=f.saldoCapital;totRow.metaCap+=f.metaCap;totRow.metaInt+=f.metaInt;
    totRow.metaT+=f.metaT;totRow.recCap+=f.recCap;totRow.recInt+=f.recInt;totRow.recT+=f.recT;
    const cumplColor = f.cumpl>=90?"var(--green)":f.cumpl>=60?"var(--orange)":"var(--red)";
    rows+=`<tr><td><b>${label}</b></td><td>${fmt(f.saldoCapital)}</td><td>${f.n}</td>
      <td>${fmt(f.metaCap)}</td><td>${fmt(f.metaInt)}</td><td><b>${fmt(f.metaT)}</b></td>
      <td>${fmt(f.recCap)}</td><td>${fmt(f.recInt)}</td><td><b>${fmt(f.recT)}</b></td>
      <td style="color:${cumplColor};font-weight:700">${f.cumpl}%</td><td>${fmt(f.dif)}</td></tr>`;
  });
  const cumplTot = totRow.metaT? Math.round(totRow.recT/totRow.metaT*100):0;
  rows+=`<tr style="background:var(--yellow-bg);font-weight:800"><td>TOTAL</td><td>${fmt(totRow.saldoCapital)}</td><td>${totRow.n}</td>
    <td>${fmt(totRow.metaCap)}</td><td>${fmt(totRow.metaInt)}</td><td>${fmt(totRow.metaT)}</td>
    <td>${fmt(totRow.recCap)}</td><td>${fmt(totRow.recInt)}</td><td>${fmt(totRow.recT)}</td>
    <td>${cumplTot}%</td><td>${fmt(totRow.metaT-totRow.recT)}</td></tr>`;
  return `<div style="margin-bottom:18px">
    <div style="font-weight:800;color:var(--navy);font-size:14.5px;margin-bottom:8px">📍 ${nombreSede}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Categ.</th><th>Saldo capital</th><th>N° pers.</th><th>Meta capital</th><th>Meta interés</th>
      <th>Total meta</th><th>Recaudo capital</th><th>Recaudo interés</th><th>Total recaudo</th><th>Cumpl.</th><th>Diferencia</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function renderResultadosPorSede(cs){
  const sedesOrden=["Ibague","Girardot","Rovira","Neiva"];
  let html=`<div class="panel" id="panelSedes">
    <div class="panel-title">Resultados por sede
      <button class="btn btn-ghost btn-sm" onclick="imprimirResultadosSede()">🖨️ Generar PDF</button>
    </div>
    <div id="resultadosSedeContenido">`;
  sedesOrden.forEach(sede=>{
    const sub=cs.filter(c=>c.sede===sede);
    html+=tablaInformeSede(sede.charAt(0).toUpperCase()+sede.slice(1),sub);
  });
  html+=`<div style="border-top:2px solid var(--gold);padding-top:14px;margin-top:6px">
    <div style="font-weight:800;color:var(--navy);font-size:15px;margin-bottom:8px">📊 Informe general (todas las sedes)</div>
    ${tablaInformeSede("Consolidado "+STATE.empresaActiva, cs)}
  </div>`;
  html+=`</div></div>`;
  return html;
}
function imprimirResultadosSede(){
  const contenido=document.getElementById("resultadosSedeContenido").innerHTML;
  const w=window.open("","_blank");
  w.document.write(`<html><head><title>Resultados por sede — ${STATE.empresaActiva}</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#1A1A2E}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px}
      th{background:#0D1B2A;color:#fff;padding:6px 8px;text-align:left}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      h1{color:#0D1B2A;font-size:18px}
    </style></head><body>
    <h1>Resultados por sede — ${STATE.empresaActiva} — ${fechaBonita(iso(hoy()))}</h1>
    ${contenido}
    </body></html>`);
  w.document.close();
  setTimeout(()=>{w.print();},400);
}

// ─────────── INFORME DIARIO (imagen con logo GEM y numeración) ───────────
function generarInformeDiario(){
  if(typeof html2canvas==="undefined"){
    toast("No se pudo cargar el generador de imágenes (revisa tu conexión a internet y vuelve a intentar)");
    return;
  }
  const empresa=STATE.empresaActiva;
  const cs = empresa==="Ambas" ? STATE.creditos : STATE.creditos.filter(c=>c.entidad===empresa);
  const idsHoy = cs.map(c=>c.id);
  const hoyStr = iso(hoy());
  const pagosHoy = STATE.pagos.filter(p=>idsHoy.includes(p.creditoId) && p.fecha.slice(0,10)===hoyStr);

  // numeracion electronica
  const key = empresa==="Ambas" ? "GEM" : (empresa==="Coopfisol" ? "COOP" : "COOM");
  if(!STATE.contadorInformes[key]) STATE.contadorInformes[key]=0;
  STATE.contadorInformes[key]++;
  const numero = `${key}-${hoyStr.replace(/-/g,"")}-${String(STATE.contadorInformes[key]).padStart(4,"0")}`;
  save();

  const cats=["A","B","C","D","E1","E2"];
  const porCat={};
  cats.forEach(cat=>{
    const ids=cs.filter(c=>c.categoria===cat).map(c=>c.id);
    const pc=pagosHoy.filter(p=>ids.includes(p.creditoId));
    porCat[cat]={interes:pc.reduce((s,p)=>s+(p.interes||0),0), capital:pc.reduce((s,p)=>s+(p.capital||0),0)};
  });
  const totalInteres=cats.reduce((s,c)=>s+porCat[c].interes,0);
  const totalCapital=cats.reduce((s,c)=>s+porCat[c].capital,0);
  const totalMora=pagosHoy.reduce((s,p)=>s+(p.mora||0),0);
  const totalAnticipado=pagosHoy.reduce((s,p)=>s+(p.anticipado||0),0);
  const subtotal=totalInteres+totalCapital;
  const granTotal=subtotal+totalMora+totalAnticipado;

  const filaCat = (cat)=>{
    const v=porCat[cat];
    const pctI = totalInteres? Math.round(v.interes/totalInteres*100):0;
    const pctC = totalCapital? Math.round(v.capital/totalCapital*100):0;
    if(v.interes===0 && v.capital===0) return "";
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${cat}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(v.interes)} <span style="color:#999;font-size:10px">(${pctI}%)</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(v.capital)} <span style="color:#999;font-size:10px">(${pctC}%)</span></td></tr>`;
  };

  const html = `
  <div id="informeDiarioTmp" style="width:640px;background:#fff;font-family:Segoe UI,Arial,sans-serif;padding:0">
    <div style="background:#0D1B2A;padding:20px 26px;display:flex;align-items:center;gap:14px">
      <img src="${LOGO_SRC}" style="width:52px;height:52px;border-radius:8px;object-fit:cover">
      <div>
        <div style="color:#fff;font-weight:800;font-size:17px">Grupo Empresarial Marcal — GEM</div>
        <div style="color:#9fb3c8;font-size:12px">Informe diario de recaudo · ${empresa}</div>
      </div>
    </div>
    <div style="padding:22px 26px">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;color:#666">
        <span>N° de informe: <b style="color:#0D1B2A">${numero}</b></span>
        <span>Fecha: <b style="color:#0D1B2A">${fechaBonita(hoyStr)}</b></span>
      </div>
      <div style="font-weight:800;color:#0D1B2A;font-size:14px;margin-bottom:8px">Ingresos por categoría</div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:16px">
        <thead><tr style="background:#F5F7FA">
          <th style="padding:7px 10px;text-align:left">Categoría</th>
          <th style="padding:7px 10px;text-align:right">Interés</th>
          <th style="padding:7px 10px;text-align:right">Capital</th>
        </tr></thead>
        <tbody>${cats.map(filaCat).join("")}</tbody>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:7px 10px;color:#444">Intereses + Capital</td><td style="padding:7px 10px;text-align:right;font-weight:700">${fmt(subtotal)}</td></tr>
        <tr><td style="padding:7px 10px;color:#444">Interés de mora</td><td style="padding:7px 10px;text-align:right;font-weight:700;color:#C0392B">${fmt(totalMora)}</td></tr>
        <tr><td style="padding:7px 10px;color:#444">Valor anticipado</td><td style="padding:7px 10px;text-align:right;font-weight:700;color:#2E6BB0">${fmt(totalAnticipado)}</td></tr>
        <tr style="background:#FEF6E4"><td style="padding:9px 10px;font-weight:800;color:#0D1B2A">TOTAL RECAUDADO HOY</td><td style="padding:9px 10px;text-align:right;font-weight:800;color:#0D1B2A;font-size:15px">${fmt(granTotal)}</td></tr>
      </table>
      <div style="margin-top:16px;font-size:10.5px;color:#999">Generado automáticamente desde el sistema de gestión de cartera GEM.</div>
    </div>
  </div>`;

  const tmp=document.createElement("div");
  tmp.style.position="fixed"; tmp.style.left="-9999px";
  tmp.innerHTML=html;
  document.body.appendChild(tmp);
  toast("Generando informe...");
  html2canvas(document.getElementById("informeDiarioTmp"),{scale:2}).then(canvas=>{
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    a.download=`Informe_Diario_${numero}.png`;
    a.click();
    document.body.removeChild(tmp);
    toast("Informe diario descargado");
  }).catch(()=>{
    document.body.removeChild(tmp);
    toast("No se pudo generar la imagen (revisa tu conexión a internet)");
  });
}

function antiguedadBars(cs){
  const bandas={"Al día":0,"1-30":0,"31-90":0,"91-180":0,"181-360":0,"+361":0};
  cs.forEach(c=>{ if(c.saldoVencido<=0){bandas["Al día"]+=c.saldoTotal;return;}
    const d=c.diasMora||0;
    if(d<=30)bandas["1-30"]+=c.saldoVencido; else if(d<=90)bandas["31-90"]+=c.saldoVencido;
    else if(d<=180)bandas["91-180"]+=c.saldoVencido; else if(d<=360)bandas["181-360"]+=c.saldoVencido;
    else bandas["+361"]+=c.saldoVencido; });
  const mx=Math.max(...Object.values(bandas),1);
  const col={"Al día":"var(--green)","1-30":"var(--yellow)","31-90":"var(--orange)","91-180":"var(--red)","181-360":"var(--red-dark)","+361":"var(--vino)"};
  return Object.entries(bandas).map(([k,v])=>`<div style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px">
      <span style="color:var(--gray)">${k}</span><b style="color:var(--navy)">${fmt(v)}</b></div>
    <div style="height:7px;background:var(--line);border-radius:5px;overflow:hidden">
      <div style="height:100%;width:${v/mx*100}%;background:${col[k]};border-radius:5px"></div></div></div>`).join("");
}

// ─────────── MI TRABAJO DE HOY ───────────
function renderHoy(){
  const urg=visibleCreditos().map(c=>({c,s:semaforo(c),p:prioridad(c)})).filter(x=>x.s)
    .sort((a,b)=>{const ord={vencido:0,hoy:1,"1":2,"2":3,"3":4};
      if(ord[a.s.k]!==ord[b.s.k])return ord[a.s.k]-ord[b.s.k];
      return b.c.saldoVencido-a.c.saldoVencido||b.p.n-a.p.n;});
  const promHoy=STATE.promesas.filter(p=>p.estado==="Pendiente"&&p.fechaPrometida===iso(hoy()));
  const promInc=STATE.promesas.filter(p=>p.estado==="Incumplida");
  const d=hoy().toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"});

  let h=head("Mi trabajo de hoy",`Hoy es ${d}. Esto es lo que debe gestionar, en orden de urgencia.`);

  if(promInc.length){
    h+=`<div class="panel" style="border-left:4px solid var(--red)">
      <div class="panel-title" style="color:var(--red)">⚠ ${promInc.length} promesa(s) incumplida(s)</div>
      ${promInc.slice(0,5).map(p=>{const c=STATE.creditos.find(x=>x.id===p.creditoId);
        return c?rowMini(c,"Prometió "+fmt(p.valor)+" el "+fechaBonita(p.fechaPrometida)):"";}).join("")}</div>`;
  }
  if(!urg.length && !promHoy.length){
    h+=`<div class="empty card" style="padding:50px"><div class="ic">✓</div>
      <h3>No hay cobros urgentes para hoy</h3>
      <p>Aquí aparecen los créditos activos cuyo pago vence en 3 días hábiles o menos, y las promesas del día.</p></div>`;
    return h;
  }
  h+=`<div style="margin-bottom:6px;font-size:13px;color:var(--gray)"><b style="color:var(--navy)">${urg.length}</b> cobro(s) por gestionar</div>`;
  urg.forEach(({c,s,p})=>{h+=cobroCard(c,s,p);});
  return h;
}
function rowMini(c,extra){
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f2eee2">
    <div><b style="color:var(--navy);font-size:13px">${c.nombre}</b><div style="font-size:11px;color:var(--gray)">${extra||''}</div></div>
    <div style="display:flex;gap:6px">${waBtn(c)}<button class="btn btn-ghost btn-sm" onclick="openCliente('${c.id}')">Ver</button></div></div>`;
}
function cobroCard(c,s,p){
  const catBg=(CAT_STY[c.categoria]||CAT_STY.A).bg;
  return `<div class="card" style="padding:15px;margin-bottom:11px;border-left:5px solid ${s.dot==='#fff'?s.bg:s.dot};background:${catBg}">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div style="display:flex;align-items:center;gap:11px;min-width:0">
        <span class="semaforo" style="background:${s.bg};color:${s.fg}"><span class="dot" style="background:${s.dot}"></span>${s.txt}</span>
        <div style="min-width:0">
          <div style="font-weight:700;color:var(--navy);font-size:16px">${c.nombre}</div>
          <div style="font-size:12.5px;color:var(--gray)">CC ${c.clienteDoc} · ${c.sede} · Paga día ${c.diaPago||"?"} ${catChip(c.categoria)}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:var(--gray);font-weight:600">Valor de la cuota</div>
        <div style="font-weight:800;color:var(--navy);font-size:19px">${fmt(c.cuotaValor)}</div>
        <span class="chip" style="background:${p.bg};color:${p.fg};font-size:11.5px">Prioridad ${p.lbl}</span>
      </div>
    </div>
    <div style="display:flex;gap:7px;margin-top:11px;flex-wrap:wrap">
      ${waBtn(c)}
      <button class="btn btn-ghost btn-sm" onclick="openGestion('${c.id}')">Registrar gestión</button>
      <button class="btn btn-ghost btn-sm" onclick="openPromesa('${c.id}')">Crear promesa</button>
      <button class="btn btn-ghost btn-sm" onclick="openPago('${c.id}')">Registrar pago</button>
      <button class="btn btn-ghost btn-sm" onclick="openCliente('${c.id}')">Ver cliente</button>
    </div></div>`;
}
function waBtn(c){
  const l=waLink(c);
  if(!l)return `<span class="btn btn-sm" style="background:#eee;color:var(--gray);cursor:not-allowed">Sin celular</span>`;
  return `<a class="btn btn-wa btn-sm" href="${l}" target="_blank" onclick="logWa('${c.id}')">💬 WhatsApp</a>`;
}
function logWa(cid){
  const c=STATE.creditos.find(x=>x.id===cid);if(!c)return;
  STATE.gestiones.push({id:uid(),creditoId:cid,fecha:new Date().toISOString(),canal:"WhatsApp",
    resultado:"Contactado",obs:"Mensaje de WhatsApp abierto",responsable:"Oscar Huertas"});
  save();toast("Gestión de WhatsApp registrada");
}

// ─────────── GESTIÓN DE COBROS ───────────
function renderCobros(){
  const arr=visibleCreditos().map(c=>({c,s:semaforo(c),p:prioridad(c)}))
    .filter(x=>x.c.estado==="Activo")
    .sort((a,b)=>b.p.n-a.p.n);
  let h=head("Gestión de cobros","Bandeja priorizada por puntaje de riesgo. El color indica urgencia; el orden, prioridad de gestión.",
    `<button class="btn btn-primary" onclick="go('hoy')">Ver cobros de hoy</button>`);
  h+=`<div class="panel" style="padding:0">
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Prioridad</th><th>Urgencia</th><th>Cliente</th><th>Categoría</th><th>Saldo vencido</th><th>Días mora</th><th>Cuota</th><th>Acciones</th>
    </tr></thead><tbody>`;
  arr.forEach(({c,s,p})=>{
    h+=`<tr>
      <td><span class="chip" style="background:${p.bg};color:${p.fg}">${p.lbl}</span></td>
      <td>${s?`<span class="semaforo" style="background:${s.bg};color:${s.fg}"><span class="dot" style="background:${s.dot}"></span>${s.txt}</span>`:'<span style="color:var(--gray-l)">—</span>'}</td>
      <td><b style="color:var(--navy)">${c.nombre}</b><br><span style="font-size:11px;color:var(--gray)">CC ${c.clienteDoc}</span></td>
      <td>${catChip(c.categoria)}</td>
      <td style="color:${c.saldoVencido>0?'var(--red)':'var(--gray)'};font-weight:600">${fmt(c.saldoVencido)}</td>
      <td>${c.diasMora||0}</td>
      <td>${fmt(c.cuotaValor)}</td>
      <td style="display:flex;gap:5px">${waBtn(c)}<button class="btn btn-ghost btn-sm" onclick="openCliente('${c.id}')">Ver</button></td>
    </tr>`;});
  h+=`</tbody></table></div></div>`;
  return h;
}



// ─────────── CARTERA GENERAL ───────────
let carteraFiltros={busca:"",cat:"Todas",estado:"Todos",sede:"Todas",vista:null};
function renderCartera(){
  let cs=filtraCartera();
  const vistas=STATE.vistas.map(v=>`<option value="${v.id}">${v.nombre}</option>`).join("");
  const periodos=[...new Set(STATE.importaciones.map(i=>i.periodo))];
  let h=head("📁 Cartera general",`${cs.length} créditos. Busca, filtra, ordena y abre el detalle de cada uno.`,
    `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <select class="inp" id="exp_periodo" style="font-size:12.5px">
        <option value="todo">Exportar: toda la información</option>
        ${periodos.map(p=>`<option value="${p}">Exportar solo periodo ${p}</option>`).join("")}
      </select>
      <button class="btn btn-primary" onclick="exportCartera()">⭳ Exportar Excel</button>
    </div>`);
  h+=`<div class="panel">
    <div class="toolbar">
      <input class="inp" style="flex:1;min-width:200px" placeholder="Buscar nombre, documento, celular…" value="${carteraFiltros.busca}" oninput="carteraFiltros.busca=this.value;refreshCartera()">
      <select class="inp" onchange="carteraFiltros.cat=this.value;refreshCartera()">${optSel(["Todas","A","B","C","D","E1","E2"],carteraFiltros.cat)}</select>
      <select class="inp" onchange="carteraFiltros.estado=this.value;refreshCartera()">${optSel(["Todos","Activo","Pagado","Cancelado","Finalizado","Refinanciado","Castigado"],carteraFiltros.estado)}</select>
      <select class="inp" onchange="carteraFiltros.sede=this.value;refreshCartera()">${optSel(["Todas","Ibague","Girardot","Rovira","Neiva"],carteraFiltros.sede)}</select>
      <button class="btn btn-ghost btn-sm" onclick="limpiarFiltros()">Limpiar</button>
      <button class="btn btn-ghost btn-sm" onclick="guardarVista()">★ Guardar vista</button>
      ${STATE.vistas.length?`<select class="inp" onchange="aplicarVista(this.value)"><option value="">Vistas guardadas…</option>${vistas}</select>`:''}
    </div>
    <div id="carteraTable">${carteraTable(cs)}</div>
  </div>`;
  return h;
}
function carteraTable(cs){
  if(!cs.length)return `<div class="empty"><div class="ic">🔍</div><h3>Sin resultados</h3><p>Ajusta los filtros o la búsqueda.</p></div>`;
  let h=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Cliente</th><th>Entidad</th><th>Sede</th><th>Categoría</th><th>Estado</th>
    <th>Saldo total</th><th>Saldo vencido</th><th>Días mora</th><th>Cuota</th><th>Vence</th><th></th>
    </tr></thead><tbody>`;
  cs.slice(0,300).forEach(c=>{
    h+=`<tr>
      <td style="cursor:pointer" onclick="openCliente('${c.id}')"><b style="color:var(--navy)">${c.nombre}</b><br><span style="font-size:11px;color:var(--gray)">CC ${c.clienteDoc} · ${c.celular||"sin cel"}</span></td>
      <td>${c.entidad}</td><td>${c.sede}</td><td>${catChip(c.categoria)}</td><td>${estChip(c.estado,c)}</td>
      <td style="font-weight:600">${fmt(c.saldoTotal)}</td>
      <td style="color:${c.saldoVencido>0?'var(--red)':'var(--gray-l)'}">${fmt(c.saldoVencido)}</td>
      <td>${c.diasMora||0}</td><td>${fmt(c.cuotaValor)}</td><td style="font-size:11.5px">${fechaBonita(c.fechaVence)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openCliente('${c.id}')">Detalle</button></td>
    </tr>`;});
  h+=`</tbody></table></div>`;
  if(cs.length>300)h+=`<div style="padding:10px;text-align:center;color:var(--gray);font-size:12px">Mostrando 300 de ${cs.length}. Usa filtros para acotar.</div>`;
  return h;
}
function filtraCartera(){
  let cs=visibleCreditos().slice();
  const f=carteraFiltros;
  if(f.busca.trim()){const q=f.busca.toLowerCase();
    cs=cs.filter(c=>c.nombre.toLowerCase().includes(q)||(c.clienteDoc||"").includes(q)||(c.celular||"").includes(q));}
  if(f.cat!=="Todas")cs=cs.filter(c=>c.categoria===f.cat);
  if(f.estado!=="Todos")cs=cs.filter(c=>c.estado===f.estado);
  if(f.sede!=="Todas")cs=cs.filter(c=>c.sede===f.sede);
  return cs;
}
function refreshCartera(){document.getElementById("carteraTable").innerHTML=carteraTable(filtraCartera());}
function limpiarFiltros(){carteraFiltros={busca:"",cat:"Todas",estado:"Todos",sede:"Todas",vista:null};render();}
function optSel(arr,sel){return arr.map(o=>`<option ${o===sel?'selected':''}>${o}</option>`).join("");}
function guardarVista(){
  const n=prompt("Nombre de la vista (ej. 'Vencidos de Ibagué'):");if(!n)return;
  STATE.vistas.push({id:uid(),nombre:n,filtros:{...carteraFiltros}});save();toast("Vista guardada");render();
}
function aplicarVista(id){const v=STATE.vistas.find(x=>x.id===id);if(v){carteraFiltros={...v.filtros};render();}}
async function exportCartera(){
  if(typeof ExcelJS==="undefined"){toast("No se pudo cargar el generador de Excel (revisa tu conexión a internet)");return;}
  const periodoSel=document.getElementById("exp_periodo")?document.getElementById("exp_periodo").value:"todo";
  const cs=filtraCartera();
  const CAT_HEX={A:"C8E6D0",B:"CFE0F2",C:"FBEFC0",D:"FBDCB8",E1:"F5C6C0",E2:"E3CFEF"};

  const wb=new ExcelJS.Workbook();
  wb.creator="GEM — Grupo Empresarial Marcal"; wb.created=new Date();
  const ws=wb.addWorksheet("Cartera "+STATE.empresaActiva,{views:[{state:"frozen",ySplit:5}]});

  // Logo institucional
  try{
    const imgId=wb.addImage({base64:LOGO_SRC,extension:"jpeg"});
    ws.addImage(imgId,{tl:{col:0,row:0},ext:{width:60,height:60}});
  }catch(e){}

  ws.mergeCells("C1:F2");
  ws.getCell("C1").value="GRUPO EMPRESARIAL MARCAL — GEM";
  ws.getCell("C1").font={bold:true,size:16,color:{argb:"FF0D1B2A"}};
  ws.mergeCells("C3:F3");
  ws.getCell("C3").value=`Cartera general — ${STATE.empresaActiva} — ${periodoSel==="todo"?"Toda la información":"Periodo "+periodoSel} — Generado ${new Date().toLocaleString("es-CO")}`;
  ws.getCell("C3").font={italic:true,size:10,color:{argb:"FF666666"}};
  ws.getRow(1).height=20; ws.getRow(2).height=20;

  const headers=["Entidad","Sede","Documento","Nombre","Celular","Categoría","Estado",
    "Saldo total","Saldo vencido","Capital del periodo","Interés del periodo","Mora del periodo","Anticipado del periodo",
    "Días mora","Cuota","Fecha vence","Observación"];
  const headerRow=ws.getRow(5);
  headers.forEach((h,i)=>{
    const cell=headerRow.getCell(i+1);
    cell.value=h;
    cell.font={bold:true,color:{argb:"FFFFFFFF"},size:10};
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0D1B2A"}};
    cell.alignment={vertical:"middle",horizontal:"center",wrapText:true};
  });
  headerRow.height=30;

  cs.forEach((c,i)=>{
    const pagosPeriodo = periodoSel==="todo"
      ? STATE.pagos.filter(p=>p.creditoId===c.id)
      : STATE.pagos.filter(p=>p.creditoId===c.id && p.fecha.slice(0,7)===periodoSel);
    const cap=pagosPeriodo.reduce((s,p)=>s+(p.capital||0),0);
    const inte=pagosPeriodo.reduce((s,p)=>s+(p.interes||0),0);
    const mora=pagosPeriodo.reduce((s,p)=>s+(p.mora||0),0);
    const anti=pagosPeriodo.reduce((s,p)=>s+(p.anticipado||0),0);
    const row=ws.addRow([c.entidad,c.sede,c.clienteDoc,c.nombre,c.celular||"",c.categoria,c.estado,
      c.saldoTotal,c.saldoVencido,cap,inte,mora,anti,c.diasMora||0,c.cuotaValor,
      c.fechaVence||"",c.obs||""]);
    const fillColor=CAT_HEX[c.categoria]||"FFFFFF";
    row.eachCell(cell=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF"+fillColor}};cell.border={bottom:{style:"thin",color:{argb:"FFDDDDDD"}}};});
    [8,9,10,11,12,13,15].forEach(colN=>{row.getCell(colN).numFmt="#,##0";});
  });

  ws.columns=[{width:12},{width:12},{width:13},{width:26},{width:13},{width:10},{width:12},
    {width:14},{width:14},{width:14},{width:14},{width:12},{width:14},{width:9},{width:12},{width:12},{width:26}];
  ws.autoFilter={from:"A5",to:"Q5"};

  // Resumen por categoria al final
  const r0=cs.length+8;
  ws.getCell(`A${r0}`).value="Resumen por categoría"; ws.getCell(`A${r0}`).font={bold:true,size:12,color:{argb:"FF0D1B2A"}};
  const cats=["A","B","C","D","E1","E2"];
  ws.getRow(r0+1).values=["Categoría","N° créditos","Saldo total"];
  ws.getRow(r0+1).font={bold:true,color:{argb:"FFFFFFFF"}};
  ws.getRow(r0+1).eachCell(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0D1B2A"}});
  cats.forEach((cat,i)=>{
    const sub=cs.filter(c=>c.categoria===cat);
    const row=ws.getRow(r0+2+i);
    row.values=[cat,sub.length,sub.reduce((s,c)=>s+c.saldoTotal,0)];
    row.getCell(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF"+(CAT_HEX[cat]||"FFFFFF")}};
    row.getCell(3).numFmt="#,##0";
  });

  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:"application/octet-stream"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`Cartera_GEM_${STATE.empresaActiva}_${periodoSel}.xlsx`;
  a.click();
  toast("Excel institucional exportado");
}

// ─────────── CLIENTES / FICHA 360 ───────────
function renderClientes(){
  let cs=visibleCreditos().slice();
  const docCount={}; cs.forEach(c=>{docCount[c.clienteDoc]=(docCount[c.clienteDoc]||0)+1;});
  const clientesUnicos=Object.keys(docCount).length;
  const conMultiples=Object.values(docCount).filter(n=>n>1).length;
  let h=head("👤 Clientes y créditos","Busca un cliente y abre su ficha 360° con historial completo.");
  h+=`<div class="kpi-grid">
    ${kpiC("Clientes únicos",clientesUnicos,"","blue")}
    ${kpiC("Créditos totales",cs.length,"","")}
    ${kpiC("Clientes con +1 crédito",conMultiples,"","orange")}
    ${kpiC("Saldo total",fmt(cs.reduce((s,c)=>s+c.saldoTotal,0)),"","green")}
  </div>
  <div class="panel"><div class="toolbar">
    <input class="inp" style="flex:1;min-width:220px" placeholder="Buscar cliente por nombre o documento…" oninput="filterClientes(this.value)">
  </div><div id="clientesList">${clientesList(cs.slice(0,50),docCount)}</div></div>`;
  return h;
}
function clientesList(cs,docCount){
  docCount=docCount||{};
  if(!cs.length)return `<div class="empty"><div class="ic">👤</div><h3>Sin clientes</h3></div>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Documento</th><th>Celular</th><th>Créditos</th><th>Categoría</th><th>Saldo</th><th></th></tr></thead><tbody>`+
    cs.map(c=>`<tr>
      <td style="cursor:pointer" onclick="openCliente('${c.id}')"><b style="color:var(--navy)">${c.nombre}</b></td>
      <td>${c.clienteDoc}</td><td>${c.celular||"—"}</td>
      <td>${docCount[c.clienteDoc]||1}</td><td>${catChip(c.categoria)}</td><td>${fmt(c.saldoTotal)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openCliente('${c.id}')">Ficha 360°</button></td></tr>`).join("")+
    `</tbody></table></div>`;
}
function filterClientes(q){
  q=q.toLowerCase();
  const cs=visibleCreditos().filter(c=>c.nombre.toLowerCase().includes(q)||(c.clienteDoc||"").includes(q)).slice(0,50);
  const docCount={}; visibleCreditos().forEach(c=>{docCount[c.clienteDoc]=(docCount[c.clienteDoc]||0)+1;});
  document.getElementById("clientesList").innerHTML=clientesList(cs,docCount);
}
function openCliente(cid){
  const c=STATE.creditos.find(x=>x.id===cid);if(!c)return;
  const gs=STATE.gestiones.filter(g=>g.creditoId===cid).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const prs=STATE.promesas.filter(p=>p.creditoId===cid);
  const pgs=STATE.pagos.filter(p=>p.creditoId===cid).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const otrosCreditos=STATE.creditos.filter(x=>x.clienteDoc===c.clienteDoc && x.id!==cid);
  const timeline=[
    ...gs.map(g=>({t:new Date(g.fecha),ic:"💬",txt:`Gestión — ${g.canal}: ${g.resultado}`,d:g.obs||g.responsable})),
    ...prs.map(p=>({t:new Date(p.fecha),ic:"🤝",txt:`Promesa creada — ${fmt(p.valor)} para ${fechaBonita(p.fechaPrometida)}`,d:"Estado: "+p.estado})),
    ...pgs.map(p=>({t:new Date(p.fecha),ic:"💵",txt:`Pago registrado — ${fmt(p.valor)}`,d:`Capital ${fmt(p.capital||0)} · Interés ${fmt(p.interes||0)}${p.mora?` · Mora ${fmt(p.mora)}`:''}${p.anticipado?` · Anticipado ${fmt(p.anticipado)}`:''}`})),
  ].sort((a,b)=>b.t-a.t);
  const s=semaforo(c),p=prioridad(c);
  const cs2=CAT_STY[c.categoria]||CAT_STY.A;
  const cuotasPagadas=pgs.length;
  const cuotasFaltan=Math.max(0,(c.cuotasPend||0));

  showModal(c.nombre,`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:10px;flex-wrap:wrap">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${estChip(c.estado,c)}
        <span class="chip" style="background:${p.bg};color:${p.fg}">Prioridad ${p.lbl}</span>
        ${s?`<span class="semaforo" style="background:${s.bg};color:${s.fg}"><span class="dot" style="background:${s.dot}"></span>${s.txt}</span>`:''}
      </div>
      <div style="text-align:right">
        <div style="font-size:10.5px;color:var(--gray);font-weight:700;text-transform:uppercase">Categoría</div>
        <div style="font-size:32px;font-weight:900;color:${cs2.fg};line-height:1">${c.categoria}</div>
      </div>
    </div>
    ${otrosCreditos.length?`<div style="background:var(--blue-bg);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--blue)">
      ℹ️ Este cliente tiene <b>${otrosCreditos.length} crédito(s) adicional(es)</b> en el sistema.</div>`:''}
    <div class="form-grid" style="margin-bottom:16px">
      ${info("Documento",c.clienteDoc)}${info("Celular",c.celular||"—")}
      ${info("Entidad",c.entidad)}${info("Sede",c.sede)}
      ${info("Saldo total",fmt(c.saldoTotal))}${info("Saldo vencido",fmt(c.saldoVencido))}
      ${info("Cuota mensual",fmt(c.cuotaValor))}${info("Día de pago",c.diaPago||"—")}
      ${info("Cuotas ya pagadas",cuotasPagadas)}${info("Cuotas faltantes",cuotasFaltan)}
      ${info("Inicio",fechaBonita(c.fechaInicio))}${info("Vence",fechaBonita(c.fechaVence))}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
      ${waBtn(c)}
      <button class="btn btn-ghost btn-sm" onclick="openGestion('${c.id}')">Registrar gestión</button>
      <button class="btn btn-ghost btn-sm" onclick="openPromesa('${c.id}')">Crear promesa</button>
      <button class="btn btn-ghost btn-sm" onclick="openPago('${c.id}')">Registrar pago</button>
    </div>
    <div style="font-weight:700;color:var(--navy);margin-bottom:10px;font-size:14.5px">🕒 Línea de tiempo (gestiones, pagos y promesas)</div>
    ${timeline.length?timeline.map(e=>`<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f2eee2">
      <span style="font-size:17px">${e.ic}</span>
      <div style="flex:1"><div style="font-size:13px;color:var(--navy);font-weight:600">${e.txt}</div>
      ${e.d?`<div style="font-size:12px;color:var(--gray)">${e.d}</div>`:''}
      <div style="font-size:11px;color:var(--gray-l)">${e.t.toLocaleString("es-CO")}</div></div></div>`).join("")
      :`<div style="color:var(--gray);font-size:13px;padding:10px 0">Sin eventos registrados aún. Registra una gestión, promesa o pago.</div>`}
  `);
}
function info(l,v){return `<div class="field"><label>${l}</label><div style="font-size:14px;color:var(--navy);font-weight:600;padding:2px 0">${v}</div></div>`;}

// ─────────── PAGOS ───────────
function renderPagos(){
  let h=head("💵 Pagos",`${STATE.pagos.length} pagos registrados. Haz clic en cualquier pago para ver el detalle completo y el comprobante.`);
  h+=`<div class="panel"><div class="panel-title">Historial de pagos</div>`;
  if(!STATE.pagos.length)h+=`<div class="empty"><div class="ic">💵</div><h3>Sin pagos registrados</h3><p>Los pagos se registran desde la ficha del cliente o los cobros del día.</p></div>`;
  else h+=STATE.pagos.slice().reverse().map(p=>pagoRow(p)).join("");
  h+=`</div>`;return h;
}
function pagoRow(p){
  const c=STATE.creditos.find(x=>x.id===p.creditoId);
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 6px;border-bottom:1px solid #f2eee2;cursor:pointer;border-radius:8px" onclick="openPagoDetalle('${p.id}')" onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background='transparent'">
    <div><b style="color:var(--navy);font-size:14.5px">${c?c.nombre:"—"}</b>
      <div style="font-size:12.5px;color:var(--gray)">${fmt(p.valor)} · ${p.metodo||"—"} · ${fechaBonita(p.fecha.slice(0,10))} ${p.comprobante?'· 📎 con comprobante':'· sin comprobante'}</div></div>
    <span class="chip" style="background:var(--green-bg);color:var(--green)">Registrado</span>
  </div>`;
}
function openPagoDetalle(id){
  const p=STATE.pagos.find(x=>x.id===id); if(!p)return;
  const c=STATE.creditos.find(x=>x.id===p.creditoId);
  showModal("Detalle del pago",`
    <div class="form-grid" style="margin-bottom:14px">
      ${info("Cliente",c?c.nombre:"—")}${info("Documento",c?c.clienteDoc:"—")}
      ${info("Capital",fmt(p.capital||0))}${info("Interés corriente",fmt(p.interes||0))}
      ${info("Interés de mora",fmt(p.mora||0))}${info("Anticipado",fmt(p.anticipado||0))}
      ${info("Total pagado",fmt(p.valor))}${info("Método",p.metodo||"—")}
      ${info("Fecha",fechaBonita(p.fecha.slice(0,10)))}${info("Referencia",p.referencia||"—")}
      ${info("Responsable",p.responsable||"—")}${info("Empresa",c?c.entidad:"—")}
    </div>
    ${p.obs?`<div class="field" style="margin-bottom:14px"><label>Observaciones</label><div style="font-size:13.5px;color:var(--navy)">${p.obs}</div></div>`:''}
    <div class="field"><label>Comprobante</label>
      ${p.comprobante?
        (p.comprobante.startsWith("data:image")?
          `<img src="${p.comprobante}" style="max-width:100%;border-radius:10px;border:1px solid var(--line);margin-top:6px">`
          :`<a class="btn btn-ghost btn-sm" href="${p.comprobante}" download="${p.comprobanteNombre||'comprobante'}" style="margin-top:6px;display:inline-flex">⭳ Descargar ${p.comprobanteNombre||'archivo'}</a>`)
        :`<div style="color:var(--gray);font-size:13px;margin-top:4px">No se adjuntó comprobante para este pago.</div>`}
    </div>
  `);
}

// ─────────── PROMESAS ───────────
function renderPromesas(){
  // marcar incumplidas
  STATE.promesas.forEach(p=>{if(p.estado==="Pendiente"&&p.fechaPrometida<iso(hoy())){
    const pago=STATE.pagos.find(pg=>pg.creditoId===p.creditoId&&pg.fecha.slice(0,10)>=p.fecha.slice(0,10));
    if(!pago)p.estado="Incumplida";}});
  save();
  let h=head("🤝 Promesas de pago",`${STATE.promesas.length} promesas registradas. Haz clic en una fila para ver el detalle.`);
  if(!STATE.promesas.length){h+=`<div class="empty card" style="padding:44px"><div class="ic">🤝</div><h3>Sin promesas</h3><p>Crea promesas de pago desde la ficha del cliente o los cobros del día.</p></div>`;return h;}
  h+=`<div class="panel" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Cliente</th><th>Valor prometido</th><th>Fecha prometida</th><th>Estado</th><th>Canal</th></tr></thead><tbody>`;
  STATE.promesas.slice().reverse().forEach(p=>{const c=STATE.creditos.find(x=>x.id===p.creditoId);
    const est={Pendiente:{bg:"var(--blue-bg)",fg:"var(--blue)"},Cumplida:{bg:"var(--green-bg)",fg:"var(--green)"},
      Incumplida:{bg:"var(--red-bg)",fg:"var(--red)"},Reprogramada:{bg:"var(--orange-bg)",fg:"var(--orange)"},
      Cancelada:{bg:"#eee",fg:"var(--gray)"},"Cumplida parcialmente":{bg:"var(--yellow-bg)",fg:"var(--yellow)"}}[p.estado]||{bg:"#eee",fg:"#000"};
    h+=`<tr style="cursor:pointer" onclick="openPromesaDetalle('${p.id}')"><td><b>${c?c.nombre:"—"}</b></td><td>${fmt(p.valor)}</td><td>${fechaBonita(p.fechaPrometida)}</td>
      <td><span class="chip" style="background:${est.bg};color:${est.fg}">${p.estado}</span></td><td>${p.canal||"—"}</td></tr>`;});
  h+=`</tbody></table></div></div>`;return h;
}
function openPromesaDetalle(id){
  const p=STATE.promesas.find(x=>x.id===id); if(!p)return;
  const c=STATE.creditos.find(x=>x.id===p.creditoId);
  showModal("Detalle de la promesa",`
    <div class="form-grid" style="margin-bottom:14px">
      ${info("Cliente",c?c.nombre:"—")}${info("Documento",c?c.clienteDoc:"—")}
      ${info("Valor prometido",fmt(p.valor))}${info("Fecha prometida",fechaBonita(p.fechaPrometida))}
      ${info("Canal",p.canal||"—")}${info("Estado",p.estado)}
      ${info("Fecha de gestión",fechaBonita((p.fecha||"").slice(0,10)))}
    </div>
    ${p.obs?`<div class="field" style="margin-bottom:14px"><label>Observaciones</label><div style="font-size:13.5px;color:var(--navy)">${p.obs}</div></div>`:''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${p.estado!=="Cumplida"?`<button class="btn btn-sm" style="background:var(--green-bg);color:var(--green)" onclick="cumplirPromesa('${p.id}');closeModal()">Marcar cumplida</button>`:''}
      ${p.estado!=="Cancelada"?`<button class="btn btn-sm" style="background:#eee;color:var(--gray)" onclick="cambiarEstadoPromesa('${p.id}','Cancelada')">Cancelar</button>`:''}
      ${p.estado!=="Reprogramada"?`<button class="btn btn-sm" style="background:var(--orange-bg);color:var(--orange)" onclick="cambiarEstadoPromesa('${p.id}','Reprogramada')">Reprogramar</button>`:''}
    </div>
  `);
}
function cambiarEstadoPromesa(id,estado){const p=STATE.promesas.find(x=>x.id===id);if(p){p.estado=estado;save();toast("Promesa actualizada");closeModal();render();}}
function cumplirPromesa(id){const p=STATE.promesas.find(x=>x.id===id);if(p){p.estado="Cumplida";save();toast("Promesa cumplida");render();}}

// ═══════════ MODALES DE ACCIÓN ═══════════
function showModal(title,body){
  document.getElementById("modalBox").innerHTML=`<div class="modal-head"><h3>${title}</h3><span class="modal-close" onclick="closeModal()">×</span></div><div class="modal-body">${body}</div>`;
  document.getElementById("modalBg").classList.add("show");
}
function closeModal(){document.getElementById("modalBg").classList.remove("show");}

function openGestion(cid){
  const c=STATE.creditos.find(x=>x.id===cid);
  showModal("Registrar gestión — "+c.nombre,`
    <div class="form-grid">
      <div class="field"><label>Canal</label><select class="inp" id="g_canal">${optSel(["WhatsApp","Llamada","Correo","Presencial","Otro"])}</select></div>
      <div class="field"><label>Resultado</label><select class="inp" id="g_res">${optSel(["Contactado","No responde","Número inválido","Promesa de pago","Pago realizado","Solicita información","Reprogramado","Caso especial"])}</select></div>
      <div class="field full"><label>Observación</label><textarea class="inp" id="g_obs" rows="3"></textarea></div>
      <div class="field"><label>Próxima gestión</label><input type="date" class="inp" id="g_prox"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveGestion('${cid}')">Guardar gestión</button></div>`);
}
function saveGestion(cid){
  STATE.gestiones.push({id:uid(),creditoId:cid,fecha:new Date().toISOString(),
    canal:val("g_canal"),resultado:val("g_res"),obs:val("g_obs"),proxima:val("g_prox"),responsable:currentUser()?currentUser().nombre:"Sistema"});
  save();closeModal();toast("Gestión registrada");render();
}
function openPromesa(cid){
  const c=STATE.creditos.find(x=>x.id===cid);
  showModal("Crear promesa — "+c.nombre,`
    <div class="form-grid">
      <div class="field"><label>Valor prometido</label><input type="number" class="inp" id="p_val" value="${c.cuotaValor}"></div>
      <div class="field"><label>Fecha prometida</label><input type="date" class="inp" id="p_fecha" value="${iso(hoy())}"></div>
      <div class="field"><label>Canal</label><select class="inp" id="p_canal">${optSel(["WhatsApp","Llamada","Presencial","Correo"])}</select></div>
      <div class="field full"><label>Observaciones</label><textarea class="inp" id="p_obs" rows="2"></textarea></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePromesa('${cid}')">Guardar promesa</button></div>`);
}
function savePromesa(cid){
  STATE.promesas.push({id:uid(),creditoId:cid,fecha:new Date().toISOString(),
    valor:+val("p_val"),fechaPrometida:val("p_fecha"),canal:val("p_canal"),obs:val("p_obs"),estado:"Pendiente"});
  save();closeModal();toast("Promesa creada");render();
}
function openPago(cid){
  const c=STATE.creditos.find(x=>x.id===cid);
  const capSug=Math.round((c.cuotaValor||0)*0.8), intSug=(c.cuotaValor||0)-capSug;
  showModal("Registrar pago — "+c.nombre,`
    <div style="font-size:12px;color:var(--gray);margin-bottom:10px">Desglosa el pago para que el informe diario de capital e intereses quede exacto.</div>
    <div class="form-grid">
      <div class="field"><label>Capital</label><input type="number" class="inp" id="pg_cap" value="${capSug}"></div>
      <div class="field"><label>Interés corriente</label><input type="number" class="inp" id="pg_int" value="${intSug}"></div>
      <div class="field"><label>Interés de mora</label><input type="number" class="inp" id="pg_mora" value="0"></div>
      <div class="field"><label>Valor anticipado</label><input type="number" class="inp" id="pg_ant" value="0"></div>
      <div class="field"><label>Método</label><select class="inp" id="pg_met">${optSel(["Bancolombia","Efectivo"])}</select></div>
      <div class="field"><label>Fecha</label><input type="date" class="inp" id="pg_fecha" value="${iso(hoy())}"></div>
      <div class="field full"><label>Referencia (opcional)</label><input class="inp" id="pg_ref"></div>
      <div class="field full"><label>Comprobante (imagen o PDF)</label><input type="file" class="inp" id="pg_file" accept="image/*,.pdf"></div>
      <div class="field full"><label>Observaciones</label><textarea class="inp" id="pg_obs" rows="2"></textarea></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePago('${cid}')">Registrar pago</button></div>`);
}
async function savePago(cid){
  const c=STATE.creditos.find(x=>x.id===cid);
  const capital=+val("pg_cap")||0, interes=+val("pg_int")||0, mora=+val("pg_mora")||0, anticipado=+val("pg_ant")||0;
  const valor=capital+interes+mora+anticipado;
  const fileInput=document.getElementById("pg_file");
  let comprobante=null, comprobanteNombre=null;
  if(fileInput && fileInput.files && fileInput.files[0]){
    const file=fileInput.files[0];
    comprobanteNombre=file.name;
    comprobante=await new Promise((res)=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(file);});
  }
  STATE.pagos.push({id:uid(),creditoId:cid,fecha:val("pg_fecha")+"T12:00:00",capital,interes,mora,anticipado,valor,
    metodo:val("pg_met"),referencia:val("pg_ref"),obs:val("pg_obs"),estado:"Registrado",
    comprobante,comprobanteNombre,responsable:currentUser()?currentUser().nombre:"Sistema"});
  // Reflejar el pago en el saldo del credito (capital + anticipado reducen la deuda; interes y mora no)
  if(c){
    const reduccion=capital+anticipado;
    c.saldoTotal=Math.max(0,c.saldoTotal-reduccion);
    c.saldoVencido=Math.max(0,c.saldoVencido-reduccion);
    c.saldoSinVencer=Math.max(0,c.saldoTotal-c.saldoVencido);
    if(c.saldoVencido===0) c.diasMora=0;
  }
  save();closeModal();toast("Pago registrado y saldo actualizado");render();
}
function val(id){const e=document.getElementById(id);return e?e.value:"";}



// ─────────── IMPORTAR EXCEL ───────────
let importPreview=null;
function renderImportar(){
  let h=head("📥 Importar Excel","Sube el archivo de cartera. El sistema detecta la entidad, la sede, la fecha y el periodo automáticamente — no hay que indicarlos a mano.");
  h+=`<div class="panel">
    <div class="panel-title">Actualizar cartera desde Excel</div>
    <div style="border:2px dashed var(--line);border-radius:12px;padding:30px;text-align:center;background:var(--cream)">
      <div style="font-size:34px;margin-bottom:8px">📥</div>
      <div style="font-weight:700;color:var(--navy);margin-bottom:4px">Selecciona el archivo Excel del día</div>
      <div style="font-size:12.5px;color:var(--gray);margin-bottom:6px">Formatos .xlsx o .xls exportados de CISCAFÉ</div>
      <div style="font-size:12px;color:var(--gray);margin-bottom:16px">📅 Fecha y hora de carga: <b style="color:var(--navy)">${new Date().toLocaleString("es-CO")}</b> · Periodo: <b style="color:var(--navy)">${iso(hoy()).slice(0,7)}</b> (se registran automáticamente)</div>
      <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none" onchange="procesarArchivo(this.files[0])">
      <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">Seleccionar archivo</button>
      <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="descargarPlantillaExcel()">⭳ Descargar plantilla Excel (Coomsertar + Coopfisol)</button></div>
    </div>
    <div id="importResult"></div>
  </div>
  <div class="panel">
    <div class="panel-title">Historial de importaciones</div>
    ${STATE.importaciones.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha y hora</th><th>Archivo</th><th>Entidad detectada</th><th>Periodo</th><th>Registros</th><th>Usuario</th></tr></thead><tbody>`+
      STATE.importaciones.slice().reverse().map(im=>`<tr><td>${new Date(im.fecha).toLocaleString("es-CO")}</td><td>${im.archivo}</td><td>${im.entidad}</td><td>${im.periodo}</td><td>${im.registros}</td><td>${im.usuario}</td></tr>`).join("")+
      `</tbody></table></div>`:`<div class="empty"><div class="ic">📄</div><h3>Sin importaciones</h3></div>`}
  </div>`;
  return h;
}
function detectarEntidad(wb){
  // Busca en los nombres de hoja o en el contenido si menciona Coopfisol; por defecto Coomsertar
  const nombres=wb.SheetNames.join(" ").toUpperCase();
  if(nombres.includes("COOPFISOL"))return "Coopfisol";
  return "Coomsertar";
}
function procesarArchivo(file){
  if(!file)return;
  const res=document.getElementById("importResult");
  if(typeof XLSX==="undefined"){
    res.innerHTML=`<div style="margin-top:16px;padding:16px;background:var(--red-bg);border-radius:12px;color:var(--red);font-size:13px">
      No se pudo cargar el lector de Excel (necesita conexión a internet la primera vez). Verifica tu conexión y recarga la página. Una vez cargado, funciona sin problema.</div>`;
    return;
  }
  res.innerHTML=`<div style="padding:20px;text-align:center;color:var(--gray)">⏳ Procesando ${file.name}…</div>`;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
      const parsed=parseCarteraWB(wb);
      const entidad=detectarEntidad(wb);
      importPreview={file:file.name,rows:parsed.rows,warnings:parsed.warnings,
        entidad, fecha:new Date().toISOString(), periodo:iso(hoy()).slice(0,7)};
      mostrarPreview();
    }catch(err){res.innerHTML=`<div style="padding:18px;color:var(--red)">Error al leer el archivo: ${err.message}</div>`;}
  };
  reader.readAsArrayBuffer(file);
}
function parseCarteraWB(wb){
  // buscar la primera hoja que parezca detalle de cartera
  const rows=[]; const warnings=[];
  let currentCat=null;
  for(const sn of wb.SheetNames){
    const ws=wb.Sheets[sn];
    const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
    // heurística: buscar fila con NIT/NOMBRE
    let hdrRow=-1, colMap={};
    for(let i=0;i<Math.min(data.length,15);i++){
      const row=data[i].map(x=>String(x).toUpperCase().trim());
      if(row.some(c=>c.includes("NIT"))&&row.some(c=>c.includes("NOMBRE"))){hdrRow=i;
        row.forEach((c,j)=>{
          if(c.includes("NIT")||c.includes("DOCUMENTO")||c.includes("CEDULA"))colMap.nit=j;
          else if(c.includes("NOMBRE"))colMap.nombre=j;
          else if(c.includes("CELULAR")||c.includes("TELEFONO"))colMap.cel=j;
          else if(c==="SALDO"||c.includes("SALDO TOTAL"))colMap.saldo=j;
          else if(c.includes("SIN VENCER"))colMap.sinv=j;
          else if(c.includes("FECHA")&&colMap.fecha==null)colMap.fecha=j;
          else if(c.includes("VENCE"))colMap.vence=j;
          else if(c.includes("SEDE")||c.includes("CIUDAD"))colMap.sede=j;
        });break;}
    }
    if(hdrRow<0)continue;
    // detectar sede desde el nombre de la hoja si no hay columna
    let sedeHoja="Ibague";
    const snUp=sn.toUpperCase();
    if(snUp.includes("GIRARDOT"))sedeHoja="Girardot";
    else if(snUp.includes("ROVIRA"))sedeHoja="Rovira";
    else if(snUp.includes("NEIVA"))sedeHoja="Neiva";
    for(let i=hdrRow+1;i<data.length;i++){
      const row=data[i]; const a=String(row[0]||"").trim();
      if(!a)continue;
      if(a.toUpperCase().includes("CATEGORIA")){currentCat=detectCat(a);continue;}
      if(a.toUpperCase().startsWith("TOTAL"))continue;
      const nombre=String(row[colMap.nombre]||"").trim();
      if(!nombre)continue;
      const saldo=num(row[colMap.saldo]);
      if(saldo<=0){warnings.push(`Fila ${i+1}: saldo cero o inválido (${nombre})`);continue;}
      rows.push({clienteDoc:String(row[colMap.nit]||"").trim(),nombre,
        celular:limpiarCel(row[colMap.cel]),saldoTotal:saldo,
        saldoSinVencer:num(row[colMap.sinv])||saldo,categoria:currentCat||"A",
        sede: colMap.sede!=null && row[colMap.sede] ? String(row[colMap.sede]).trim() : sedeHoja});
    }
  }
  // detección de duplicados
  const seen={}; rows.forEach(r=>{if(seen[r.clienteDoc])warnings.push(`Documento duplicado: ${r.nombre}`);seen[r.clienteDoc]=1;});
  return {rows,warnings};
}
function detectCat(s){s=s.toUpperCase();if(s.includes("E 1")||s.includes("E1"))return"E1";if(s.includes("E 2")||s.includes("E2"))return"E2";
  if(s.includes("CATEGORIA B"))return"B";if(s.includes("CATEGORIA C"))return"C";if(s.includes("CATEGORIA D"))return"D";return"A";}
function num(v){if(v==null||v==="")return 0;const n=parseFloat(String(v).replace(/[^0-9.-]/g,""));return isNaN(n)?0:n;}
function limpiarCel(v){const d=String(v||"").replace(/\D/g,"");return d.length>=10?d.slice(0,10):"";}

function mostrarPreview(){
  const p=importPreview;
  const nuevos=p.rows.filter(r=>!STATE.creditos.some(c=>c.clienteDoc===r.clienteDoc)).length;
  const actualiza=p.rows.length-nuevos;

  // ═══ ARQUEO / CONTINGENCIA: comparar contra el saldo actual antes de aplicar ═══
  const inconsistencias=[];
  p.rows.forEach(r=>{
    const ex=STATE.creditos.find(c=>c.clienteDoc===r.clienteDoc);
    if(ex){
      const diff=Math.abs(ex.saldoTotal-r.saldoTotal);
      // si el saldo nuevo sube en vez de bajar de forma inusual (más del doble), o cambia mas de 50% sin pago registrado, marcar
      const huboPago=STATE.pagos.some(pg=>pg.creditoId===ex.id && pg.fecha.slice(0,7)===p.periodo);
      if(diff>0 && r.saldoTotal>ex.saldoTotal && !huboPago){
        inconsistencias.push({clienteDoc:r.clienteDoc,nombre:r.nombre,saldoAnterior:ex.saldoTotal,saldoNuevo:r.saldoTotal,diff,creditoId:ex.id});
      }
    }
  });
  importPreview.inconsistencias=inconsistencias;
  importPreview.reconfirmaciones={};

  document.getElementById("importResult").innerHTML=`
    <div style="margin-top:18px;padding:16px;background:var(--cream);border-radius:12px">
      <div style="font-weight:700;color:var(--navy);margin-bottom:10px">Vista previa — ${p.file}</div>
      <div class="kpi-grid" style="margin-bottom:12px">
        ${kpiC("Entidad detectada",p.entidad,"","blue")}
        ${kpiC("Registros válidos",p.rows.length,"","green")}
        ${kpiC("Clientes nuevos",nuevos,"","")}
        ${kpiC("Advertencias",p.warnings.length,"","orange")}
      </div>
      ${p.warnings.length?`<details style="margin-bottom:12px"><summary style="cursor:pointer;color:var(--orange);font-weight:600;font-size:12.5px">Ver ${p.warnings.length} advertencias</summary>
        <div style="max-height:140px;overflow-y:auto;font-size:11.5px;color:var(--gray);margin-top:8px">${p.warnings.slice(0,50).map(w=>"• "+w).join("<br>")}</div></details>`:''}
      ${inconsistencias.length?`
      <div style="background:var(--red-bg);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-weight:800;color:var(--red);margin-bottom:8px">🚨 Arqueo: ${inconsistencias.length} saldo(s) no cuadran (subieron sin pago registrado este mes)</div>
        <div style="font-size:12px;color:var(--red);margin-bottom:10px">Confirma manualmente el valor correcto para cada caso antes de continuar.</div>
        ${inconsistencias.map((inc,i)=>`<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-weight:700;color:var(--navy);font-size:13px">${inc.nombre} <span style="color:var(--gray);font-weight:400">(CC ${inc.clienteDoc})</span></div>
          <div style="font-size:12px;color:var(--gray);margin:4px 0">Saldo anterior: ${fmt(inc.saldoAnterior)} → Nuevo en archivo: ${fmt(inc.saldoNuevo)} (diferencia ${fmt(inc.diff)})</div>
          <label style="font-size:11.5px;font-weight:600;color:var(--navy)">Valor real confirmado (edítalo si el archivo está mal):</label>
          <input type="number" class="inp" style="width:100%;margin-top:4px" value="${inc.saldoNuevo}" onchange="importPreview.reconfirmaciones['${inc.clienteDoc}']=+this.value">
        </div>`).join("")}
      </div>`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="confirmarImport()">Confirmar y actualizar cartera</button>
        <button class="btn btn-ghost" onclick="importPreview=null;document.getElementById('importResult').innerHTML=''">Cancelar</button>
      </div>
    </div>`;
}
function confirmarImport(){
  const p=importPreview;
  p.rows.forEach(r=>{
    // aplicar reconfirmación manual del arqueo si existe
    const saldoFinal = (p.reconfirmaciones && p.reconfirmaciones[r.clienteDoc]!=null) ? p.reconfirmaciones[r.clienteDoc] : r.saldoTotal;
    const ex=STATE.creditos.find(c=>c.clienteDoc===r.clienteDoc);
    if(ex){ex.saldoTotal=saldoFinal;ex.saldoSinVencer=r.saldoSinVencer;
      ex.saldoVencido=Math.max(0,saldoFinal-r.saldoSinVencer);ex.categoria=r.categoria;
      if(r.celular)ex.celular=r.celular; if(r.sede)ex.sede=r.sede;}
    else{STATE.creditos.push({id:uid(),clienteDoc:r.clienteDoc,nombre:r.nombre,celular:r.celular,
      entidad:p.entidad,sede:r.sede||"Ibague",responsable:"Sin asignar",categoria:r.categoria,estado:"Activo",
      fechaInicio:"",fechaVence:"",diaPago:null,saldoTotal:saldoFinal,saldoSinVencer:r.saldoSinVencer,
      saldoVencido:Math.max(0,saldoFinal-r.saldoSinVencer),cuotaValor:0,cuotasPend:0,diasMora:0,obs:"",etiquetas:[]});}
  });
  STATE.importaciones.push({id:uid(),fecha:p.fecha,archivo:p.file,
    entidad:p.entidad,periodo:p.periodo,registros:p.rows.length,usuario:currentUser()?currentUser().nombre:"Sistema"});
  STATE.lastUpdate=new Date().toISOString();
  save();importPreview=null;
  toast("Cartera actualizada correctamente");
  go("dashboard");
}
function descargarPlantillaExcel(){
  const headerRow=["NIT","NOMBRE","CELULAR","SALDO","SIN VENCER","SEDE"];
  const ejemplo=[["","CATEGORIA A RIESGO NORMAL","","","",""],
    ["12345678","EJEMPLO CLIENTE UNO","3001234567",1000000,1000000,"Ibague"],
    ["","CATEGORIA E2 RIESGO INCOBRABLE","","","",""],
    ["87654321","EJEMPLO CLIENTE DOS","3009876543",500000,0,"Girardot"],
    ["","TOTAL","","1500000","1000000",""]];
  const wsC=XLSX.utils.aoa_to_sheet([headerRow,...ejemplo]);
  const wsF=XLSX.utils.aoa_to_sheet([headerRow,["","(Pega aquí los datos de Coopfisol con el mismo formato)","","","",""]]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,wsC,"COOMSERTAR");
  XLSX.utils.book_append_sheet(wb,wsF,"COOPFISOL");
  XLSX.writeFile(wb,"Plantilla_Cartera_GEM.xlsx");
  toast("Plantilla descargada");
}

// ─────────── CALIDAD DE DATOS ───────────
function renderCalidad(){
  const cs=visibleCreditos();
  const celInv=cs.filter(c=>!c.celular||c.celular.length!==10);
  const dups={};cs.forEach(c=>dups[c.clienteDoc]=(dups[c.clienteDoc]||0)+1);
  const docDup=cs.filter(c=>dups[c.clienteDoc]>1);
  const sinResp=cs.filter(c=>c.responsable==="Sin asignar"&&c.estado==="Activo");
  const sinCuota=cs.filter(c=>c.estado==="Activo"&&!c.diaPago);
  const saldoInc=cs.filter(c=>c.saldoVencido>c.saldoTotal);

  // ═══ ARQUEO GENERAL: comparar saldo total actual vs. la última importación registrada ═══
  const ultimaImport=STATE.importaciones.filter(i=>i.entidad===STATE.empresaActiva || STATE.empresaActiva==="Ambas").slice(-1)[0];
  const saldoActual=cs.reduce((s,c)=>s+c.saldoTotal,0);
  const totalPagosDesdeImport=ultimaImport ? STATE.pagos.filter(p=>{const c=STATE.creditos.find(x=>x.id===p.creditoId);return c && new Date(p.fecha)>=new Date(ultimaImport.fecha);}).reduce((s,p)=>s+(p.capital||0)+(p.anticipado||0),0) : 0;

  let h=head("✔️ Calidad de datos","Arqueo general de la cartera e inconsistencias detectadas para corregir.");
  h+=`<div class="panel" style="border-left:4px solid var(--gold)">
    <div class="panel-title">🧮 Arqueo general — ${STATE.empresaActiva}</div>
    <div class="form-grid">
      ${info("Última importación",ultimaImport?new Date(ultimaImport.fecha).toLocaleString("es-CO"):"Sin importaciones")}
      ${info("Saldo total actual de cartera",fmt(saldoActual))}
      ${info("Capital+anticipado recaudado desde la última carga",fmt(totalPagosDesdeImport))}
      ${info("Créditos en el sistema",cs.length)}
    </div>
    <div style="font-size:12px;color:var(--gray);margin-top:8px">Este arqueo compara el saldo vivo del sistema contra los movimientos registrados. Las inconsistencias detectadas al momento de importar un Excel nuevo aparecen automáticamente en la pantalla de importación, con espacio para reconfirmar el valor correcto de forma manual.</div>
  </div>`;
  h+=`<div class="kpi-grid">
    ${kpiC("Celulares inválidos",celInv.length,"","orange")}
    ${kpiC("Documentos duplicados",docDup.length,"","red")}
    ${kpiC("Sin responsable",sinResp.length,"","")}
    ${kpiC("Sin día de pago",sinCuota.length,"","")}
  </div>`;
  h+=calidadPanel("Celulares inválidos o faltantes",celInv,c=>`${c.nombre} — <span style="color:var(--red)">${c.celular||"vacío"}</span>`);
  h+=calidadPanel("Créditos activos sin día de pago",sinCuota,c=>`${c.nombre} — falta día de pago para el semáforo`);
  h+=calidadPanel("Saldos incoherentes (vencido > total)",saldoInc,c=>`${c.nombre} — vencido ${fmt(c.saldoVencido)} > total ${fmt(c.saldoTotal)}`);
  if(!celInv.length && !sinCuota.length && !saldoInc.length && !docDup.length){
    h+=`<div class="empty card" style="padding:40px"><div class="ic">✅</div><h3>Sin inconsistencias detectadas</h3><p>La cartera visible no presenta los problemas revisados por este módulo.</p></div>`;
  }
  return h;
}
function calidadPanel(titulo,arr,fmtFn){
  if(!arr.length)return "";
  return `<div class="panel"><div class="panel-title">${titulo} (${arr.length})</div>
    ${arr.slice(0,30).map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f2eee2;font-size:12.5px">
      <span>${fmtFn(c)}</span><button class="btn btn-ghost btn-sm" onclick="openCliente('${c.id}')">Corregir</button></div>`).join("")}
    ${arr.length>30?`<div style="font-size:11.5px;color:var(--gray);margin-top:8px">y ${arr.length-30} más…</div>`:''}</div>`;
}

// ─────────── INFORMES ───────────
let informePeriodo="mensual";
function renderInformes(){
  let h=head("📄 Informes","Genera y exporta informes de cartera por periodo o por tema específico.");
  const periodos=[["diario","Diario"],["semanal","Semanal"],["mensual","Mensual"],["trimestral","Trimestral"],["semestral","Semestral"],["anual","Anual"]];
  h+=`<div class="panel">
    <div class="panel-title">Periodo del informe</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${periodos.map(([k,t])=>`<button class="btn ${informePeriodo===k?'btn-primary':'btn-ghost'} btn-sm" onclick="informePeriodo='${k}';render()">${t}</button>`).join("")}
    </div>
  </div>`;
  const cs=visibleCreditos();
  const rango=rangoPeriodo(informePeriodo);
  const pagosRango=STATE.pagos.filter(p=>{const c=STATE.creditos.find(x=>x.id===p.creditoId);return c && cs.includes(c) && p.fecha.slice(0,10)>=rango.desde && p.fecha.slice(0,10)<=rango.hasta;});
  const totalRecaudo=pagosRango.reduce((s,p)=>s+p.valor,0);

  h+=`<div class="kpi-grid">
    ${kpiC("Recaudo del periodo",fmt(totalRecaudo),rango.label,"green")}
    ${kpiC("Pagos registrados",pagosRango.length,"","")}
    ${kpiC("Capital recaudado",fmt(pagosRango.reduce((s,p)=>s+(p.capital||0)+(p.anticipado||0),0)),"","blue")}
    ${kpiC("Interés recaudado",fmt(pagosRango.reduce((s,p)=>s+(p.interes||0)+(p.mora||0),0)),"","orange")}
  </div>`;

  const porEnt={},porSede={},porCat={};
  cs.forEach(c=>{porEnt[c.entidad]=(porEnt[c.entidad]||0)+c.saldoTotal;
    porSede[c.sede]=(porSede[c.sede]||0)+c.saldoTotal;
    porCat[c.categoria]=(porCat[c.categoria]||0)+c.saldoTotal;});
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px" class="dash-cols">
    ${tablaInforme("Por entidad",porEnt)}
    ${tablaInforme("Por sede",porSede)}
    ${tablaInforme("Por categoría",porCat)}
  </div>
  <div class="panel"><div class="panel-title">Informes específicos</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="exportCartera()">📊 Cartera completa (Excel)</button>
      <button class="btn btn-ghost" onclick="go('cartera');carteraFiltros.cat='E1';render()">🔴 Solo categoría E1</button>
      <button class="btn btn-ghost" onclick="go('cartera');carteraFiltros.cat='E2';render()">🔴 Solo categoría E2</button>
      <button class="btn btn-ghost" onclick="go('clientes')">👤 Listado de clientes</button>
      <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir / PDF de esta vista</button>
    </div>
    <div style="font-size:12px;color:var(--gray);margin-top:10px">Los informes conservan la identidad de GEM y no generan errores de división por cero (las metas en cero se muestran como 0%, no como error).</div>
  </div>`;
  return h;
}
function rangoPeriodo(k){
  const h=hoy(); const hastaStr=iso(h);
  const d=new Date(h);
  if(k==="diario"){return {desde:hastaStr,hasta:hastaStr,label:"Hoy"};}
  if(k==="semanal"){d.setDate(d.getDate()-7);return {desde:iso(d),hasta:hastaStr,label:"Últimos 7 días"};}
  if(k==="mensual"){d.setDate(d.getDate()-30);return {desde:iso(d),hasta:hastaStr,label:"Últimos 30 días"};}
  if(k==="trimestral"){d.setDate(d.getDate()-90);return {desde:iso(d),hasta:hastaStr,label:"Últimos 90 días"};}
  if(k==="semestral"){d.setDate(d.getDate()-182);return {desde:iso(d),hasta:hastaStr,label:"Últimos 6 meses"};}
  d.setDate(d.getDate()-365);return {desde:iso(d),hasta:hastaStr,label:"Últimos 12 meses"};
}
function tablaInforme(t,obj){
  const tot=Object.values(obj).reduce((a,b)=>a+b,0);
  return `<div class="panel"><div class="panel-title">${t}</div>
    ${Object.entries(obj).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f2eee2;font-size:12.5px">
      <span style="color:var(--navy);font-weight:600">${k}</span><span style="color:var(--gray)">${fmt(v)} <b style="color:var(--navy)">(${tot?(v/tot*100).toFixed(0):0}%)</b></span></div>`).join("")}
    <div style="display:flex;justify-content:space-between;padding:8px 0;margin-top:4px;border-top:2px solid var(--gold)">
      <b style="color:var(--navy)">Total</b><b style="color:var(--navy)">${fmt(tot)}</b></div></div>`;
}

// ─────────── EQUIPO ───────────
function renderEquipo(){
  const resp={};
  STATE.creditos.forEach(c=>{const r=c.responsable||"Sin asignar";
    if(!resp[r])resp[r]={creditos:0,saldo:0,gestiones:0,promesas:0,pagos:0};
    resp[r].creditos++;resp[r].saldo+=c.saldoTotal;});
  STATE.gestiones.forEach(g=>{if(resp[g.responsable])resp[g.responsable].gestiones++;});
  let h=head("Equipo","Productividad por gestor. Mide resultados reales, no solo mensajes enviados.");
  h+=`<div class="panel" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Gestor</th><th>Créditos</th><th>Saldo gestionado</th><th>Gestiones</th><th>Promesas</th><th>Pagos verificados</th></tr></thead><tbody>`;
  Object.entries(resp).forEach(([k,v])=>{
    const proms=STATE.promesas.filter(p=>{const c=STATE.creditos.find(x=>x.id===p.creditoId);return c&&c.responsable===k;}).length;
    const pagos=STATE.pagos.filter(p=>p.estado==="Verificado").length;
    h+=`<tr><td><b style="color:var(--navy)">${k}</b></td><td>${v.creditos}</td><td>${fmt(v.saldo)}</td><td>${v.gestiones}</td><td>${proms}</td><td>${pagos}</td></tr>`;});
  h+=`</tbody></table></div></div>
  <div style="font-size:11.5px;color:var(--gray)">En el MVP, la asignación de responsables se hace manualmente en cada crédito. En producción, cada gestor tendrá su propio acceso y sus métricas se calculan automáticamente.</div>`;
  return h;
}

// ─────────── PIPELINE COMERCIAL ───────────
const ETAPAS_PIPELINE = [
  {k:"LD", t:"Lead Interesado", color:"#1A3A5C", prob:10},
  {k:"INT_SSI", t:"Interesado Seguridad Social", color:"#2E86AB", prob:30},
  {k:"INT_CCF", t:"Interesado Caja Compensación", color:"#2E86AB", prob:30},
  {k:"INT_CRE", t:"Interesado Crédito", color:"#2E86AB", prob:30},
  {k:"SEG_SSI", t:"Seguimiento Seguridad Social", color:"#E67E22", prob:60},
  {k:"SEG_CCF", t:"Seguimiento Caja Compensación", color:"#E67E22", prob:60},
  {k:"SEG_CRE", t:"Seguimiento Crédito", color:"#E67E22", prob:60},
  {k:"VE", t:"Venta Efectiva", color:"#27AE60", prob:90},
  {k:"PP", t:"Pedido Pagado y Finalizado", color:"#0F7B6C", prob:100},
  {k:"LF", t:"Lead Frío", color:"#888888", prob:0},
];
function etapaInfo(k){return ETAPAS_PIPELINE.find(e=>e.k===k)||ETAPAS_PIPELINE[0];}
function probEtapa(k){const e=etapaInfo(k);return e.prob!=null?e.prob:0;}
function accionEtapa(k){
  const acciones={
    LD:"Responder bienvenida y calificar interés en las próximas 24h.",
    INT_SSI:"Enviar info de planes de seguridad social y resolver dudas.",
    INT_CCF:"Enviar info de caja de compensación y beneficios.",
    INT_CRE:"Enviar info de crédito según aportes.",
    SEG_SSI:"Hacer seguimiento de cierre — llamar o escribir hoy.",
    SEG_CCF:"Hacer seguimiento de cierre — llamar o escribir hoy.",
    SEG_CRE:"Hacer seguimiento de cierre — llamar o escribir hoy.",
    VE:"Confirmar pago y avanzar a Pedido Pagado.",
    PP:"Enviar bienvenida oficial como asociado.",
    LF:"Considerar para campaña de remarketing.",
  };
  return acciones[k]||"";
}
let pipelineFiltroEtapa="Todas";

// ─── Helpers comerciales compartidos ───
function misProspectosCom(){
  const u=currentUser();
  return STATE.prospectos.filter(p=> u && u.rol==="comercial" ? p.asesora===u.nombre : true);
}
function prospectosHoy(){
  const hoyStr=iso(hoy());
  return misProspectosCom().filter(p=>p.etapa!=="PP" && p.etapa!=="LF" && (!p.proxContacto || p.proxContacto<=hoyStr));
}

// ═══════════ PANEL COMERCIAL (dashboard con sumatorias) ═══════════
function renderPanelComercial(){
  const ps=misProspectosCom();
  const activos=ps.filter(p=>p.etapa!=="PP"&&p.etapa!=="LF");
  const ventas=ps.filter(p=>p.etapa==="VE"||p.etapa==="PP");
  const frios=ps.filter(p=>p.etapa==="LF");
  const valorTotal=ps.reduce((s,p)=>s+(p.valorPotencial||0),0);
  const valorActivo=activos.reduce((s,p)=>s+(p.valorPotencial||0),0);
  const valorGanado=ventas.reduce((s,p)=>s+(p.valorPotencial||0),0);
  const tasaConv = ps.length ? (ventas.length/ps.length*100) : 0;

  let h=head("📊 Panel comercial","Resumen de tu gestión de prospectos y conversión.",
    `<button class="btn btn-primary" onclick="openProspecto()">+ Nuevo prospecto</button>`);

  h+=`<div class="kpi-grid">
    ${kpiC("Prospectos activos",activos.length,fmt(valorActivo)+" en juego","blue")}
    ${kpiC("Requieren acción hoy",prospectosHoy().length,"Ver prospectos de hoy","orange")}
    ${kpiC("Ventas efectivas",ventas.length,fmt(valorGanado)+" ganado","green")}
    ${kpiC("Tasa de conversión",tasaConv.toFixed(1)+"%",ps.length+" prospectos totales","")}
  </div>`;

  // Embudo por etapa
  const conteo={}; ETAPAS_PIPELINE.forEach(e=>conteo[e.k]=0);
  ps.forEach(p=>{if(conteo[p.etapa]!=null)conteo[p.etapa]++;});
  const maxC=Math.max(...Object.values(conteo),1);
  h+=`<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px" class="dash-cols">
    <div class="panel">
      <div class="panel-title">Embudo por etapa</div>
      ${ETAPAS_PIPELINE.map(e=>{const n=conteo[e.k];
        return `<div style="margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px">
            <b style="color:${e.color}">${e.t}</b><span style="color:var(--gray)">${n}</span></div>
          <div style="height:9px;background:var(--line);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${n/maxC*100}%;background:${e.color};border-radius:6px;transition:width .4s"></div></div>
        </div>`;}).join("")}
    </div>
    <div class="panel">
      <div class="panel-title">Valor del pipeline</div>
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:12px;color:var(--gray);font-weight:600;text-transform:uppercase">Valor potencial total</div>
        <div style="font-size:30px;font-weight:800;color:var(--navy);margin:6px 0">${fmt(valorTotal)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line)">
        <span style="color:var(--gray)">En prospectos activos</span><b style="color:var(--blue)">${fmt(valorActivo)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line)">
        <span style="color:var(--gray)">Ya ganado (VE + PP)</span><b style="color:var(--green)">${fmt(valorGanado)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line)">
        <span style="color:var(--gray)">Leads fríos</span><b style="color:var(--gray)">${frios.length}</b></div>
    </div>
  </div>`;

  // Resumen por origen
  const origenes={}; ps.forEach(p=>{const o=p.origen||"Otro";origenes[o]=(origenes[o]||0)+1;});
  if(Object.keys(origenes).length){
    h+=`<div class="panel"><div class="panel-title">Prospectos por origen</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${Object.entries(origenes).map(([o,n])=>`<div style="background:var(--cream);border:1px solid var(--line);border-radius:12px;padding:12px 18px;text-align:center;min-width:120px">
        <div style="font-size:22px;font-weight:800;color:var(--navy)">${n}</div>
        <div style="font-size:12px;color:var(--gray)">${o}</div></div>`).join("")}
      </div></div>`;
  }
  return h;
}

// ═══════════ PROSPECTOS DE HOY ═══════════
function renderProspectosHoy(){
  const lista=prospectosHoy().sort((a,b)=>{
    const ord={LD:0,INT_SSI:1,INT_CCF:1,INT_CRE:1,SEG_SSI:2,SEG_CCF:2,SEG_CRE:2,VE:3};
    return (ord[a.etapa]||9)-(ord[b.etapa]||9);
  });
  const d=hoy().toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"});
  let h=head("📌 Prospectos de hoy",`Hoy es ${d}. Estos prospectos requieren tu gestión, ordenados por etapa.`);
  if(!lista.length){
    h+=`<div class="empty card" style="padding:50px"><div class="ic">✓</div>
      <h3>No hay prospectos pendientes para hoy</h3>
      <p>Aquí aparecen los prospectos cuya fecha de próximo contacto llegó o venció.</p></div>`;
    return h;
  }
  h+=`<div style="margin-bottom:8px;font-size:13px;color:var(--gray)"><b style="color:var(--navy)">${lista.length}</b> prospecto(s) por gestionar</div>`;
  lista.forEach(p=>{const e=etapaInfo(p.etapa);
    const vencido = p.proxContacto && p.proxContacto<iso(hoy());
    h+=`<div class="card" style="padding:15px;margin-bottom:11px;border-left:5px solid ${e.color}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="min-width:0">
          <div style="font-weight:700;color:var(--navy);font-size:16px">${p.nombre}</div>
          <div style="font-size:12.5px;color:var(--gray)">${p.ciudad||"—"} · ${p.servicio||"—"} <span class="chip" style="background:${e.color}22;color:${e.color}">${e.t}</span></div>
          <div style="font-size:12.5px;color:${vencido?'var(--red)':'var(--gray)'};margin-top:4px">👉 ${accionEtapa(p.etapa)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11.5px;color:var(--gray)">Valor potencial</div>
          <div style="font-weight:800;color:var(--navy);font-size:16px">${fmt(p.valorPotencial||0)}</div>
          ${vencido?'<span class="chip" style="background:var(--red-bg);color:var(--red);font-size:11px">⚠ Contacto vencido</span>':''}
        </div>
      </div>
      <div style="display:flex;gap:7px;margin-top:11px;flex-wrap:wrap">
        ${p.celular?`<a class="btn btn-wa btn-sm" href="https://wa.me/57${p.celular}" target="_blank">💬 WhatsApp</a>`:''}
        <button class="btn btn-ghost btn-sm" onclick="openProspecto('${p.id}')">Ver / gestionar</button>
      </div></div>`;});
  return h;
}

// ═══════════ INFORMES COMERCIALES ═══════════
function renderInformesComerciales(){
  const ps=misProspectosCom();
  let h=head("📄 Informes comerciales","Resumen exportable de tu gestión comercial.",
    `<button class="btn btn-primary" onclick="exportPipeline()">⭳ Exportar pipeline (Excel)</button>`);
  const ventas=ps.filter(p=>p.etapa==="VE"||p.etapa==="PP");
  const valorGanado=ventas.reduce((s,p)=>s+(p.valorPotencial||0),0);
  h+=`<div class="kpi-grid">
    ${kpiC("Total prospectos",ps.length,"","blue")}
    ${kpiC("Convertidos",ventas.length,"","green")}
    ${kpiC("Valor ganado",fmt(valorGanado),"","green")}
    ${kpiC("En seguimiento",ps.filter(p=>p.etapa.startsWith("SEG")).length,"","orange")}
  </div>`;
  // por etapa
  const conteo={}; ETAPAS_PIPELINE.forEach(e=>conteo[e.k]=0);
  ps.forEach(p=>{if(conteo[p.etapa]!=null)conteo[p.etapa]++;});
  h+=`<div class="panel"><div class="panel-title">Prospectos por etapa</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Etapa</th><th>Cantidad</th><th>Acción sugerida</th></tr></thead><tbody>
    ${ETAPAS_PIPELINE.map(e=>`<tr><td><span class="chip" style="background:${e.color}22;color:${e.color}">${e.t}</span></td><td>${conteo[e.k]}</td><td style="font-size:12.5px;color:var(--gray)">${accionEtapa(e.k)}</td></tr>`).join("")}
    </tbody></table></div></div>
  <div class="panel"><div class="panel-title">Exportar</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="exportPipeline()">📊 Pipeline completo (Excel)</button>
      <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir / PDF</button>
    </div></div>`;
  return h;
}
let pipelineVista="kanban"; // kanban | tabla
function renderPipeline(){
  const u=currentUser();
  const misProspectos = STATE.prospectos.filter(p=> u.rol==="comercial" ? p.asesora===u.nombre : true);
  const hoyStr=iso(hoy());
  const requierenAccionHoy = misProspectos.filter(p=>p.etapa!=="PP" && p.etapa!=="LF" && (!p.proxContacto || p.proxContacto<=hoyStr));

  // Forecasting: valor ponderado por probabilidad de cada etapa
  const forecast = misProspectos.filter(p=>p.etapa!=="PP"&&p.etapa!=="LF")
    .reduce((s,p)=>s+((p.valorPotencial||0)*probEtapa(p.etapa)/100),0);
  const valorGanado = misProspectos.filter(p=>p.etapa==="PP"||p.etapa==="VE").reduce((s,p)=>s+(p.valorPotencial||0),0);

  let h=head("📈 Pipeline comercial","CRM de ventas: arrastra las tarjetas entre etapas, con pronóstico y probabilidad de cierre.",
    `<button class="btn btn-primary" onclick="openProspecto()">+ Nuevo negocio</button>`);

  h+=`<div class="kpi-grid">
    ${kpiC("Negocios activos",misProspectos.filter(p=>p.etapa!=="PP"&&p.etapa!=="LF").length,"","blue")}
    ${kpiC("Pronóstico ponderado",fmt(forecast),"valor × probabilidad","orange")}
    ${kpiC("Ganado (VE + PP)",fmt(valorGanado),"","green")}
    ${kpiC("Requieren acción hoy",requierenAccionHoy.length,"","red")}
  </div>`;

  // Toggle de vistas
  h+=`<div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
    <button class="btn ${pipelineVista==='kanban'?'btn-primary':'btn-ghost'} btn-sm" onclick="pipelineVista='kanban';render()">▦ Vista Kanban</button>
    <button class="btn ${pipelineVista==='tabla'?'btn-primary':'btn-ghost'} btn-sm" onclick="pipelineVista='tabla';render()">☰ Vista Tabla</button>
    <button class="btn btn-ghost btn-sm" onclick="exportPipeline()" style="margin-left:auto">⭳ Exportar Excel</button>
  </div>`;

  if(pipelineVista==="kanban"){
    h+=renderKanban(misProspectos);
  } else {
    h+=renderPipelineTabla(misProspectos);
  }
  return h;
}

function renderKanban(prospectos){
  // columnas: mostramos las etapas principales (agrupamos INT y SEG visualmente pero mantenemos separadas)
  const cols = ETAPAS_PIPELINE;
  let h=`<div style="overflow-x:auto;padding-bottom:12px"><div style="display:flex;gap:12px;min-width:max-content">`;
  cols.forEach(col=>{
    const items=prospectos.filter(p=>p.etapa===col.k);
    const valorCol=items.reduce((s,p)=>s+(p.valorPotencial||0),0);
    h+=`<div class="kanban-col" data-etapa="${col.k}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="soltarProspecto(event,'${col.k}')">
      <div class="kanban-head" style="border-top:3px solid ${col.color}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;color:var(--navy);font-size:12.5px">${col.t}</span>
          <span class="chip" style="background:${col.color}22;color:${col.color};font-size:10.5px">${items.length}</span>
        </div>
        <div style="font-size:10.5px;color:var(--gray);margin-top:3px">${col.prob}% cierre · ${fmt(valorCol)}</div>
      </div>
      <div class="kanban-body">
        ${items.map(p=>kanbanCard(p,col)).join("")||'<div style="text-align:center;color:var(--gray-l);font-size:11.5px;padding:14px 0">Vacío</div>'}
      </div>
    </div>`;
  });
  h+=`</div></div>`;
  return h;
}
function kanbanCard(p,col){
  const vencido = p.proxContacto && p.proxContacto<iso(hoy()) && p.etapa!=="PP" && p.etapa!=="LF";
  return `<div class="kanban-card" draggable="true" ondragstart="arrastrarProspecto(event,'${p.id}')" onclick="openProspecto('${p.id}')">
    <div style="font-weight:700;color:var(--navy);font-size:13px;margin-bottom:3px">${p.nombre}</div>
    ${p.empresa?`<div style="font-size:11px;color:var(--gray)">🏢 ${p.empresa}</div>`:''}
    <div style="font-size:11px;color:var(--gray)">${p.servicio||"—"}</div>
    ${p.valorPotencial?`<div style="font-weight:700;color:var(--navy);font-size:12.5px;margin-top:4px">${fmt(p.valorPotencial)}</div>`:''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      ${p.proxContacto?`<span style="font-size:10.5px;color:${vencido?'var(--red)':'var(--gray)'}">${vencido?'⚠ ':''}${fechaBonita(p.proxContacto)}</span>`:'<span></span>'}
      ${p.celular?`<a class="btn btn-wa btn-sm" style="padding:3px 8px;font-size:11px" href="${waLinkProspecto(p)}" target="_blank" onclick="event.stopPropagation()">💬</a>`:''}
    </div>
  </div>`;
}
// Drag & drop
let _prospectoArrastrado=null;
function arrastrarProspecto(ev,id){ _prospectoArrastrado=id; ev.dataTransfer.effectAllowed="move"; }
function soltarProspecto(ev,nuevaEtapa){
  ev.preventDefault();
  document.querySelectorAll(".kanban-col").forEach(c=>c.classList.remove("drag-over"));
  if(!_prospectoArrastrado) return;
  const p=STATE.prospectos.find(x=>x.id===_prospectoArrastrado);
  if(p && p.etapa!==nuevaEtapa){
    const etapaAnterior=etapaInfo(p.etapa).t;
    p.etapa=nuevaEtapa;
    p.probabilidad=probEtapa(nuevaEtapa);
    if(!p.historial) p.historial=[];
    p.historial.push({fecha:new Date().toISOString(),tipo:"etapa",texto:`Movido de "${etapaAnterior}" a "${etapaInfo(nuevaEtapa).t}"`});
    save();
    toast(`${p.nombre} → ${etapaInfo(nuevaEtapa).t}`);
    render();
  }
  _prospectoArrastrado=null;
}
function renderPipelineTabla(prospectos){
  let h=`<div class="panel" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Negocio</th><th>Empresa</th><th>Servicio</th><th>Etapa</th><th>Prob.</th><th>Valor</th><th>Próx. contacto</th><th></th>
    </tr></thead><tbody>`;
  if(!prospectos.length){h+=`</tbody></table></div><div class="empty"><div class="ic">📈</div><h3>Sin negocios</h3><p>Agrega tu primer negocio con "+ Nuevo negocio".</p></div></div>`;return h;}
  prospectos.forEach(p=>{const e=etapaInfo(p.etapa);
    h+=`<tr style="cursor:pointer" onclick="openProspecto('${p.id}')">
      <td><b style="color:var(--navy)">${p.nombre}</b><br><span style="font-size:11px;color:var(--gray)">${p.celular||"sin cel"}</span></td>
      <td>${p.empresa||"—"}</td><td>${p.servicio||"—"}</td>
      <td><span class="chip" style="background:${e.color}22;color:${e.color}">${e.t}</span></td>
      <td>${e.prob}%</td><td>${fmt(p.valorPotencial||0)}</td>
      <td style="font-size:12px">${p.proxContacto?fechaBonita(p.proxContacto):"—"}</td>
      <td>${p.celular?`<a class="btn btn-wa btn-sm" href="${waLinkProspecto(p)}" target="_blank" onclick="event.stopPropagation()">💬</a>`:''}</td>
    </tr>`;});
  h+=`</tbody></table></div></div>`;
  return h;
}
function openProspecto(id){
  const p=id?STATE.prospectos.find(x=>x.id===id):null;
  const u=currentUser();
  showModal(p?"Negocio — "+p.nombre:"Nuevo negocio",`
    <div class="form-grid">
      <div class="field"><label>Nombre del contacto</label><input class="inp" id="pr_nombre" value="${p?p.nombre:''}"></div>
      <div class="field"><label>Empresa / organización</label><input class="inp" id="pr_empresa" value="${p?p.empresa||'':''}"></div>
      <div class="field"><label>Celular</label><input class="inp" id="pr_cel" value="${p?p.celular||'':''}"></div>
      <div class="field"><label>Correo</label><input class="inp" id="pr_correo" value="${p?p.correo||'':''}"></div>
      <div class="field"><label>Ciudad</label><select class="inp" id="pr_ciudad">${optSel(["Ibague","Girardot","Rovira","Neiva"],p?p.ciudad:"Ibague")}</select></div>
      <div class="field"><label>Servicio de interés</label><select class="inp" id="pr_serv">${optSel(["Seguridad Social","Admisión","Caja de Compensación","Crédito","Subsidio Vivienda","Pensión"],p?p.servicio:"Seguridad Social")}</select></div>
      <div class="field"><label>Origen</label><select class="inp" id="pr_origen">${optSel(["Meta Ads","Orgánico","Referido","WhatsApp Directo"],p?p.origen:"Meta Ads")}</select></div>
      <div class="field"><label>Etapa del pipeline</label><select class="inp" id="pr_etapa">${ETAPAS_PIPELINE.map(e=>`<option value="${e.k}" ${p&&p.etapa===e.k?'selected':''}>${e.t} (${e.prob}%)</option>`).join("")}</select></div>
      <div class="field"><label>Próximo contacto</label><input type="date" class="inp" id="pr_prox" value="${p?p.proxContacto||'':iso(hoy())}"></div>
      <div class="field"><label>Valor del negocio</label><input type="number" class="inp" id="pr_valor" value="${p?p.valorPotencial||0:0}"></div>
      <div class="field full"><label>Observaciones</label><textarea class="inp" id="pr_obs" rows="2">${p?p.obs||'':''}</textarea></div>
    </div>
    ${p?`
    <div style="margin-top:16px">
      <div style="font-weight:700;color:var(--navy);font-size:13.5px;margin-bottom:8px">➕ Registrar interacción</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="registrarInteraccion('${p.id}','Llamada')">📞 Llamada</button>
        <button class="btn btn-ghost btn-sm" onclick="registrarInteraccion('${p.id}','WhatsApp')">💬 WhatsApp</button>
        <button class="btn btn-ghost btn-sm" onclick="registrarInteraccion('${p.id}','Correo')">✉️ Correo</button>
        <button class="btn btn-ghost btn-sm" onclick="registrarInteraccion('${p.id}','Reunión')">🤝 Reunión</button>
      </div>
      <div style="font-weight:700;color:var(--navy);font-size:13.5px;margin:14px 0 8px">🕒 Historial</div>
      <div style="max-height:180px;overflow-y:auto">
        ${(p.historial&&p.historial.length)?p.historial.slice().reverse().map(hh=>`
          <div style="display:flex;gap:9px;padding:7px 0;border-bottom:1px solid #f2eee2">
            <span style="font-size:15px">${hh.tipo==='etapa'?'🔀':(hh.tipo==='Llamada'?'📞':hh.tipo==='WhatsApp'?'💬':hh.tipo==='Correo'?'✉️':'🤝')}</span>
            <div style="flex:1"><div style="font-size:12.5px;color:var(--navy)">${hh.texto}</div>
            <div style="font-size:10.5px;color:var(--gray-l)">${new Date(hh.fecha).toLocaleString("es-CO")}</div></div>
          </div>`).join(""):'<div style="color:var(--gray);font-size:12.5px">Sin interacciones registradas aún.</div>'}
      </div>
    </div>`:''}
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:space-between">
      ${p?`<button class="btn btn-sm" style="background:var(--red-bg);color:var(--red)" onclick="eliminarProspecto('${p.id}')">Eliminar</button>`:'<span></span>'}
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveProspecto(${p?`'${p.id}'`:'null'})">Guardar</button>
      </div>
    </div>`);
}
function registrarInteraccion(id,tipo){
  const p=STATE.prospectos.find(x=>x.id===id); if(!p)return;
  if(!p.historial) p.historial=[];
  p.historial.push({fecha:new Date().toISOString(),tipo,texto:`${tipo} registrada con el contacto`});
  save(); toast(tipo+" registrada"); openProspecto(id);
}
function saveProspecto(id){
  const u=currentUser();
  const data={nombre:val("pr_nombre"),empresa:val("pr_empresa"),celular:val("pr_cel").replace(/\D/g,"").slice(0,10),
    correo:val("pr_correo"),ciudad:val("pr_ciudad"),
    servicio:val("pr_serv"),origen:val("pr_origen"),etapa:val("pr_etapa"),proxContacto:val("pr_prox"),
    probabilidad:probEtapa(val("pr_etapa")),
    valorPotencial:+val("pr_valor")||0,obs:val("pr_obs")};
  if(!data.nombre.trim()){toast("El nombre es obligatorio");return;}
  if(id){
    const p=STATE.prospectos.find(x=>x.id===id); Object.assign(p,data);
  }else{
    STATE.prospectos.push({id:uid(),...data,asesora:u.nombre,fecha:new Date().toISOString()});
  }
  save();closeModal();toast("Prospecto guardado");render();
}
function eliminarProspecto(id){
  STATE.prospectos=STATE.prospectos.filter(p=>p.id!==id);
  save();closeModal();toast("Prospecto eliminado");render();
}
async function exportPipeline(){
  if(typeof ExcelJS==="undefined"){toast("No se pudo cargar el generador de Excel");return;}
  const u=currentUser();
  const datos = u.rol==="comercial" ? STATE.prospectos.filter(p=>p.asesora===u.nombre) : STATE.prospectos;
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet("Pipeline Comercial");
  try{const imgId=wb.addImage({base64:LOGO_SRC,extension:"jpeg"});ws.addImage(imgId,{tl:{col:0,row:0},ext:{width:50,height:50}});}catch(e){}
  ws.mergeCells("B1:H1"); ws.getCell("B1").value="PIPELINE COMERCIAL — GEM"; ws.getCell("B1").font={bold:true,size:14,color:{argb:"FF0D1B2A"}};
  const headers=["Nombre","Celular","Ciudad","Servicio","Etapa","Próximo contacto","Valor potencial","Asesora","Observaciones"];
  const hr=ws.getRow(3); headers.forEach((h,i)=>{const c=hr.getCell(i+1);c.value=h;c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0D1B2A"}};});
  datos.forEach(p=>{const e=etapaInfo(p.etapa);
    const row=ws.addRow([p.nombre,p.celular,p.ciudad,p.servicio,e.t,p.proxContacto,p.valorPotencial,p.asesora,p.obs]);
    row.getCell(5).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF"+e.color.replace("#","")}};
    row.getCell(5).font={color:{argb:"FFFFFFFF"},bold:true};
  });
  ws.columns=[{width:24},{width:13},{width:12},{width:20},{width:22},{width:15},{width:14},{width:18},{width:30}];
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:"application/octet-stream"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="Pipeline_Comercial_GEM.xlsx";a.click();
  toast("Pipeline exportado");
}

// ─────────── RECIBOS ───────────
const EMPRESA_RECIBO = {
  Coomsertar:{nombre:"COOMSERTAR", razon:"COOPERATIVA MULTIACTIVA DE SERVICIOS INTEGRALES TÉCNICOS Y PROFESIONALES", nit:"809.012.409-5", prefijo:"RC8"},
  Coopfisol:{nombre:"COOPFISOL", razon:"COOPERATIVA MULTIACTIVA FINANZAS SOLIDARIAS", nit:"901.976.791-4", prefijo:"RC1"},
};
function numeroALetras(n){
  n=Math.round(n);
  if(n===0)return "CERO PESOS MCTE.";
  const UNI=["","UNO","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE"];
  const DEC=["","","VEINTI","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"];
  const CEN=["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];
  function tresDig(x){
    if(x===0)return "";
    if(x===100)return "CIEN";
    let s="";
    const c=Math.floor(x/100), r=x%100;
    if(c)s+=CEN[c]+" ";
    if(r<=20)s+=UNI[r];
    else{const d=Math.floor(r/10),u=r%10;
      if(d===2 && u>0) s+="VEINTI"+UNI[u];
      else{s+=DEC[d]; if(u>0)s+=" Y "+UNI[u];}}
    return s.trim();
  }
  function grupo(x,sing,plur){
    if(x===0)return "";
    if(x===1)return sing;
    return tresDig(x)+" "+plur;
  }
  let millones=Math.floor(n/1000000);
  let miles=Math.floor((n%1000000)/1000);
  let cientos=n%1000;
  let partes=[];
  if(millones)partes.push(grupo(millones,"UN MILLÓN","MILLONES"));
  if(miles)partes.push(grupo(miles,"MIL","MIL"));
  if(cientos)partes.push(tresDig(cientos));
  return (partes.join(" ")||"CERO")+" PESOS MCTE.";
}
let reciboActual=null;
function renderRecibos(){
  if(!reciboActual) reciboActual={empresa:"Coomsertar",concepto:"Aportes Asociado",nombre:"",documento:"",zona:"Ibague",
    fecha:iso(hoy()),metodo:"Efectivo",items:[{desc:"",valor:0}]};
  const r=reciboActual;
  let h=head("🧾 Recibos","Genera el recibo de caja con los datos de la empresa. Busca por cédula para autocompletar si el cliente ya existe.");
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-cols">
    <div class="panel">
      <div class="panel-title">Datos del recibo</div>
      <div class="form-grid">
        <div class="field"><label>Empresa</label><select class="inp" onchange="reciboActual.empresa=this.value;render()">${optSel(["Coomsertar","Coopfisol"],r.empresa)}</select></div>
        <div class="field"><label>Fecha</label><input type="date" class="inp" value="${r.fecha}" onchange="reciboActual.fecha=this.value;render()"></div>
        <div class="field full"><label>Buscar por cédula (autocompleta si existe)</label>
          <input class="inp" placeholder="Escribe la cédula…" oninput="buscarPorCedula(this.value)"></div>
        <div class="field"><label>Nombre</label><input class="inp" value="${r.nombre}" onchange="reciboActual.nombre=this.value;render()"></div>
        <div class="field"><label>Documento</label><input class="inp" value="${r.documento}" onchange="reciboActual.documento=this.value;render()"></div>
        <div class="field"><label>Zona / Ciudad</label><select class="inp" onchange="reciboActual.zona=this.value;render()">${optSel(["Ibague","Girardot","Rovira","Neiva"],r.zona)}</select></div>
        <div class="field"><label>Concepto</label><select class="inp" onchange="reciboActual.concepto=this.value;render()">${optSel(["Aportes Asociado","Cuota de Crédito","Admisión","Subsidio de Vivienda","Otro"],r.concepto)}</select></div>
        <div class="field"><label>Forma de pago</label><select class="inp" onchange="reciboActual.metodo=this.value;render()">${optSel(["Efectivo","Bancolombia"],r.metodo)}</select></div>
      </div>
      <div style="margin-top:14px">
        <label style="font-size:11.5px;font-weight:600;color:var(--gray)">Detalle (concepto y valor)</label>
        ${r.items.map((it,i)=>`<div style="display:flex;gap:6px;margin-top:6px">
          <input class="inp" style="flex:2" placeholder="Descripción" value="${it.desc}" onchange="reciboActual.items[${i}].desc=this.value">
          <input type="number" class="inp" style="flex:1" placeholder="Valor" value="${it.valor}" onchange="reciboActual.items[${i}].valor=+this.value;render()">
          <button class="btn btn-ghost btn-sm" onclick="reciboActual.items.splice(${i},1);render()">✕</button>
        </div>`).join("")}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="reciboActual.items.push({desc:'',valor:0});render()">+ Agregar línea</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="confirmarRecibo()">✅ Generar recibo N°</button>
        <button class="btn btn-ghost" onclick="reciboActual=null;render()">Limpiar</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">Vista previa</div>
      <div id="reciboPreview">${reciboHTML(r)}</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="copiarRecibo()">📋 Copiar</button>
        <button class="btn btn-ghost btn-sm" onclick="descargarRecibo()">⭳ Descargar imagen</button>
        <button class="btn btn-ghost btn-sm" onclick="imprimirRecibo()">🖨️ Imprimir</button>
      </div>
    </div>
  </div>
  ${STATE.recibos.length?`<div class="panel"><div class="panel-title">Historial de recibos generados</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Fecha</th><th>Empresa</th><th>Nombre</th><th>Valor</th></tr></thead><tbody>
    ${STATE.recibos.slice().reverse().slice(0,20).map(rc=>`<tr><td>${rc.numero}</td><td>${fechaBonita(rc.fecha)}</td><td>${rc.empresa}</td><td>${rc.nombre}</td><td>${fmt(rc.total)}</td></tr>`).join("")}
    </tbody></table></div></div>`:''}`;
  return h;
}
function buscarPorCedula(doc){
  if(doc.length<4)return;
  const c=STATE.creditos.find(x=>x.clienteDoc===doc);
  if(c){reciboActual.nombre=c.nombre;reciboActual.documento=c.clienteDoc;reciboActual.zona=c.sede;
    reciboActual.empresa=c.entidad; toast("Cliente encontrado: "+c.nombre); render();}
}
function reciboHTML(r){
  const emp=EMPRESA_RECIBO[r.empresa];
  const total=r.items.reduce((s,i)=>s+(+i.valor||0),0);
  const num = r._numeroGenerado || (emp.prefijo+"-XXXX");
  return `<div id="reciboImg" style="width:540px;background:#fff;font-family:'Segoe UI',Arial,sans-serif;color:#16202E;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(10,37,64,.15);border:1px solid #E3E8EE">
    <!-- Membrete -->
    <div style="background:linear-gradient(135deg,#0A2540,#0F3557);color:#fff;padding:16px 20px;display:flex;align-items:center;gap:14px">
      <img src="${LOGO_SRC}" style="width:56px;height:auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.3))">
      <div style="flex:1">
        <div style="font-weight:800;font-size:17px;letter-spacing:.3px">${emp.nombre}</div>
        <div style="font-size:9px;color:#9fc0dc;line-height:1.3">${emp.razon}</div>
        <div style="font-size:9.5px;color:#c9a24a;font-weight:600;margin-top:2px">NIT: ${emp.nit}</div>
      </div>
      <div style="text-align:right;background:rgba(255,255,255,.1);border-radius:9px;padding:8px 12px">
        <div style="font-size:9px;color:#9fc0dc;text-transform:uppercase;letter-spacing:.5px">Recibo de caja</div>
        <div style="font-size:16px;font-weight:800;color:#F4B860">${num}</div>
        <div style="font-size:9.5px;color:#c5d4e2;margin-top:2px">${fechaBonita(r.fecha)}</div>
      </div>
    </div>
    <!-- Cuerpo -->
    <div style="padding:18px 20px">
      <div style="display:flex;gap:20px;margin-bottom:14px">
        <div style="flex:1"><div style="font-size:9px;color:#8A97A5;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Recibido de</div><div style="font-size:13.5px;font-weight:700;color:#0A2540">${r.nombre||"—"}</div></div>
        <div><div style="font-size:9px;color:#8A97A5;text-transform:uppercase;font-weight:700;letter-spacing:.5px">C.C. / NIT</div><div style="font-size:13px;color:#16202E">${r.documento||"—"}</div></div>
        <div><div style="font-size:9px;color:#8A97A5;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Zona</div><div style="font-size:13px;color:#16202E">${r.zona}</div></div>
      </div>
      <div style="background:#FBF8F1;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px"><b style="color:#0A2540">Concepto:</b> ${r.concepto}</div>
      <!-- Tabla de detalle -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px">
        <thead><tr style="background:#0A2540;color:#fff">
          <th style="padding:8px 10px;text-align:left;font-size:10.5px;border-radius:6px 0 0 0">DETALLE</th>
          <th style="padding:8px 10px;text-align:right;font-size:10.5px;border-radius:0 6px 0 0">VALOR</th>
        </tr></thead>
        <tbody>
        ${r.items.map((i,idx)=>`<tr style="background:${idx%2?'#FBF8F1':'#fff'}"><td style="padding:7px 10px;border-bottom:1px solid #E3E8EE">${i.desc||"—"}</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid #E3E8EE">${fmt(i.valor)}</td></tr>`).join("")}
        </tbody>
      </table>
      <!-- Total destacado -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <div style="background:linear-gradient(135deg,#C6820E,#F4B860);color:#3a2609;border-radius:9px;padding:10px 20px;text-align:right">
          <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Total</div>
          <div style="font-size:20px;font-weight:800">${fmt(total)}</div>
        </div>
      </div>
      <div style="background:#F4EFE4;border-left:3px solid #C6820E;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10.5px"><b>Son:</b> ${numeroALetras(total)}</div>
      <div style="font-size:11px;margin-bottom:18px"><b style="color:#0A2540">Forma de pago:</b> ${r.metodo}</div>
      <!-- Firmas -->
      <div style="display:flex;justify-content:space-between;gap:14px;margin-top:22px;font-size:9.5px;text-align:center;color:#5A6B7B">
        <div style="border-top:1.5px solid #0A2540;flex:1;padding-top:4px;font-weight:600">Elaboró</div>
        <div style="border-top:1.5px solid #0A2540;flex:1;padding-top:4px;font-weight:600">Revisó</div>
        <div style="border-top:1.5px solid #0A2540;flex:1;padding-top:4px;font-weight:600">Aprobó</div>
      </div>
    </div>
    <!-- Pie -->
    <div style="background:#0A2540;color:#9fc0dc;text-align:center;padding:8px;font-size:9px">Grupo Empresarial Marcal · ${emp.nombre} · Documento generado electrónicamente</div>
  </div>`;
}
function confirmarRecibo(){
  const r=reciboActual;
  if(!r.nombre.trim()){toast("Falta el nombre del recibido");return;}
  const emp=EMPRESA_RECIBO[r.empresa];
  if(!STATE.contadorRecibos[r.empresa])STATE.contadorRecibos[r.empresa]=1860;
  STATE.contadorRecibos[r.empresa]++;
  const numero=`${emp.prefijo}-${STATE.contadorRecibos[r.empresa]}`;
  const total=r.items.reduce((s,i)=>s+(+i.valor||0),0);
  STATE.recibos.push({id:uid(),numero,fecha:r.fecha,empresa:r.empresa,nombre:r.nombre,documento:r.documento,total,items:[...r.items]});
  save();
  reciboActual._numeroGenerado=numero;
  document.getElementById("reciboPreview").innerHTML=reciboHTML(r).replace("XXXX",STATE.contadorRecibos[r.empresa]);
  toast("Recibo "+numero+" generado");
  render();
}
function copiarRecibo(){
  const r=reciboActual; const emp=EMPRESA_RECIBO[r.empresa]; const total=r.items.reduce((s,i)=>s+(+i.valor||0),0);
  const texto=`${emp.nombre}\nRecibo de caja\nFecha: ${fechaBonita(r.fecha)}\nConcepto: ${r.concepto}\nRecibido de: ${r.nombre} - CC ${r.documento}\nTotal: ${fmt(total)}\nSon: ${numeroALetras(total)}`;
  navigator.clipboard.writeText(texto).then(()=>toast("Recibo copiado al portapapeles"));
}
function descargarRecibo(){
  if(typeof html2canvas==="undefined"){toast("No se pudo cargar el generador de imágenes");return;}
  html2canvas(document.getElementById("reciboImg"),{scale:2}).then(canvas=>{
    const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="Recibo_GEM.png";a.click();
  });
}
function imprimirRecibo(){
  const contenido=document.getElementById("reciboImg").outerHTML;
  const w=window.open("","_blank");
  w.document.write(`<html><head><title>Recibo</title><style>
    @page{size:5.5in 8.5in;margin:10px} body{font-family:Arial,sans-serif}
  </style></head><body>${contenido}</body></html>`);
  w.document.close(); setTimeout(()=>w.print(),300);
}

// ═══════════ SUPERVISIÓN GENERAL (superadmin + superusuario) ═══════════
function renderSupervision(){
  const cs=STATE.creditos;
  const totalCartera=cs.reduce((s,c)=>s+c.saldoTotal,0);
  const totalPagos=STATE.pagos.reduce((s,p)=>s+p.valor,0);
  const gestionesHoy=STATE.gestiones.filter(g=>g.fecha && g.fecha.slice(0,10)===iso(hoy())).length;
  const prospectos=STATE.prospectos.length;
  let h=head("👁️ Supervisión general","Seguimiento consolidado de la operación de todas las áreas.");
  h+=`<div class="kpi-grid">
    ${kpiC("Cartera total (ambas)",fmt(totalCartera),cs.length+" créditos","blue")}
    ${kpiC("Recaudado histórico",fmt(totalPagos),STATE.pagos.length+" pagos","green")}
    ${kpiC("Gestiones hoy",gestionesHoy,"","orange")}
    ${kpiC("Prospectos comerciales",prospectos,"","")}
  </div>`;
  // Actividad por usuario (quién ha hecho qué)
  const actividad={};
  STATE.gestiones.forEach(g=>{const r=g.responsable||"—";actividad[r]=actividad[r]||{gestiones:0,pagos:0};actividad[r].gestiones++;});
  STATE.pagos.forEach(p=>{const r=p.responsable||"—";actividad[r]=actividad[r]||{gestiones:0,pagos:0};actividad[r].pagos++;});
  h+=`<div class="panel"><div class="panel-title">Actividad registrada por usuario</div>`;
  if(Object.keys(actividad).length){
    h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Gestiones</th><th>Pagos registrados</th></tr></thead><tbody>
    ${Object.entries(actividad).map(([u,d])=>`<tr><td><b>${u}</b></td><td>${d.gestiones}</td><td>${d.pagos}</td></tr>`).join("")}
    </tbody></table></div>`;
  } else {
    h+=`<div class="empty"><div class="ic">📋</div><h3>Sin actividad registrada aún</h3><p>Cuando el equipo registre gestiones y pagos, el seguimiento aparecerá aquí.</p></div>`;
  }
  h+=`</div>`;
  // Resumen por empresa
  const porEnt={};cs.forEach(c=>{porEnt[c.entidad]=porEnt[c.entidad]||{n:0,s:0};porEnt[c.entidad].n++;porEnt[c.entidad].s+=c.saldoTotal;});
  h+=`<div class="panel"><div class="panel-title">Resumen por empresa</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
    ${Object.entries(porEnt).map(([e,d])=>`<div style="flex:1;min-width:200px;background:var(--cream);border:1px solid var(--line);border-radius:12px;padding:16px">
      <div style="font-weight:800;color:var(--navy);font-size:16px">${e}</div>
      <div style="font-size:13px;color:var(--gray);margin-top:4px">${d.n} créditos</div>
      <div style="font-size:22px;font-weight:800;color:var(--navy);margin-top:6px">${fmt(d.s)}</div></div>`).join("")}
    </div></div>`;
  return h;
}

// ═══════════ GESTIÓN DE USUARIOS (solo superusuario) ═══════════
function renderUsuariosAdmin(){
  const clientesConAcceso=STATE.creditos.filter(c=>c.tieneAcceso).length;
  let h=head("🔑 Gestión de usuarios","Perfiles del equipo y usuarios cliente creados automáticamente.");
  h+=`<div class="panel"><div class="panel-title">Perfiles del equipo interno</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Perfil</th><th>Contraseña</th><th>Permisos</th></tr></thead><tbody>
    ${USERS.map(u=>`<tr>
      <td><b style="color:var(--navy)">${u.usuario}</b></td>
      <td><span class="chip" style="background:${u.color}22;color:${u.color}">${u.rolLabel}</span></td>
      <td style="font-family:monospace;color:var(--gray)">${u.pass}</td>
      <td style="font-size:12.5px;color:var(--gray)">${permisosTexto(u.rol)}</td>
    </tr>`).join("")}
    </tbody></table></div>
    <div style="font-size:12px;color:var(--gray);margin-top:10px">En producción, las contraseñas se ocultan y cada persona puede cambiarla. Aquí se muestran para la fase de configuración.</div>
  </div>`;
  h+=`<div class="panel"><div class="panel-title">Usuarios cliente (creados automáticamente)</div>
    <div style="font-size:13px;color:var(--gray);margin-bottom:12px">Cada vez que se vincula un crédito o afiliación, el sistema crea el acceso del cliente: <b>usuario = su cédula</b>, <b>contraseña = su cédula</b>. El cliente puede consultar su plan y pagos.</div>
    <div class="kpi-grid">
      ${kpiC("Clientes con acceso",clientesConAcceso,"de "+STATE.creditos.length+" créditos","green")}
      ${kpiC("Acceso pendiente",STATE.creditos.length-clientesConAcceso,"","orange")}
    </div>
    <button class="btn btn-primary" onclick="generarAccesosClientes()">🔓 Generar accesos para todos los clientes</button>
  </div>
  <div class="panel" style="border-left:4px solid var(--red)">
    <div class="panel-title" style="color:var(--red)">⚠️ Reiniciar sistema en cero</div>
    <div style="font-size:13.5px;color:var(--gray);margin-bottom:12px">Borra todos los datos de operación (créditos, pagos, prospectos, etc.) para arrancar limpio con la cartera real. Conserva usuarios y plantillas. Úsalo una sola vez antes de la primera carga real.</div>
    <button class="btn btn-sm" style="background:var(--red-bg);color:var(--red)" onclick="confirmarReset()">🗑️ Reiniciar todo en cero</button>
  </div>`;
  return h;
}
function permisosTexto(rol){
  const p={
    superadmin:"Ve informes financieros, reportes y seguimiento. No edita configuración de usuarios.",
    superusuario:"Control total: edita todo, supervisa a todos, gestiona usuarios y plantillas.",
    cartera:"Cartera, cobros, pagos, clientes, importar, recibos e informes.",
    comercial:"Solo módulos comerciales: panel, prospectos, pipeline e informes comerciales."
  };
  return p[rol]||"";
}
function generarAccesosClientes(){
  let n=0;
  STATE.creditos.forEach(c=>{
    if(!c.tieneAcceso && c.clienteDoc){
      c.tieneAcceso=true;
      c.usuarioCliente=String(c.clienteDoc).replace(/\D/g,"");
      c.passCliente=String(c.clienteDoc).replace(/\D/g,"");
      n++;
    }
  });
  save();
  toast(`${n} accesos de cliente generados (usuario y contraseña = cédula)`);
  render();
}

// ═══════════ PLANTILLAS AUTOMÁTICAS (solo superusuario) ═══════════
function renderPlantillasAuto(){
  let h=head("🗂️ Plantillas automáticas","Sube el formato del sistema y genera las plantillas diligenciadas para otras entidades.");
  h+=`<div class="panel">
    <div class="panel-title">Generador de plantillas desde el formato del sistema</div>
    <div style="font-size:13.5px;color:var(--gray);margin-bottom:14px">Sube el archivo <b>"reporte software"</b> que entrega el sistema. La página tomará esos datos y generará automáticamente los listados diligenciados (empresas activos, retirados, independientes, comisiones, etc.), respetando el formato exacto. Los campos que el formato no traiga quedan en blanco.</div>
    <div style="border:2px dashed var(--line);border-radius:12px;padding:26px;text-align:center;background:var(--cream)">
      <div style="font-size:32px;margin-bottom:8px">📄</div>
      <div style="font-weight:700;color:var(--navy);margin-bottom:12px">Sube el formato "reporte software" (.xlsx)</div>
      <input type="file" id="fmtInput" accept=".xlsx,.xls" style="display:none" onchange="procesarFormatoBase(this.files[0])">
      <button class="btn btn-primary" onclick="document.getElementById('fmtInput').click()">Seleccionar formato</button>
    </div>
    <div id="plantillasResult"></div>
  </div>`;
  return h;
}
function procesarFormatoBase(file){
  const res=document.getElementById("plantillasResult");
  if(!file){return;}
  if(typeof XLSX==="undefined"){res.innerHTML='<div style="color:var(--red);padding:14px">No se pudo cargar el lector de Excel.</div>';return;}
  res.innerHTML='<div style="padding:16px;color:var(--gray)">⏳ Procesando '+file.name+'…</div>';
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const filas=XLSX.utils.sheet_to_json(ws,{header:1,defval:""}).filter(r=>r.some(c=>String(c).trim()));
      window._formatoBase={nombre:file.name, filas, headers:filas[0]||[]};
      res.innerHTML=`<div style="margin-top:16px;padding:16px;background:var(--cream);border-radius:12px">
        <div style="font-weight:700;color:var(--navy);margin-bottom:8px">✅ Formato cargado: ${file.name}</div>
        <div style="font-size:13px;color:var(--gray);margin-bottom:12px">${filas.length-1} registros detectados · ${(filas[0]||[]).length} columnas</div>
        <div style="font-weight:600;color:var(--navy);margin-bottom:8px;font-size:13.5px">Genera las plantillas diligenciadas:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="generarPlantilla('Activos empresas')">⭳ Listado activos empresas</button>
          <button class="btn btn-ghost btn-sm" onclick="generarPlantilla('Retirados')">⭳ Listado retirados</button>
          <button class="btn btn-ghost btn-sm" onclick="generarPlantilla('Independientes')">⭳ Independientes Asoprogresa</button>
          <button class="btn btn-ghost btn-sm" onclick="generarPlantilla('Comisiones')">⭳ Comisiones</button>
          <button class="btn btn-primary btn-sm" onclick="generarTodasPlantillas()">📦 Generar todas</button>
        </div>
      </div>`;
    }catch(err){res.innerHTML='<div style="color:var(--red);padding:14px">Error al leer: '+err.message+'</div>';}
  };
  reader.readAsArrayBuffer(file);
}
async function generarPlantilla(tipo){
  if(!window._formatoBase){toast("Primero sube el formato base");return;}
  if(typeof ExcelJS==="undefined"){toast("No se pudo cargar el generador de Excel");return;}
  const f=window._formatoBase;
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet(tipo.slice(0,28));
  try{const imgId=wb.addImage({base64:LOGO_SRC,extension:"png"});ws.addImage(imgId,{tl:{col:0,row:0},ext:{width:60,height:45}});}catch(e){}
  ws.mergeCells("B1:F1"); ws.getCell("B1").value="GEM — "+tipo; ws.getCell("B1").font={bold:true,size:14,color:{argb:"FF0A2540"}};
  // encabezados del formato base
  const hr=ws.getRow(3);
  (f.headers||[]).forEach((hd,i)=>{const c=hr.getCell(i+1);c.value=String(hd);c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0A2540"}};});
  // filas de datos
  f.filas.slice(1).forEach(fila=>{ws.addRow(fila);});
  ws.columns.forEach(col=>{col.width=18;});
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:"application/octet-stream"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Plantilla_${tipo.replace(/ /g,"_")}_GEM.xlsx`;a.click();
  toast("Plantilla generada: "+tipo);
}
async function generarTodasPlantillas(){
  for(const t of ["Activos empresas","Retirados","Independientes","Comisiones"]){
    await generarPlantilla(t);
    await new Promise(r=>setTimeout(r,400));
  }
  toast("Todas las plantillas generadas");
}

// ═══════════ CERTIFICADOS DE PLANILLA ═══════════
function renderCertificados(){
  let h=head("📜 Certificados de planilla","Genera certificados de estado de pagos para los clientes al día.");
  h+=`<div class="panel">
    <div class="panel-title">Buscar cliente</div>
    <div class="toolbar">
      <input class="inp" style="flex:1;min-width:220px" id="certBuscar" placeholder="Escribe nombre o cédula…" oninput="buscarParaCert(this.value)">
    </div>
    <div id="certResultado"></div>
  </div>`;
  return h;
}
function buscarParaCert(q){
  const cont=document.getElementById("certResultado");
  if(!q||q.length<3){cont.innerHTML="";return;}
  const ql=q.toLowerCase();
  const res=visibleCreditos().filter(c=>c.nombre.toLowerCase().includes(ql)||(c.clienteDoc||"").includes(q)).slice(0,6);
  if(!res.length){cont.innerHTML='<div style="padding:14px;color:var(--gray)">Sin resultados.</div>';return;}
  cont.innerHTML=res.map(c=>{
    const alDia=c.saldoVencido<=0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #f2eee2">
      <div><b style="color:var(--navy)">${c.nombre}</b><div style="font-size:12px;color:var(--gray)">CC ${c.clienteDoc} · ${estChip(c.estado,c)} ${alDia?'<span class="chip" style="background:var(--green-bg);color:var(--green)">Al día</span>':'<span class="chip" style="background:var(--red-bg);color:var(--red)">Con mora</span>'}</div></div>
      <button class="btn btn-primary btn-sm" onclick="generarCertificado('${c.id}')">📜 Generar certificado</button>
    </div>`;
  }).join("");
}
function generarCertificado(cid){
  const c=STATE.creditos.find(x=>x.id===cid); if(!c)return;
  const emp = c.entidad==="Coopfisol"?"Cooperativa Multiactiva Finanzas Solidarias COOPFISOL":"Cooperativa Multiactiva Coomsertar";
  const nit = c.entidad==="Coopfisol"?"901.976.791-4":"809.012.409-5";
  const alDia=c.saldoVencido<=0;
  const num="CERT-"+String(c.clienteDoc).slice(-4)+"-"+iso(hoy()).replace(/-/g,"");
  const hoyTxt=hoy().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"});
  const html=`<div id="certImg" style="width:600px;background:#fff;font-family:'Segoe UI',Arial,sans-serif;color:#16202E;border:1px solid #E3E8EE;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0A2540,#0F3557);color:#fff;padding:20px 26px;display:flex;align-items:center;gap:14px">
      <img src="${LOGO_SRC}" style="width:58px;height:auto">
      <div><div style="font-weight:800;font-size:18px">GRUPO EMPRESARIAL MARCAL</div>
      <div style="font-size:10px;color:#9fc0dc">${emp} · NIT ${nit}</div></div>
    </div>
    <div style="padding:28px 30px">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:11px;color:#8A97A5;letter-spacing:1px">CERTIFICADO N° ${num}</div>
        <h2 style="font-size:22px;color:#0A2540;margin-top:6px">CERTIFICADO DE ESTADO DE PLANILLA</h2>
      </div>
      <p style="font-size:14px;line-height:1.7;margin-bottom:16px">La ${emp}, identificada con NIT ${nit}, <b>hace constar</b> que el/la señor(a):</p>
      <div style="background:#FBF8F1;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px">
        <div style="font-size:19px;font-weight:800;color:#0A2540">${c.nombre}</div>
        <div style="font-size:13px;color:#5A6B7B">C.C. ${c.clienteDoc}</div>
      </div>
      <p style="font-size:14px;line-height:1.7;margin-bottom:16px">se encuentra <b style="color:${alDia?'#1E8E5A':'#C0392B'}">${alDia?'AL DÍA':'CON SALDO PENDIENTE'}</b> en sus obligaciones${alDia?'':' de pago'} con nuestra entidad a la fecha de expedición del presente certificado.</p>
      ${alDia?'':`<div style="background:#FBEAE7;border-left:4px solid #C0392B;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px">Saldo pendiente en mora: <b>$${Math.round(c.saldoVencido).toLocaleString("es-CO")}</b></div>`}
      <p style="font-size:13px;color:#5A6B7B;margin-bottom:26px">Expedido en Ibagué, Tolima, el ${hoyTxt}.</p>
      <div style="border-top:1.5px solid #0A2540;width:220px;margin-top:34px;padding-top:5px;font-size:12px;text-align:center">Firma autorizada<br><span style="color:#8A97A5;font-size:11px">${emp}</span></div>
    </div>
    <div style="background:#0A2540;color:#9fc0dc;text-align:center;padding:8px;font-size:9px">Documento generado electrónicamente · Verificable ante la entidad</div>
  </div>`;
  showModal("Certificado — "+c.nombre, html+`
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="descargarCertificado()">⭳ Descargar imagen</button>
      <button class="btn btn-primary" onclick="imprimirCert()">🖨️ Imprimir</button>
    </div>`);
}
function descargarCertificado(){
  if(typeof html2canvas==="undefined"){toast("No se pudo cargar el generador");return;}
  html2canvas(document.getElementById("certImg"),{scale:2}).then(canvas=>{
    const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="Certificado_GEM.png";a.click();
  });
}
function imprimirCert(){
  const c=document.getElementById("certImg").outerHTML;
  const w=window.open("","_blank");
  w.document.write(`<html><head><title>Certificado</title></head><body>${c}</body></html>`);
  w.document.close(); setTimeout(()=>w.print(),300);
}

// ═══════════ BLOG / CONTENIDOS (superusuario) ═══════════
function renderBlogAdmin(){
  if(!STATE.blog) STATE.blog=[
    {id:uid(),titulo:"5 beneficios de estar afiliado a seguridad social",cat:"Educativo",fecha:iso(hoy()),estado:"Publicado",resumen:"Descubre por qué estar en regla te protege a ti y a tu familia."},
    {id:uid(),titulo:"¿Cómo aplicar al subsidio de vivienda?",cat:"Guía",fecha:iso(hoy()),estado:"Borrador",resumen:"Paso a paso para acceder al subsidio de hasta $52 millones."},
  ];
  let h=head("📰 Blog / contenidos","Gestiona los artículos educativos del sitio público.",
    `<button class="btn btn-primary" onclick="nuevoPost()">+ Nuevo artículo</button>`);
  h+=`<div class="panel" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Título</th><th>Categoría</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>
    ${STATE.blog.map(p=>`<tr>
      <td><b style="color:var(--navy)">${p.titulo}</b><br><span style="font-size:11.5px;color:var(--gray)">${p.resumen||''}</span></td>
      <td><span class="chip" style="background:var(--blue-bg);color:var(--blue)">${p.cat}</span></td>
      <td style="font-size:12px">${fechaBonita(p.fecha)}</td>
      <td>${p.estado==="Publicado"?'<span class="chip" style="background:var(--green-bg);color:var(--green)">Publicado</span>':'<span class="chip" style="background:var(--yellow-bg);color:var(--yellow)">Borrador</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editarPost('${p.id}')">Editar</button> <button class="btn btn-ghost btn-sm" onclick="borrarPost('${p.id}')">✕</button></td>
    </tr>`).join("")}
    </tbody></table></div></div>`;
  return h;
}
function nuevoPost(){ editarPostModal(null); }
function editarPost(id){ editarPostModal(STATE.blog.find(p=>p.id===id)); }
function editarPostModal(p){
  showModal(p?"Editar artículo":"Nuevo artículo",`
    <div class="form-grid">
      <div class="field full"><label>Título</label><input class="inp" id="bl_tit" value="${p?p.titulo:''}"></div>
      <div class="field"><label>Categoría</label><select class="inp" id="bl_cat">${optSel(["Educativo","Guía","Noticia","Consejo"],p?p.cat:"Educativo")}</select></div>
      <div class="field"><label>Estado</label><select class="inp" id="bl_est">${optSel(["Borrador","Publicado"],p?p.estado:"Borrador")}</select></div>
      <div class="field full"><label>Resumen</label><textarea class="inp" id="bl_res" rows="3">${p?p.resumen||'':''}</textarea></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePost(${p?`'${p.id}'`:'null'})">Guardar</button>
    </div>`);
}
function savePost(id){
  const data={titulo:val("bl_tit"),cat:val("bl_cat"),estado:val("bl_est"),resumen:val("bl_res"),fecha:iso(hoy())};
  if(!data.titulo.trim()){toast("El título es obligatorio");return;}
  if(id){Object.assign(STATE.blog.find(p=>p.id===id),data);}
  else{STATE.blog.unshift({id:uid(),...data});}
  save();closeModal();toast("Artículo guardado");render();
}
function borrarPost(id){STATE.blog=STATE.blog.filter(p=>p.id!==id);save();render();}

// ═══════════ ANALÍTICA Y CAMPAÑAS ═══════════
function renderAnalitica(){
  const cs=STATE.creditos||[];
  const prospectos=STATE.prospectos||[];
  // atribución por origen
  const origenes={}; prospectos.forEach(p=>{const o=p.origen||"Directo";origenes[o]=origenes[o]||{n:0,ganado:0};origenes[o].n++;if(p.etapa==="VE"||p.etapa==="PP")origenes[o].ganado++;});
  let h=head("📉 Analítica y campañas","Atribución de origen y desempeño comercial.");
  h+=`<div class="kpi-grid">
    ${kpiC("Prospectos totales",prospectos.length,"","blue")}
    ${kpiC("Convertidos",prospectos.filter(p=>p.etapa==="VE"||p.etapa==="PP").length,"","green")}
    ${kpiC("Tasa conversión global",(prospectos.length?(prospectos.filter(p=>p.etapa==="VE"||p.etapa==="PP").length/prospectos.length*100).toFixed(1):0)+"%","","orange")}
    ${kpiC("Orígenes activos",Object.keys(origenes).length,"","")}
  </div>`;
  h+=`<div class="panel"><div class="panel-title">Atribución por origen (de dónde vienen los clientes)</div>`;
  if(Object.keys(origenes).length){
    const max=Math.max(...Object.values(origenes).map(o=>o.n),1);
    h+=Object.entries(origenes).map(([o,d])=>`<div style="margin-bottom:11px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><b style="color:var(--navy)">${o}</b><span style="color:var(--gray)">${d.n} prospectos · ${d.ganado} ganados</span></div>
      <div style="height:9px;background:var(--line);border-radius:6px;overflow:hidden"><div style="height:100%;width:${d.n/max*100}%;background:var(--gold);border-radius:6px"></div></div></div>`).join("");
  } else h+=`<div class="empty"><div class="ic">📊</div><h3>Sin datos de campañas aún</h3><p>Cuando registres prospectos con su origen, la atribución aparecerá aquí.</p></div>`;
  h+=`</div>
  <div class="panel"><div class="panel-title">Configuración de seguimiento (píxeles y APIs)</div>
    <div style="font-size:13px;color:var(--gray);margin-bottom:12px">Configura los identificadores de seguimiento para atribución publicitaria. Estos se activan en producción.</div>
    <div class="form-grid">
      <div class="field"><label>Píxel de Meta (Facebook)</label><input class="inp" placeholder="Ej. 123456789012345"></div>
      <div class="field"><label>Google Analytics (GA4)</label><input class="inp" placeholder="Ej. G-XXXXXXX"></div>
      <div class="field"><label>Google Ads</label><input class="inp" placeholder="Ej. AW-XXXXXXX"></div>
      <div class="field"><label>TikTok Pixel</label><input class="inp" placeholder="Ej. XXXXXXXX"></div>
    </div>
    <div style="font-size:11.5px;color:var(--gray);margin-top:10px">La instalación real de los píxeles requiere el enlace publicado (producción).</div>
  </div>`;
  return h;
}

// ═══════════ CENTRO DE CASOS ═══════════
function renderCasos(){
  if(!STATE.casos) STATE.casos=[];
  let h=head("🗃️ Centro de casos","Registra y da seguimiento a casos especiales: reclamos, solicitudes, incidencias.",
    `<button class="btn btn-primary" onclick="nuevoCaso()">+ Nuevo caso</button>`);
  const abiertos=STATE.casos.filter(c=>c.estado!=="Cerrado").length;
  h+=`<div class="kpi-grid">
    ${kpiC("Casos abiertos",abiertos,"","orange")}
    ${kpiC("Casos cerrados",STATE.casos.filter(c=>c.estado==="Cerrado").length,"","green")}
    ${kpiC("Total casos",STATE.casos.length,"","")}
  </div>`;
  h+=`<div class="panel" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Asunto</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>`;
  if(!STATE.casos.length){h+=`</tbody></table></div><div class="empty"><div class="ic">🗃️</div><h3>Sin casos registrados</h3></div>`;return h;}
  h+=STATE.casos.slice().reverse().map(c=>{
    const pr={Alta:{bg:"var(--red-bg)",fg:"var(--red)"},Media:{bg:"var(--orange-bg)",fg:"var(--orange)"},Baja:{bg:"var(--green-bg)",fg:"var(--green)"}}[c.prioridad]||{bg:"#eee",fg:"#000"};
    return `<tr><td><b>${c.asunto}</b></td><td>${c.tipo}</td><td><span class="chip" style="background:${pr.bg};color:${pr.fg}">${c.prioridad}</span></td>
    <td>${c.estado==="Cerrado"?'<span class="chip" style="background:var(--green-bg);color:var(--green)">Cerrado</span>':'<span class="chip" style="background:var(--blue-bg);color:var(--blue)">'+c.estado+'</span>'}</td>
    <td style="font-size:12px">${fechaBonita(c.fecha)}</td>
    <td>${c.estado!=="Cerrado"?`<button class="btn btn-ghost btn-sm" onclick="cerrarCaso('${c.id}')">Cerrar</button>`:''}</td></tr>`;
  }).join("");
  h+=`</tbody></table></div></div>`;
  return h;
}
function nuevoCaso(){
  showModal("Nuevo caso",`
    <div class="form-grid">
      <div class="field full"><label>Asunto</label><input class="inp" id="cs_asunto"></div>
      <div class="field"><label>Tipo</label><select class="inp" id="cs_tipo">${optSel(["Reclamo","Solicitud","Incidencia","Consulta","Otro"])}</select></div>
      <div class="field"><label>Prioridad</label><select class="inp" id="cs_prio">${optSel(["Alta","Media","Baja"],"Media")}</select></div>
      <div class="field full"><label>Descripción</label><textarea class="inp" id="cs_desc" rows="3"></textarea></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCaso()">Crear caso</button>
    </div>`);
}
function saveCaso(){
  if(!STATE.casos)STATE.casos=[];
  const asunto=val("cs_asunto"); if(!asunto.trim()){toast("El asunto es obligatorio");return;}
  STATE.casos.push({id:uid(),asunto,tipo:val("cs_tipo"),prioridad:val("cs_prio"),desc:val("cs_desc"),estado:"Abierto",fecha:iso(hoy()),responsable:currentUser()?currentUser().nombre:""});
  save();closeModal();toast("Caso creado");render();
}
function cerrarCaso(id){const c=STATE.casos.find(x=>x.id===id);if(c){c.estado="Cerrado";save();toast("Caso cerrado");render();}}

// ═══════════ INFORMES GERENCIALES (superadmin/superusuario) ═══════════
function kpisGerenciales(){
  const cs=STATE.creditos||[];
  const pagos=STATE.pagos||[];
  const prospectos=STATE.prospectos||[];
  const saldoTotal=cs.reduce((s,c)=>s+(c.saldoTotal||0),0);
  const vencido=cs.reduce((s,c)=>s+(c.saldoVencido||0),0);
  const recaudado=pagos.reduce((s,p)=>s+(p.valor||0),0);
  const interesRecaudado=pagos.reduce((s,p)=>s+(p.interes||0)+(p.mora||0),0);
  const capitalRecaudado=pagos.reduce((s,p)=>s+(p.capital||0)+(p.anticipado||0),0);
  const ventas=prospectos.filter(p=>p.etapa==="VE"||p.etapa==="PP");
  const valorGanado=ventas.reduce((s,p)=>s+(p.valorPotencial||0),0);
  const tasaConv=prospectos.length?(ventas.length/prospectos.length*100):0;
  const tasaMora=saldoTotal?(vencido/saldoTotal*100):0;
  const clientesUnicos=new Set(cs.map(c=>c.clienteDoc)).size;
  return {
    financieros:[
      ["Saldo total de cartera", fmt(saldoTotal), "Valor total de la cartera vigente"],
      ["Cartera al día", fmt(saldoTotal-vencido), ((saldoTotal?((saldoTotal-vencido)/saldoTotal*100):0)).toFixed(1)+"% del total"],
      ["Cartera vencida", fmt(vencido), tasaMora.toFixed(1)+"% (índice de mora)"],
      ["Total recaudado", fmt(recaudado), pagos.length+" pagos registrados"],
      ["Capital recaudado", fmt(capitalRecaudado), "Abono a capital + anticipos"],
      ["Interés recaudado", fmt(interesRecaudado), "Interés corriente + mora"],
    ],
    comerciales:[
      ["Prospectos totales", prospectos.length, "En el pipeline comercial"],
      ["Ventas efectivas", ventas.length, "Negocios ganados (VE + PP)"],
      ["Valor ganado", fmt(valorGanado), "Monto de negocios cerrados"],
      ["Tasa de conversión", tasaConv.toFixed(1)+"%", "Prospectos que se vuelven venta"],
    ],
    operativos:[
      ["Créditos activos", cs.filter(c=>c.estado==="Activo").length, "En gestión actualmente"],
      ["Clientes únicos", clientesUnicos, "Personas atendidas"],
      ["Gestiones registradas", (STATE.gestiones||[]).length, "Contactos y seguimientos"],
      ["Casos abiertos", (STATE.casos||[]).filter(c=>c.estado!=="Cerrado").length, "Reclamos/solicitudes en curso"],
    ],
  };
}
function renderInformesGerenciales(){
  const k=kpisGerenciales();
  const u=currentUser();
  const hoyTxt=hoy().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"});
  let h=head("📊 Informes gerenciales","Informe ejecutivo consolidado con la estructura profesional para la gerencia.",
    `<button class="btn btn-primary" onclick="descargarInformeGerencial()">⭳ Descargar informe PDF</button>`);

  // Encabezado e identificación
  h+=`<div class="panel" style="border-left:4px solid var(--gold)">
    <div class="panel-title">1. Encabezado e identificación</div>
    <div class="form-grid">
      ${info("Elaborado por",u?u.nombre:"—")}${info("Cargo / área",u?u.rolLabel:"—")}
      ${info("Empresa",STATE.empresaActiva)}${info("Fecha del informe",hoyTxt)}
      ${info("Periodo",STATE.lastUpdate?("Corte "+new Date(STATE.lastUpdate).toLocaleDateString("es-CO")):"Actual")}${info("Documento","Informe gerencial GEM")}
    </div>
  </div>`;

  // Resumen ejecutivo
  const tasaMora=(()=>{const cs=STATE.creditos||[];const st=cs.reduce((s,c)=>s+(c.saldoTotal||0),0);const v=cs.reduce((s,c)=>s+(c.saldoVencido||0),0);return st?(v/st*100).toFixed(1):0;})();
  h+=`<div class="panel">
    <div class="panel-title">2. Resumen ejecutivo</div>
    <p style="font-size:14px;line-height:1.7;color:var(--ink)">Durante el periodo, la cartera de <b>${STATE.empresaActiva}</b> se mantiene en <b>${k.financieros[0][1]}</b>, con un índice de mora del <b>${tasaMora}%</b>. Se han recaudado <b>${k.financieros[3][1]}</b> en total. En el frente comercial, el pipeline registra <b>${k.comerciales[0][1]} prospectos</b> con una tasa de conversión del <b>${k.comerciales[3][1]}</b>. La operación mantiene <b>${k.operativos[0][1]} créditos activos</b> sobre <b>${k.operativos[1][1]} clientes únicos</b>.</p>
  </div>`;

  // Introducción y contexto
  h+=`<div class="panel">
    <div class="panel-title">3. Introducción y contexto</div>
    <p style="font-size:14px;line-height:1.7;color:var(--ink)">Este informe consolida el desempeño de las áreas de cartera, comercial y operación de GEM, con el fin de apoyar la toma de decisiones gerenciales. Los datos provienen del sistema de gestión y reflejan el estado a la fecha de corte. El objetivo es identificar el cumplimiento de metas, las desviaciones y las acciones de mejora.</p>
  </div>`;

  // KPIs por categoría
  h+=bloqueKPI("📈 KPIs Financieros (Rentabilidad y Salud Económica)",k.financieros);
  h+=bloqueKPI("💼 KPIs Comerciales y de Ventas (Crecimiento)",k.comerciales);
  h+=bloqueKPI("⚙️ KPIs Operativos y de Procesos (Eficiencia)",k.operativos);

  // Desviaciones y conclusiones
  h+=`<div class="panel">
    <div class="panel-title">7. Desviaciones y problemáticas</div>
    <p style="font-size:14px;line-height:1.7;color:var(--ink)">${tasaMora>25?`El índice de mora (${tasaMora}%) supera el umbral saludable del 25%, concentrado principalmente en las categorías de mayor riesgo (E). Se recomienda intensificar la gestión de cobro en estos casos.`:`El índice de mora se mantiene en niveles manejables (${tasaMora}%). Se recomienda sostener la gestión preventiva de cobro.`}</p>
  </div>
  <div class="panel">
    <div class="panel-title">8. Conclusiones y recomendaciones</div>
    <ul style="font-size:14px;line-height:1.7;color:var(--ink);padding-left:20px">
      <li>Priorizar la recuperación de la cartera vencida en categorías E.</li>
      <li>Fortalecer el pipeline comercial para mejorar la tasa de conversión.</li>
      <li>Mantener el registro diario de gestiones para trazabilidad.</li>
      <li>Continuar la actualización de datos vía importación de Excel.</li>
    </ul>
  </div>`;
  return h;
}
function bloqueKPI(titulo,kpis){
  return `<div class="panel">
    <div class="panel-title">${titulo}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
      ${kpis.map(k=>`<div style="background:var(--cream);border:1px solid var(--line);border-radius:12px;padding:14px 16px">
        <div style="font-size:11.5px;color:var(--gray);font-weight:600;text-transform:uppercase">${k[0]}</div>
        <div style="font-size:20px;font-weight:800;color:var(--navy);margin:5px 0">${k[1]}</div>
        <div style="font-size:11.5px;color:var(--gray)">${k[2]}</div>
      </div>`).join("")}
    </div></div>`;
}
function descargarInformeGerencial(){
  if(!window.jspdf){toast("No se pudo cargar el generador de PDF");return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"pt",format:"a4"});
  const k=kpisGerenciales();
  const u=currentUser();
  const W=595, M=45; let y=0;
  // Membrete
  doc.setFillColor(10,37,64); doc.rect(0,0,W,90,"F");
  try{ doc.addImage(LOGO_SRC,"PNG",M,20,55,42); }catch(e){}
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(17);
  doc.text("GRUPO EMPRESARIAL MARCAL",M+70,42);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(159,192,220);
  doc.text("Informe Gerencial · "+STATE.empresaActiva,M+70,60);
  y=120;
  // Encabezado
  doc.setTextColor(10,37,64); doc.setFont("helvetica","bold"); doc.setFontSize(13);
  doc.text("1. Encabezado e identificación",M,y); y+=20;
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(30,30,40);
  doc.text("Elaborado por: "+(u?u.nombre:"—")+"   |   Cargo: "+(u?u.rolLabel:"—"),M,y); y+=15;
  doc.text("Fecha: "+hoy().toLocaleDateString("es-CO")+"   |   Empresa: "+STATE.empresaActiva,M,y); y+=26;
  // Resumen ejecutivo
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(10,37,64);
  doc.text("2. Resumen ejecutivo",M,y); y+=18;
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(30,30,40);
  const resumen=`La cartera se mantiene en ${k.financieros[0][1]}, con recaudo total de ${k.financieros[3][1]}. El pipeline registra ${k.comerciales[0][1]} prospectos con conversión del ${k.comerciales[3][1]}. Operación con ${k.operativos[0][1]} créditos activos.`;
  doc.splitTextToSize(resumen,W-2*M).forEach(l=>{doc.text(l,M,y);y+=14;}); y+=14;
  // KPIs
  function tablaKPI(titulo,arr){
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(27,108,168);
    if(y>720){doc.addPage();y=50;}
    doc.text(titulo,M,y); y+=16;
    doc.setFontSize(9.5);
    arr.forEach(k=>{
      if(y>780){doc.addPage();y=50;}
      doc.setFont("helvetica","bold"); doc.setTextColor(10,37,64); doc.text(String(k[0])+":",M,y);
      doc.setFont("helvetica","normal"); doc.setTextColor(60,60,70); doc.text(String(k[1]),M+200,y);
      y+=15;
    });
    y+=10;
  }
  tablaKPI("KPIs Financieros",k.financieros);
  tablaKPI("KPIs Comerciales",k.comerciales);
  tablaKPI("KPIs Operativos",k.operativos);
  // Pie
  doc.setFontSize(8); doc.setTextColor(140,140,140);
  doc.text("Documento generado electrónicamente · Grupo Empresarial Marcal · "+new Date().toLocaleString("es-CO"),M,820);
  doc.save("Informe_Gerencial_GEM_"+STATE.empresaActiva+".pdf");
  toast("Informe PDF generado");
}

// ─────────── PLANTILLAS RÁPIDAS (config) ───────────
function renderConfig(){
  let h=head("📋 Plantillas rápidas","Mensajes de WhatsApp listos para usar, con negrilla, emojis y el nombre correcto de cada empresa. Edítalos aquí y se aplican en toda la app.");
  h+=`<div class="panel"><div class="panel-title">💬 Plantillas de WhatsApp por situación</div>
    <div style="font-size:12.5px;color:var(--gray);margin-bottom:14px">Usa <b>{nombre}</b>, <b>{cuota}</b>, <b>{vence}</b> y <b>{empresa}</b> — se reemplazan automáticamente. <i>*texto*</i> se ve en <b>negrilla</b> y <i>_texto_</i> en <i>cursiva</i> dentro de WhatsApp.</div>`;
  const pl=[
    ["r3","🟡 Recordatorio 3 días"],["r2","🟠 Recordatorio 2 días"],["r1","🔴 Recordatorio 1 día"],
    ["hoy","🔴 Vence hoy"],["vencida","🆘 Cuota vencida"],
    ["promesa","🤝 Promesa de pago"],["comprobante","📎 Solicitud de comprobante"]
  ];
  pl.forEach(([k,t])=>{h+=`<div class="field" style="margin-bottom:14px"><label style="font-size:13px">${t}</label>
    <textarea class="inp" rows="4" style="font-family:inherit;line-height:1.5" onchange="STATE.plantillas.${k}=this.value;save();toast('Plantilla guardada')">${STATE.plantillas[k]}</textarea></div>`;});
  h+=`</div>
  <div class="panel"><div class="panel-title">⚙️ Datos del sistema</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="exportBackup()">⭳ Descargar respaldo (JSON)</button>
      <button class="btn btn-ghost" onclick="if(confirm('¿Borrar todos los datos y volver a los datos de ejemplo?')){localStorage.removeItem(STORE_KEY);location.reload();}">Reiniciar datos</button>
    </div>
    <div style="font-size:12px;color:var(--gray);margin-top:10px">En el MVP los datos se guardan en este dispositivo/navegador. En producción estarán centralizados y con respaldo automático.</div>
  </div>`;
  return h;
}
function resetearDatosCero(){
  // Deja la operación en cero: sin créditos, pagos, gestiones, promesas, prospectos, recibos.
  // Conserva: usuarios, plantillas de WhatsApp, y estructura. Listo para cargar cartera real.
  STATE.creditos=[];
  STATE.pagos=[];
  STATE.gestiones=[];
  STATE.promesas=[];
  STATE.prospectos=[];
  STATE.recibos=[];
  STATE.importaciones=[];
  STATE.notificaciones=[];
  STATE.contadorInformes={};
  STATE.contadorRecibos={};
  STATE.documentos={};
  STATE.lastUpdate=new Date().toISOString();
  save();
  toast("Sistema reiniciado en cero. Listo para cargar la cartera real.");
  CURRENT="importar";
  buildNav(); buildMobileBar(); render();
}
function confirmarReset(){
  showModal("⚠️ Reiniciar sistema en cero",`
    <div style="font-size:14px;color:var(--ink);line-height:1.6">
      <p>Esto <b>borra todos los datos de operación</b>: créditos, pagos, gestiones, promesas, prospectos, recibos e historial de importaciones.</p>
      <p style="margin-top:10px"><b>Se conservan:</b> los usuarios/accesos, las plantillas de WhatsApp y la configuración.</p>
      <p style="margin-top:10px">Úsalo una sola vez, antes de cargar la cartera real por Excel. <b>Esta acción no se puede deshacer.</b></p>
      <div style="background:var(--red-bg);border-radius:10px;padding:12px;margin-top:12px;font-size:13px;color:var(--red)">
        Escribe <b>REINICIAR</b> para confirmar:
        <input class="inp" id="resetConfirm" style="width:100%;margin-top:8px" placeholder="REINICIAR">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="if(document.getElementById('resetConfirm').value.trim().toUpperCase()==='REINICIAR'){closeModal();resetearDatosCero();}else{toast('Escribe REINICIAR para confirmar');}">Reiniciar en cero</button>
    </div>`);
}
function exportBackup(){
  const blob=new Blob([JSON.stringify(STATE,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="respaldo_GEM_"+iso(hoy())+".json";a.click();
  toast("Respaldo descargado");
}

// ─────────── BÚSQUEDA GLOBAL ───────────
function globalSearchHandler(q){
  const box=document.getElementById("searchResults");
  if(!q||q.length<2){box.classList.remove("show");return;}
  const ql=q.toLowerCase();
  const res=visibleCreditos().filter(c=>c.nombre.toLowerCase().includes(ql)||(c.clienteDoc||"").includes(q)||(c.celular||"").includes(q)).slice(0,8);
  if(!res.length){box.innerHTML=`<div style="padding:14px;color:var(--gray);font-size:12.5px">Sin resultados para "${q}"</div>`;box.classList.add("show");return;}
  box.innerHTML=`<div class="sr-group">Clientes y créditos</div>`+res.map(c=>`<div class="sr-item" onclick="openCliente('${c.id}');hideSearch()">
    <div class="n">${c.nombre}</div><div class="d">CC ${c.clienteDoc} · ${c.sede} · ${fmt(c.saldoTotal)}</div></div>`).join("");
  box.classList.add("show");
}
function hideSearch(){document.getElementById("searchResults").classList.remove("show");}

// ─────────── ARRANQUE ───────────

// ═══════════════════════════════════════════════════════════
// NAVEGACIÓN UNIFICADA: LANDING / PORTAL / ADMIN / CLIENTE
// ═══════════════════════════════════════════════════════════
// Overlays que se superponen sobre la página pública actual (login, portal admin, portal cliente, selector).
// En el modelo multipágina, la página pública NO se oculta dentro de un div: es el contenido normal
// de cada archivo .html. "Cerrar overlay" simplemente los oculta y se ve la página de nuevo.
function ocultarOverlays(){
  ["portal-picker","login","app","cliente-app"].forEach(x=>{
    const el=document.getElementById(x);
    if(el) el.style.display="none";
  });
  document.body.style.overflow="";
}
function mostrarOverlay(id){
  ocultarOverlays();
  const el=document.getElementById(id);
  if(el) el.style.display = (id==="portal-picker"||id==="login") ? "flex" : "block";
  document.body.style.overflow="hidden";
}
function irAlPortal(){ // desde cualquier página pública, botón Ingresar
  const pl=document.getElementById("pickerLogo"); if(pl) pl.src=LOGO_SRC;
  mostrarOverlay("portal-picker");
}
function volverLanding(){ ocultarOverlays(); window.scrollTo(0,0); }
function entrarAdmin(){ mostrarOverlay("login"); }
function entrarCliente(){ mostrarOverlay("cliente-app"); renderLoginCliente(); }

// Login del cliente por cédula (usuario y contraseña = cédula)
function renderLoginCliente(){
  document.getElementById("cliLogo").src=LOGO_SRC;
  const c=document.getElementById("cliContent");
  c.innerHTML=`
    <div style="max-width:400px;margin:40px auto;background:#fff;border:1px solid #E3E8EE;border-radius:20px;padding:34px;box-shadow:0 20px 60px rgba(10,37,64,.12)">
      <div style="text-align:center;margin-bottom:22px">
        <div style="font-size:38px;margin-bottom:8px">🙋</div>
        <h2 style="font-size:20px;color:#0A2540;font-weight:800">Portal del Cliente</h2>
        <p style="font-size:13px;color:#5A6B7B;margin-top:4px">Ingresa con tu número de documento</p>
      </div>
      <label style="display:block;font-size:12.5px;font-weight:600;color:#5A6B7B;margin-bottom:5px">Documento (cédula)</label>
      <input id="cliUser" class="inp" style="width:100%;margin-bottom:14px" placeholder="Ej. 1110490289">
      <label style="display:block;font-size:12.5px;font-weight:600;color:#5A6B7B;margin-bottom:5px">Contraseña</label>
      <input id="cliPass" type="password" class="inp" style="width:100%;margin-bottom:16px" placeholder="Tu documento" onkeydown="if(event.key==='Enter')loginCliente()">
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="loginCliente()">Ingresar</button>
      <div id="cliError" style="color:#C0392B;font-size:13px;margin-top:10px;text-align:center;display:none"></div>
      <div style="background:#F4EFE4;border-radius:9px;padding:10px 12px;margin-top:16px;font-size:11.5px;color:#5A6B7B;text-align:center">
        Tu <b>usuario y contraseña</b> son tu número de documento. Si no puedes ingresar, contacta a tu asesor.
      </div>
      <div style="text-align:center;margin-top:14px"><button onclick="volverLanding()" style="background:none;border:none;color:#5A6B7B;font-size:13px;cursor:pointer;font-family:inherit">← Volver al inicio</button></div>
    </div>`;
}
function loginCliente(){
  const doc=(document.getElementById("cliUser").value||"").replace(/\D/g,"").trim();
  const pass=(document.getElementById("cliPass").value||"").replace(/\D/g,"").trim();
  const err=document.getElementById("cliError");
  // buscar cliente en la cartera por documento
  const cred=(STATE.creditos||[]).find(c=>String(c.clienteDoc).replace(/\D/g,"")===doc);
  if(!doc || !cred){ err.textContent="Documento no encontrado en el sistema."; err.style.display="block"; return; }
  if(pass!==doc){ err.textContent="La contraseña es tu número de documento."; err.style.display="block"; return; }
  err.style.display="none";
  renderPortalCliente(cred.clienteDoc);
}
function renderPortalCliente(doc){
  const docLimpio=String(doc).replace(/\D/g,"");
  // todos los créditos de ese cliente (puede tener varios)
  const creditos=(STATE.creditos||[]).filter(c=>String(c.clienteDoc).replace(/\D/g,"")===docLimpio);
  const cli=creditos[0];
  const pagos=(STATE.pagos||[]).filter(p=>creditos.some(c=>c.id===p.creditoId)).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const saldoTotal=creditos.reduce((s,c)=>s+(c.saldoTotal||0),0);
  const vencido=creditos.reduce((s,c)=>s+(c.saldoVencido||0),0);
  const alDia=vencido<=0;
  const cuotaTotal=creditos.reduce((s,c)=>s+(c.cuotaValor||0),0);
  const cuotasPagadas=pagos.length;
  const esSeguridadSocial = cli.servicioContratado && /seguridad|salud|pension|arl|caja/i.test(cli.servicioContratado);

  const c=document.getElementById("cliContent");
  c.innerHTML=`
    <div style="background:linear-gradient(135deg,#0A2540,#1B6CA8);color:#fff;border-radius:18px;padding:24px;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:13px;opacity:.85">Bienvenido(a),</div>
          <div style="font-size:23px;font-weight:800">${cli.nombre}</div>
          <div style="font-size:13px;opacity:.85">Documento: ${cli.clienteDoc}</div>
          <div style="display:inline-block;margin-top:10px;background:${alDia?'rgba(30,142,90,.3)':'rgba(192,57,43,.3)'};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700">${alDia?'✅ Al día':'⚠️ Con saldo pendiente'}</div>
        </div>
        <button onclick="volverLanding()" style="background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);color:#fff;padding:8px 15px;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit">Salir</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px" class="cli-cards">
      <div style="background:#fff;border:1px solid #E3E8EE;border-radius:14px;padding:20px">
        <div style="font-size:12px;color:#5A6B7B;font-weight:600;text-transform:uppercase">Próxima cuota</div>
        <div style="font-size:26px;font-weight:800;color:#0A2540;margin-top:6px">$${Math.round(cuotaTotal).toLocaleString("es-CO")}</div>
        <div style="font-size:13px;color:#5A6B7B;margin-top:4px">Día de pago: ${cli.diaPago||"—"}</div>
      </div>
      <div style="background:#fff;border:1px solid #E3E8EE;border-radius:14px;padding:20px">
        <div style="font-size:12px;color:#5A6B7B;font-weight:600;text-transform:uppercase">Saldo total</div>
        <div style="font-size:26px;font-weight:800;color:#0A2540;margin-top:6px">$${Math.round(saldoTotal).toLocaleString("es-CO")}</div>
        ${vencido>0?`<div style="font-size:13px;color:#C0392B;margin-top:4px">Vencido: $${Math.round(vencido).toLocaleString("es-CO")}</div>`:'<div style="font-size:13px;color:#1E8E5A;margin-top:4px">Sin saldo vencido</div>'}
      </div>
    </div>
    <div style="background:#fff;border:1px solid #E3E8EE;border-radius:14px;padding:22px;margin-bottom:18px">
      <div style="font-weight:800;color:#0A2540;font-size:16px;margin-bottom:14px">📋 ${esSeguridadSocial?'Mi afiliación':'Mi(s) crédito(s)'}</div>
      ${creditos.map((cr,idx)=>`<div style="padding:10px 0;${idx<creditos.length-1?'border-bottom:1px solid #F0ECE0':''}">
        <div style="display:flex;justify-content:space-between"><span style="color:#5A6B7B">Entidad</span><b style="color:#0A2540">${cr.entidad}</b></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#5A6B7B">Categoría</span><b style="color:#0A2540">${cr.categoria}</b></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#5A6B7B">Saldo</span><b style="color:#0A2540">$${Math.round(cr.saldoTotal).toLocaleString("es-CO")}</b></div>
      </div>`).join("")}
    </div>
    <div style="background:#fff;border:1px solid #E3E8EE;border-radius:14px;padding:22px;margin-bottom:18px">
      <div style="font-weight:800;color:#0A2540;font-size:16px;margin-bottom:14px">🕒 Historial de pagos</div>
      ${pagos.length?pagos.slice(0,8).map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #F0ECE0"><div><b style="color:#0A2540">$${Math.round(p.valor).toLocaleString("es-CO")}</b><div style="font-size:12px;color:#5A6B7B">${fechaBonita(p.fecha.slice(0,10))} · ${p.metodo||'—'}</div></div><div style="font-size:11px;color:#1E8E5A;font-weight:700">✓ Registrado</div></div>`).join(""):'<div style="color:#5A6B7B;font-size:13px">Aún no hay pagos registrados.</div>'}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="https://wa.me/573158542836?text=${encodeURIComponent('Hola, soy '+cli.nombre+' (CC '+cli.clienteDoc+') y necesito ayuda con mi cuenta.')}" target="_blank" style="flex:1;min-width:180px;background:#25D366;color:#fff;padding:14px;border-radius:11px;text-align:center;font-weight:700;text-decoration:none">💬 Escribir a mi asesor</a>
      <button onclick="descargarCertificadoCliente('${cli.id}')" style="flex:1;min-width:180px;background:#E8A33D;color:#3a2609;padding:14px;border-radius:11px;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px">📄 Certificado de planilla</button>
    </div>`;
}
function descargarCertificadoCliente(cid){
  // reutiliza el generador de certificados del admin
  if(typeof generarCertificado==="function"){ generarCertificado(cid); }
  else { toast("Certificado no disponible"); }
}

// Portal cliente DEMO (mantener por compatibilidad, ya no se usa en el flujo principal)
function renderClienteDemo(){ renderLoginCliente(); }


// ═══════════════════════════════════════════════════════════
// BLOQUE 2: CARRUSEL EMPRESAS · EDUCACIÓN · POLÍTICA · DOCS
// ═══════════════════════════════════════════════════════════
const EMPRESAS_GRUPO = [
  {n:"Coomsertar", c:"#1E8E5A"}, {n:"Colombia Mejor", c:"#1B6CA8"},
  {n:"Asocomser", c:"#C6820E"}, {n:"Servicomser", c:"#8E44AD"},
  {n:"Tolima", c:"#C0392B"}, {n:"Marcal", c:"#0A2540"},
  {n:"Coomfocol", c:"#E67E22"}, {n:"Coofisol", c:"#16A085"},
];
function renderMarquee(){
  const m=document.getElementById("lpMarquee"); if(!m) return;
  // duplicar la lista para loop continuo
  const chips = EMPRESAS_GRUPO.concat(EMPRESAS_GRUPO).map(e=>
    `<div class="lp-emp-chip"><span class="dot" style="background:${e.c}"></span><span class="nm">${e.n}</span></div>`).join("");
  m.innerHTML = chips;
}

const EDU_TEMAS = [
  {ic:"📋", t:"¿Qué es la planilla?", tag:"Lo básico",
   desc:"La planilla (PILA) es el documento con el que se pagan mensualmente los aportes a seguridad social. Es como el 'recibo' que certifica que estás al día con salud, pensión y riesgos laborales.",
   dato:"Sin planilla al día, no tienes cobertura de salud ni protección ante accidentes laborales.",
   extra:"Todo trabajador —dependiente o independiente— debe tener su planilla al día. GEM te ayuda a liquidarla y pagarla correctamente cada mes."},
  {ic:"🏥", t:"¿Qué es Seguridad Social?", tag:"Fundamental",
   desc:"Es el sistema que te protege ante enfermedad, vejez y accidentes de trabajo. Se compone de tres pilares: Salud (EPS), Pensión (fondo) y Riesgos Laborales (ARL).",
   dato:"En Colombia, cotizar a seguridad social es obligatorio para todo trabajador con ingresos.",
   extra:"Estar afiliado te da acceso a atención médica, ahorro para tu vejez y respaldo si te accidentas trabajando."},
  {ic:"⚠️", t:"¿Qué es ARL y los riesgos?", tag:"Protección laboral",
   desc:"La ARL (Administradora de Riesgos Laborales) te cubre si sufres un accidente o enfermedad por tu trabajo. El nivel de aporte depende del riesgo de tu actividad.",
   dato:"Existen 5 niveles de riesgo: I (mínimo, oficina) hasta V (máximo, alturas, minería).",
   extra:"Riesgo I: trabajos de oficina. Riesgo II: comercio ligero. Riesgo III: manufactura. Riesgo IV: construcción. Riesgo V: alturas, explosivos, minería. A mayor riesgo, mayor aporte pero mayor cobertura."},
  {ic:"👨‍👩‍👧", t:"¿Qué es la Caja de Compensación?", tag:"Bienestar",
   desc:"Es una entidad que te da beneficios adicionales: subsidio familiar, recreación, educación, vivienda y descuentos. Se financia con un aporte de tu empleador o tuyo si eres independiente.",
   dato:"Aportando a caja puedes acceder al subsidio de vivienda de hasta $52 millones.",
   extra:"Además del subsidio de vivienda, tienes acceso a cursos, parques recreativos, créditos blandos y subsidio en efectivo para tus hijos."},
  {ic:"👴", t:"¿Qué es el aporte a Pensión?", tag:"Tu futuro",
   desc:"Es el ahorro obligatorio para cuando dejes de trabajar. Cada mes aportas un porcentaje de tu ingreso y ese dinero se acumula para tu vejez o para cubrirte por invalidez.",
   dato:"Entre más temprano empieces a cotizar, mejor pensión tendrás al jubilarte.",
   extra:"La pensión se obtiene al cumplir la edad (57 mujeres / 62 hombres) y las semanas cotizadas requeridas. Empezar joven marca una gran diferencia."},
  {ic:"💊", t:"¿Qué es Salud (EPS)?", tag:"Fundamental",
   desc:"Es tu cobertura médica: consultas, hospitalización, medicamentos, urgencias y exámenes. Te afilias a una EPS que gestiona tu atención.",
   dato:"Como asociado a GEM puedes acceder a beneficios en el pago de tu salud (Ley 1607).",
   extra:"Estar afiliado a salud te garantiza atención médica para ti y tu familia. GEM te asesora para elegir y mantener tu EPS al día."},
  {ic:"⚖️", t:"Fondo privado vs. público", tag:"Decisión clave",
   desc:"Para pensión puedes elegir entre el fondo público (Colpensiones) o un fondo privado (AFP). Cada uno tiene reglas distintas sobre cómo se calcula tu pensión.",
   dato:"La elección correcta depende de tu edad, ingresos y semanas cotizadas.",
   extra:"Colpensiones (público): pensión basada en tu salario promedio, mejor para ingresos medios/altos con muchas semanas. Fondo privado (AFP): pensión según lo ahorrado, con posibilidad de heredar el saldo. GEM te orienta sin sesgos para que elijas bien."},
];
function renderEduGrid(){
  const g=document.getElementById("eduGrid"); if(!g) return;
  g.innerHTML = EDU_TEMAS.map((e,i)=>`
    <div class="lp-edu-card" onclick="abrirEdu(${i})">
      <div class="ic">${e.ic}</div>
      <h4>${e.t}</h4>
      <p>${e.desc.slice(0,90)}…</p>
      <div class="ver">Leer más →</div>
    </div>`).join("");
}
function abrirEdu(i){
  const e=EDU_TEMAS[i];
  document.getElementById("eduBox").innerHTML=`
    <span class="cerrar" onclick="cerrarEdu()">×</span>
    <span class="tag">${e.tag}</span>
    <h3>${e.ic} ${e.t}</h3>
    <p>${e.desc}</p>
    <div class="dato">💡 <b>Dato clave:</b> ${e.dato}</div>
    <p>${e.extra}</p>
    <div style="margin-top:18px;text-align:center">
      <a href="#contacto" onclick="cerrarEdu()" class="lp-btn lp-btn-primary" style="display:inline-block">Quiero asesoría sobre esto →</a>
    </div>`;
  document.getElementById("eduModal").classList.add("show");
}
function cerrarEdu(){ document.getElementById("eduModal").classList.remove("show"); }

function abrirPolitica(){
  document.getElementById("polBox").innerHTML=`
    <span class="cerrar" onclick="cerrarPolitica()">×</span>
    <span class="tag">Legal</span>
    <h3>🔒 Política de tratamiento de datos y cookies</h3>
    <p>Grupo Empresarial Marcal S.A.S. (GEM) protege la información personal de sus usuarios conforme a la <b>Ley 1581 de 2012</b> de protección de datos personales de Colombia.</p>
    <p><b>Datos que recolectamos:</b> nombre, documento, contacto y datos necesarios para la gestión de seguridad social, créditos y afiliaciones.</p>
    <p><b>Finalidad:</b> prestar y administrar nuestros servicios, contactarte, y cumplir obligaciones legales. No vendemos ni compartimos tus datos con terceros sin autorización.</p>
    <p><b>Cookies y tecnologías:</b> este sitio puede usar cookies, píxeles de seguimiento (como el Píxel de Meta) y APIs para mejorar la experiencia y medir el alcance de nuestras campañas. Puedes desactivarlas en tu navegador.</p>
    <p><b>Tus derechos:</b> puedes conocer, actualizar, rectificar o solicitar la eliminación de tus datos escribiéndonos a nuestros canales oficiales.</p>
    <div class="dato">Al usar este sitio y nuestros servicios, autorizas el tratamiento de tus datos conforme a esta política.</div>`;
  document.getElementById("polModal").classList.add("show");
}
function cerrarPolitica(){ document.getElementById("polModal").classList.remove("show"); }

// ═══════════ DOCUMENTACIÓN POR EMPRESA (módulo admin protegido) ═══════════
function renderDocumentos(){
  if(!STATE.documentos) STATE.documentos={};
  let h=head("📁 Documentación por empresa","Sube y consulta los PDF de cada empresa del grupo. Acceso solo para personal autorizado.");
  h+=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">`;
  h+=EMPRESAS_GRUPO.map(e=>{
    const docs=(STATE.documentos[e.n]||[]);
    return `<div class="panel" style="margin-bottom:0">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <span class="dot" style="width:12px;height:12px;border-radius:50%;background:${e.c};display:inline-block"></span>
        <b style="color:var(--navy);font-size:15px">${e.n}</b>
      </div>
      <div style="font-size:12px;color:var(--gray);margin-bottom:10px">${docs.length} documento(s)</div>
      <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" onclick="subirDocEmpresa('${e.n}')">⬆ Subir PDF</button>
      ${docs.length?`<div style="margin-top:10px">${docs.map((d,i)=>`<div style="font-size:12px;color:var(--ink);padding:5px 0;border-bottom:1px solid #f2eee2;display:flex;justify-content:space-between;gap:6px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${d.nombre} <span style="color:var(--gray-l)">${d.tam||''}</span></span>
        <span onclick="quitarDoc('${e.n}',${i})" style="cursor:pointer;color:var(--red)">✕</span></div>`).join("")}</div>`:''}
    </div>`;
  }).join("");
  h+=`</div>`;
  return h;
}
function subirDocEmpresa(empresa){
  const inp=document.getElementById("docFileInput");
  inp.onchange=()=>{
    if(!STATE.documentos) STATE.documentos={};
    if(!STATE.documentos[empresa]) STATE.documentos[empresa]=[];
    Array.from(inp.files).forEach(f=>{
      STATE.documentos[empresa].push({nombre:f.name, fecha:new Date().toISOString(), tam:Math.round(f.size/1024)+" KB"});
    });
    save(); render();
    toast(inp.files.length+" documento(s) agregado(s) a "+empresa);
    inp.value="";
  };
  inp.click();
}
function quitarDoc(empresa,i){
  if(STATE.documentos && STATE.documentos[empresa]){
    STATE.documentos[empresa].splice(i,1); save(); render();
  }
}
// Inicializa elementos comunes de CUALQUIER página pública (llamar en cada .html)
function initPagina(paginaActiva){
  document.querySelectorAll(".gem-logo-img").forEach(img=>{ img.src=LOGO_SRC; });
  const hl=document.getElementById("heroLogo"); if(hl) hl.src=LOGO_SRC;
  renderMarquee();
  renderEduGrid();
  renderBlogPublico();
  renderArticuloDesdeURL();
  // marcar el pill activo del nav
  if(paginaActiva){
    document.querySelectorAll(".gnav-pill").forEach(p=>{
      p.classList.toggle("active", p.dataset.page===paginaActiva);
    });
  }
  boot();
}
// Alias por compatibilidad con nombres anteriores
function initLanding(){ initPagina(); }
const BLOG_DEFAULT=[
  {slug:"beneficios-seguridad-social",titulo:"5 beneficios de estar afiliado a seguridad social",cat:"Educativo",resumen:"Descubre por qué estar en regla te protege a ti y a tu familia.",
   cuerpo:"Estar afiliado a seguridad social no es solo cumplir un requisito: es proteger tu presente y tu futuro. Aquí los 5 beneficios clave:\n\n1. Atención médica para ti y tu familia a través de la EPS.\n2. Ahorro para tu vejez mediante el aporte a pensión.\n3. Cobertura ante accidentes de trabajo con la ARL.\n4. Acceso a subsidios y recreación por la caja de compensación.\n5. Posibilidad de acceder a créditos y al subsidio de vivienda.\n\nEn GEM te acompañamos en todo el proceso para que estés en regla sin complicaciones."},
  {slug:"subsidio-vivienda",titulo:"¿Cómo aplicar al subsidio de vivienda?",cat:"Guía",resumen:"Paso a paso para acceder al subsidio de hasta $52 millones.",
   cuerpo:"El subsidio de vivienda puede llegar hasta $52 millones y es un apoyo real para comprar casa propia. Para acceder:\n\n1. Afíliate a una caja de compensación (nosotros te ayudamos).\n2. Aporta de forma constante durante al menos 6 meses.\n3. Reúne los requisitos de la caja y postúlate.\n4. Recibe el subsidio y aplícalo a tu vivienda.\n\nEn GEM te guiamos en cada paso para que no te pierdas ningún requisito."},
  {slug:"independiente-cotizar",titulo:"Independiente: así cotizas sin complicarte",cat:"Consejo",resumen:"Todo lo que necesitas saber para pagar tu seguridad social como independiente.",
   cuerpo:"Ser independiente no significa quedarte sin protección. Como trabajador por cuenta propia también puedes (y debes) cotizar:\n\n1. Se calcula sobre el 40% de tus ingresos mensuales.\n2. Incluye salud, pensión y riesgos laborales.\n3. Puedes hacerlo mensualmente a través de una planilla (PILA).\n4. Con GEM, nosotros liquidamos y gestionamos tu pago cada mes.\n\nOlvídate de trámites: nosotros nos encargamos para que estés siempre al día."},
];
function blogPosts(){
  let posts=(STATE.blog||[]).filter(p=>p.estado==="Publicado");
  return posts.length?posts:BLOG_DEFAULT;
}
// Listado (usado en blog.html)
function renderBlogPublico(){
  const g=document.getElementById("blogGrid"); if(!g) return;
  const posts=blogPosts();
  g.innerHTML=posts.map((p,i)=>`
    <a class="lp-edu-card" href="blog-articulo.html?slug=${p.slug||i}" style="text-decoration:none;color:inherit;display:block">
      <div class="ic">📰</div>
      <h4>${p.titulo}</h4>
      <p>${p.resumen||''}</p>
      <div class="ver">Leer artículo →</div>
    </a>`).join("");
}
// Página individual del artículo (blog-articulo.html) — lee el slug de la URL, NO de un ancla
function renderArticuloDesdeURL(){
  const cont=document.getElementById("blogArtContent"); if(!cont) return;
  const params=new URLSearchParams(window.location.search);
  const slug=params.get("slug");
  const posts=blogPosts();
  const p = posts.find(x=>String(x.slug)===String(slug)) || posts[Number(slug)] || posts[0];
  if(!p){ cont.innerHTML="<p>Artículo no encontrado.</p>"; return; }
  document.title = p.titulo+" — Blog GEM";
  const cuerpo=(p.cuerpo||p.resumen||"").split("\n").filter(l=>l.trim()).map(l=>`<p style="font-size:15.5px;line-height:1.8;color:var(--ink);margin-bottom:15px">${l}</p>`).join("");
  cont.innerHTML=`
    <div class="pg-crumb"><a href="index.html">Inicio</a> / <a href="blog.html">Blog</a> / ${p.titulo}</div>
    <span class="lp-sec-tag" style="display:inline-block;margin:12px 0 14px">${p.cat||"Artículo"}</span>
    <h1 style="font-size:32px;color:var(--petroleo);line-height:1.2;margin-bottom:10px">${p.titulo}</h1>
    <div style="font-size:13px;color:var(--gris);margin-bottom:26px;padding-bottom:20px;border-bottom:1px solid var(--linea)">Por GEM · ${p.fecha?fechaBonita(p.fecha):hoy().toLocaleDateString("es-CO")}</div>
    ${cuerpo}
    <div style="margin-top:30px;padding:24px;background:var(--marfil);border-radius:14px;text-align:center">
      <div style="font-weight:700;color:var(--petroleo);margin-bottom:12px;font-size:15px">¿Tienes dudas sobre este tema?</div>
      <a href="https://wa.me/573158542836" target="_blank" class="lp-btn lp-btn-primary" style="display:inline-block">💬 Habla con un asesor</a>
      <a href="blog.html" style="display:block;margin-top:14px;color:var(--gris);font-size:13px">← Volver al blog</a>
    </div>`;
}
// ═══════════════════════════════════════════════════════════
// BLOQUE 4: ASISTENTE IA + NOTIFICACIONES
// ═══════════════════════════════════════════════════════════
let iaAbierto=false;
function toggleIA(){
  iaAbierto=!iaAbierto;
  document.getElementById("iaPanel").classList.toggle("show",iaAbierto);
  if(iaAbierto){
    // re-inicializar el saludo según contexto (público o logueado)
    const b=document.getElementById("iaBody");
    b.innerHTML=""; b.dataset.init="1";
    const logueado = !!(STATE.currentUserId && getUser(STATE.currentUserId));
    if(logueado){
      const u=getUser(STATE.currentUserId);
      iaBot(`¡Hola! 👋 Soy el asistente interno de GEM. Puedo responder sobre cartera, cobros, pagos y pipeline según tu rol. ¿En qué te ayudo, ${u.nombre}?`);
    } else {
      iaBot("¡Hola! 👋 Soy el asistente de GEM. Puedo contarte sobre nuestros servicios y explicarte temas de seguridad social (salud, pensión, ARL, caja). ¿Qué te gustaría saber?");
    }
    iaSugerencias(logueado);
  }
}
function iaBot(txt){
  const b=document.getElementById("iaBody");
  const d=document.createElement("div"); d.className="ia-msg bot"; d.innerHTML=txt;
  b.appendChild(d); b.scrollTop=b.scrollHeight;
}
function iaUser(txt){
  const b=document.getElementById("iaBody");
  const d=document.createElement("div"); d.className="ia-msg user"; d.textContent=txt;
  b.appendChild(d); b.scrollTop=b.scrollHeight;
}
function iaSugerencias(logueado){
  const b=document.getElementById("iaBody");
  const d=document.createElement("div"); d.className="ia-sug";
  const sug = logueado
    ? ["¿Cuánto es la cartera total?","¿Cuántos créditos vencidos hay?","¿Cuántos cobros urgentes?","¿Cómo va el pipeline?","¿Qué es la ARL?"]
    : ["¿Qué servicios ofrecen?","¿Qué es la seguridad social?","¿Qué es la ARL?","¿Qué es la caja de compensación?","¿Cómo me afilio?"];
  d.innerHTML=sug.map(s=>`<button onclick="preguntarIA('${s}')">${s}</button>`).join("");
  b.appendChild(d); b.scrollTop=b.scrollHeight;
}
function preguntarIA(texto){
  const inp=document.getElementById("iaInput");
  const q = texto || inp.value.trim();
  if(!q) return;
  iaUser(q);
  inp.value="";
  setTimeout(()=>{ iaBot(responderIA(q)); }, 350);
}
function responderIA(q){
  const t=q.toLowerCase();
  const logueado = !!(STATE.currentUserId && getUser(STATE.currentUserId));
  const cs=STATE.creditos||[];
  const fmt2=n=>"$"+Math.round(n).toLocaleString("es-CO");
  // ── SEGURIDAD: si el usuario NO tiene sesión, el asistente NO revela métricas ──
  const pideMetricas = /(cartera|saldo|vencid|mora|cobro|pipeline|prospecto|negocio|categor|recaud|pago|crédito|credito)/.test(t);
  if(!logueado && pideMetricas){
    return `Esa información es privada y solo está disponible para el personal autorizado de GEM tras iniciar sesión. 🔒<br><br>Puedo ayudarte con temas generales de seguridad social (salud, pensión, ARL, caja de compensación) o contarte sobre nuestros servicios. ¿Qué te gustaría saber?`;
  }
  // Datos base (solo se calculan/usan si hay sesión)
  const saldoTotal=cs.reduce((s,c)=>s+(c.saldoTotal||0),0);
  const vencido=cs.reduce((s,c)=>s+(c.saldoVencido||0),0);
  const alDia=saldoTotal-vencido;
  const nVencidos=cs.filter(c=>c.saldoVencido>0&&c.estado==="Activo").length;
  const urg=(typeof cobrosUrgentes==="function")?cobrosUrgentes().length:0;
  const nProsp=(STATE.prospectos||[]).length;
  const ventas=(STATE.prospectos||[]).filter(p=>p.etapa==="VE"||p.etapa==="PP").length;

  // Coincidencias por tema
  if(/(cartera total|saldo total|cuánta cartera|cuanta cartera|total de cartera)/.test(t))
    return `La cartera total actual es <b>${fmt2(saldoTotal)}</b> distribuida en <b>${cs.length} créditos</b>. De eso, <b>${fmt2(alDia)}</b> está al día y <b>${fmt2(vencido)}</b> vencido (${saldoTotal?(vencido/saldoTotal*100).toFixed(1):0}%).`;
  if(/(vencid|mora|atrasad)/.test(t))
    return `Hay <b>${nVencidos} créditos con saldo vencido</b>, por un total de <b>${fmt2(vencido)}</b>. Puedes verlos en Gestión de cobros ordenados por prioridad.`;
  if(/(cobro|urgent|hoy)/.test(t))
    return `Tienes <b>${urg} cobros urgentes</b> (vencen en 3 días hábiles o menos, o ya vencidos). Están en "Mi trabajo de hoy" con el botón de WhatsApp listo.`;
  if(/(al d[ií]a|vigente|sin vencer)/.test(t))
    return `La cartera al día es <b>${fmt2(alDia)}</b>, que representa el ${saldoTotal?(alDia/saldoTotal*100).toFixed(1):0}% del total.`;
  if(/(pipeline|prospecto|negocio|comercial|venta)/.test(t))
    return `En el pipeline comercial hay <b>${nProsp} negocios</b> registrados, de los cuales <b>${ventas}</b> son ventas efectivas o pagadas. Revisa el Panel comercial para ver el pronóstico ponderado.`;
  if(/categor/.test(t)){
    const porCat={}; cs.forEach(c=>porCat[c.categoria]=(porCat[c.categoria]||0)+1);
    return "Distribución por categoría de riesgo: "+Object.entries(porCat).map(([k,v])=>`<b>${k}</b>: ${v}`).join(", ")+".";
  }
  if(/(arl|riesgo laboral)/.test(t))
    return `La <b>ARL</b> (Administradora de Riesgos Laborales) cubre accidentes y enfermedades por el trabajo. Hay 5 niveles de riesgo: I (oficina) a V (alturas, minería). A mayor riesgo, mayor aporte y cobertura.`;
  if(/(pensi[óo]n)/.test(t))
    return `La <b>pensión</b> es el ahorro obligatorio para la vejez. Entre más temprano se cotice, mejor pensión. Se obtiene al cumplir la edad (57 mujeres / 62 hombres) y las semanas requeridas.`;
  if(/(caja|compensaci[óo]n)/.test(t))
    return `La <b>caja de compensación</b> da subsidio familiar, recreación, educación y acceso al subsidio de vivienda de hasta $52 millones aportando ~6 meses.`;
  if(/(salud|eps)/.test(t))
    return `La <b>salud (EPS)</b> cubre consultas, hospitalización, medicamentos y urgencias. Como asociado a GEM hay beneficios en el pago (Ley 1607).`;
  if(/(planilla|pila)/.test(t))
    return `La <b>planilla (PILA)</b> es el documento mensual con que se pagan los aportes a salud, pensión y riesgos. Sin ella al día, no hay cobertura.`;
  if(/(recibo|factura)/.test(t))
    return `Puedes generar recibos con la marca de cada empresa en la sección <b>Recibos</b>: busca por cédula, autocompleta y descarga/imprime.`;
  if(/(hola|buenas|buenos|saludo)/.test(t))
    return `¡Hola! 😊 ¿En qué te ayudo? Puedo darte cifras de la cartera, cobros urgentes, estado del pipeline o explicarte temas de seguridad social.`;
  if(/(gracias|listo|perfecto)/.test(t))
    return `¡Con gusto! 🙌 Si necesitas algo más sobre la cartera o los clientes, aquí estoy.`;
  if(/(servicio|ofrecen|qué hacen|que hacen|portafolio)/.test(t))
    return `En GEM te acompañamos con: <b>Seguridad Social</b> (salud, pensión, ARL), <b>Caja de Compensación</b>, <b>Créditos</b> y <b>Subsidio de Vivienda</b>. Todo con asesoría cercana y trato humano. ¿Sobre cuál quieres saber más?`;
  if(/(afili|c[óo]mo me inscribo|c[óo]mo empiezo|quiero afiliarme|inscribir)/.test(t))
    return `Para afiliarte es muy fácil: escríbenos por WhatsApp o acércate a una de nuestras sedes (Ibagué, Girardot o Neiva) y un asesor te guía en todo el proceso. La asesoría es <b>gratuita</b>. 📲`;
  if(/(sede|d[óo]nde est[áa]n|ubicaci[óo]n|direcci[óo]n)/.test(t))
    return `Tenemos presencia en <b>Ibagué</b> (sede principal), <b>Girardot</b> y <b>Neiva</b>. Escríbenos para indicarte la dirección más cercana.`;
  // Respuesta por defecto
  return logueado
    ? `Puedo ayudarte con: <b>cartera total</b>, <b>créditos vencidos</b>, <b>cobros urgentes</b>, <b>estado del pipeline</b>, <b>categorías de riesgo</b>, o temas como <b>ARL, pensión, caja y salud</b>. ¿Sobre cuál quieres saber?`
    : `Puedo contarte sobre nuestros <b>servicios</b>, cómo <b>afiliarte</b>, nuestras <b>sedes</b>, o explicarte temas de seguridad social como <b>ARL, pensión, caja y salud</b>. ¿Qué te gustaría saber?`;
}

// ─── NOTIFICACIONES (campanita) ───
function generarNotificaciones(){
  const notifs=[];
  const cs=STATE.creditos||[];
  const u=currentUser();
  const rol=u?u.rol:"";
  if(rol==="cartera"||rol==="superadmin"||rol==="superusuario"){
    const urg=(typeof cobrosUrgentes==="function")?cobrosUrgentes().length:0;
    if(urg>0) notifs.push({ic:"🎯",tt:"Cobros urgentes",ms:`${urg} créditos vencen pronto o están vencidos. Revisa Mi trabajo de hoy.`});
    const promInc=(STATE.promesas||[]).filter(p=>p.estado==="Incumplida").length;
    if(promInc>0) notifs.push({ic:"🤝",tt:"Promesas incumplidas",ms:`${promInc} promesas de pago vencieron sin registrarse el pago.`});
    const sinCel=cs.filter(c=>!c.celular||c.celular.length!==10).length;
    if(sinCel>0) notifs.push({ic:"📵",tt:"Datos incompletos",ms:`${sinCel} clientes sin celular válido. Revisa Calidad de datos.`});
  }
  if(rol==="comercial"||rol==="superadmin"||rol==="superusuario"){
    const ph=(typeof prospectosHoy==="function")?prospectosHoy().length:0;
    if(ph>0) notifs.push({ic:"📌",tt:"Prospectos de hoy",ms:`${ph} prospectos requieren tu gestión hoy.`});
  }
  if(STATE.lastUpdate){
    notifs.push({ic:"☁",tt:"Sistema actualizado",ms:`Última actualización: ${new Date(STATE.lastUpdate).toLocaleString("es-CO")}.`});
  }
  return notifs;
}
function actualizarBadgeNotif(){
  const notifs=generarNotificaciones();
  const badge=document.getElementById("notifBadge");
  if(!badge) return;
  const urgentes=notifs.filter(n=>n.tt!=="Sistema actualizado").length;
  if(urgentes>0){ badge.textContent=urgentes; badge.style.display="flex"; }
  else badge.style.display="none";
}
let notifAbierto=false;
function toggleNotif(){
  notifAbierto=!notifAbierto;
  const panel=document.getElementById("notifPanel");
  if(notifAbierto){
    const notifs=generarNotificaciones();
    panel.innerHTML = notifs.length
      ? `<div style="padding:12px 15px;border-bottom:1px solid var(--line);font-weight:700;color:var(--navy);font-size:13.5px">🔔 Notificaciones</div>`+
        notifs.map(n=>`<div class="notif-item"><span class="ic">${n.ic}</span><div><div class="tt">${n.tt}</div><div class="ms">${n.ms}</div></div></div>`).join("")
      : `<div style="padding:24px;text-align:center;color:var(--gray);font-size:13px">Sin notificaciones nuevas ✓</div>`;
    panel.classList.add("show");
  } else {
    panel.classList.remove("show");
  }
}
// Nota: cada página HTML llama a initPagina('nombre-pagina') en su propio <script> al final del body.




