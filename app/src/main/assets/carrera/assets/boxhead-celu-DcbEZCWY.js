import{c as X}from"./link-BlOJfVdo.js";import{h as _,g as K}from"./touch-BGY8oz9L.js";import{W as M,P as U,a as V,A as W,M as G}from"./protocol-Mrtavdi7.js";_();K();const Q=new URLSearchParams(location.hash.slice(1));var F;const j=(F=Q.get("r"))!=null?F:"",u=document.getElementById("app"),D=e=>`#${e.toString(16).padStart(6,"0")}`,Z=e=>e.replace(/[&<>"']/g,o=>`&#${o.charCodeAt(0)};`);let B=null,S=sessionStorage.getItem(`gd.boxhead.k.${j}`)||"",E=localStorage.getItem("gd.jname")||"",a=null,A=!1,f=!1,q=!1,b="",C=0,R=0,T=!1,H=!1,P=!1,L=null,z=0,O=0;const N=X(()=>({t:"join",room:j,name:E||"Jugador",key:S}),e=>{if(e.t==="joined"){B=e.id,S=e.key,E||(E=e.name);try{sessionStorage.setItem(`gd.boxhead.k.${j}`,S)}catch{}h(!0)}else e.t==="all"?(a=e.d,document.body.classList.toggle("playing",a.phase==="play"),a.phase==="play"&&b==="play"&&!f?J():h(!1)):e.t==="you"&&e.d.kicked&&(q=!0,h(!0))},e=>{A=e,b!=="play"&&h(!0)});function d(e){N.send({t:"cmd",d:e})}function p(){!a||a.phase!=="play"||N.send({t:"in",s:0,x:Math.round(C*100)/100,y:Math.round(R*100)/100,b:P,n:H,k:T})}setInterval(()=>{a&&a.phase==="play"&&p()},40);function Y(){if(!(!a||B===null))return a.seats.find(e=>e.id===B)}function J(){const e=Y();if(!e||!a)return;const o=document.getElementById("hp-fill");o&&(o.style.width=`${Math.max(0,Math.min(100,e.hp/e.maxHp*100))}%`,o.style.background=e.downed?"#ff9f1c":e.hp>40?"#7dff6b":"#ff5555");const n=document.getElementById("wep-name");if(n){const r=M[e.weapon];n.textContent=`${r.name}${e.ammo>=0?` (${e.ammo})`:" ∞"}`}const s=document.getElementById("btn-dash");s&&s.classList.toggle("ready",e.dashReady);const c=document.getElementById("my-score");c&&(c.textContent=e.downed?"¡CAÍDO!":e.dead?"MUERTO":`${e.score} pts`)}function h(e){if(q){b="kicked",u.innerHTML='<div class="screen"><div class="box"><div class="title">Te sacaron de la sala</div></div></div>';return}if(!a){b="wait",u.innerHTML=`<div class="screen"><div class="box"><div class="title">Boxhead: Horda</div><div style="margin-top:8px;opacity:0.75">${A?"Conectando a la sala…":"Buscando el proyector…"}</div></div></div>`;return}const o=B!==null&&a.lead===B,n=Y(),s=n?D(n.color):"#2e8bff";if(a.phase==="perk"){b="perk";const t=n?n.perkChoices:[],I=n&&n.pickedPerk?`<div class="box" style="text-align:center;font-size:16px">¡Mejora elegida! Esperando al resto… (${a.perkTime} s)</div>`:`<div class="perks">${t.map(v=>{const g=U[v];return`<button class="perk-card" data-perk="${v}" style="border-color:${g.color}"><b style="color:${g.color}">${g.title}</b><span>${g.desc}</span></button>`}).join("")}</div>`;u.innerHTML=`
      <div class="screen">
        <div class="head">
          <div class="title">Oleada ${a.wave} superada</div>
          <div class="badge">${a.perkTime} s</div>
        </div>
        ${I}
      </div>`,u.querySelectorAll("[data-perk]").forEach(v=>{v.onclick=()=>d({a:"perk",perk:v.dataset.perk})});return}if(a.phase==="play"){if(b==="play"&&!e&&!f){J();return}b="play";const t=n?M[n.weapon]:M.pistol;u.innerHTML=`
      <div class="pad">
        <div class="hud-bar">
          <div class="hp-wrap">
            <span id="my-score" style="font-size:13px;font-weight:600;color:${s}">${n?n.score:0} pts</span>
            <div class="hp-bar"><div class="hp-fill" id="hp-fill" style="width:${n?n.hp/n.maxHp*100:100}%"></div></div>
          </div>
          <div class="wep-bar">
            <button class="wep-btn" id="wep-prev">‹</button>
            <div class="wep-name" id="wep-name">${t.name}${n&&n.ammo>=0?` (${n.ammo})`:" ∞"}</div>
            <button class="wep-btn" id="wep-next">›</button>
          </div>
          <button class="wep-btn" id="open-menu">Menú</button>
        </div>
        <div class="controls">
          <div class="zone" id="joy-zone">
            <div class="stick-base" id="stick-base"><div class="stick-knob" id="stick-knob"></div></div>
          </div>
          <div class="actions">
            <div class="side-col">
              <button class="act-btn small ready" id="btn-dash">DASH</button>
              <button class="act-btn small" id="btn-alt">BARRIL</button>
            </div>
            <button class="act-btn fire" id="btn-fire">DISPARAR</button>
          </div>
        </div>
      </div>
      ${f?te(o):""}`,ee(),ne(o);return}b=a.phase;const c=V.map(t=>`<div class="swatch ${n&&n.color===t?"on":""}" data-color="${t}" style="background:${D(t)}"></div>`).join(""),r=W.map(t=>`<button class="btn ${a.arena===t.id?"on":""}" data-arena="${t.id}">${t.name}</button>`).join(""),w=G.map(t=>`<button class="btn ${a.mode===t.id?"on":""}" data-mode="${t.id}">${t.name}</button>`).join("");u.innerHTML=`
    <div class="screen">
      <div class="head">
        <div class="title">Boxhead: Horda</div>
        <div class="badge" style="color:${s}">${o?"Líder ★":A?"En sala":"Sin conexión"}</div>
      </div>

      ${a.phase==="over"?`
        <div class="box">
          <div class="label">Fin de la horda</div>
          <div style="font-size:19px;font-weight:600;margin-bottom:6px">Oleada ${a.wave} · Tu puntaje: ${n?n.score:0}</div>
          ${o?'<button class="btn primary" id="again">Jugar otra vez</button><button class="btn" id="to-lobby" style="width:100%;margin-top:8px">Volver a la sala</button>':'<div style="opacity:0.75">Esperando al líder…</div>'}
        </div>`:""}

      <div class="box">
        <div class="label">Tu personaje</div>
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="name-in" maxlength="14" value="${Z(n?n.name:E)}" placeholder="Tu nombre">
          <button class="btn" id="save-name" style="margin:0 0 0 8px">Guardar</button>
        </div>
        <div class="swatches">${c}</div>
      </div>

      ${o&&a.phase==="lobby"?`
        <div class="box">
          <div class="label">Mapa</div>
          <div class="row">${r}</div>
          <div class="label" style="margin-top:6px">Modo</div>
          <div class="row">${w}<button class="btn ${a.friendlyFire?"on":""}" id="toggle-ff">Fuego amigo: ${a.friendlyFire?"Sí":"No"}</button></div>
          <button class="btn primary" id="start">Empezar oleada</button>
        </div>
        <button class="btn danger" id="exit-game" style="width:100%">Cerrar juego en el proyector</button>
      `:a.phase==="lobby"?`
        <div class="box" style="text-align:center;opacity:0.8">Esperando a que el líder arranque la oleada…</div>
      `:""}
    </div>`;const k=document.getElementById("save-name"),l=document.getElementById("name-in");k&&l&&(k.onclick=()=>{const t=l.value.trim().slice(0,14);if(t){E=t;try{localStorage.setItem("gd.jname",t)}catch{}d({a:"name",name:t})}}),u.querySelectorAll("[data-color]").forEach(t=>{t.onclick=()=>d({a:"color",color:Number(t.dataset.color)})}),u.querySelectorAll("[data-arena]").forEach(t=>{t.onclick=()=>d({a:"arena",arena:t.dataset.arena})}),u.querySelectorAll("[data-mode]").forEach(t=>{t.onclick=()=>d({a:"mode",mode:t.dataset.mode})});const y=document.getElementById("toggle-ff");y&&(y.onclick=()=>d({a:"ff",on:!a.friendlyFire}));const i=document.getElementById("start");i&&(i.onclick=()=>d({a:"start"}));const m=document.getElementById("again");m&&(m.onclick=()=>d({a:"again"}));const x=document.getElementById("to-lobby");x&&(x.onclick=()=>d({a:"lobby"}));const $=document.getElementById("exit-game");$&&($.onclick=()=>d({a:"exit"}))}function ee(){const e=document.getElementById("joy-zone"),o=document.getElementById("stick-knob"),n=46;if(e&&o){const l=(i,m)=>{const x=i-z,$=m-O,t=Math.hypot(x,$),I=Math.min(t,n),v=t>.1?x/t*I:0,g=t>.1?$/t*I:0;C=v/n,R=g/n,o.style.transform=`translate(${v}px, ${g}px)`,p()};e.addEventListener("pointerdown",i=>{i.preventDefault(),L=i.pointerId,e.setPointerCapture(i.pointerId);const m=document.getElementById("stick-base").getBoundingClientRect();z=m.left+m.width*.5,O=m.top+m.height*.5,l(i.clientX,i.clientY)}),e.addEventListener("pointermove",i=>{i.pointerId===L&&(i.preventDefault(),l(i.clientX,i.clientY))});const y=i=>{i.pointerId===L&&(L=null,C=0,R=0,o.style.transform="translate(0px, 0px)",p())};e.addEventListener("pointerup",y),e.addEventListener("pointercancel",y)}const s=document.getElementById("btn-fire");if(s){s.addEventListener("pointerdown",y=>{y.preventDefault(),T=!0,s.classList.add("active"),navigator.vibrate&&navigator.vibrate(12),p()});const l=()=>{T=!1,s.classList.remove("active"),p()};s.addEventListener("pointerup",l),s.addEventListener("pointercancel",l),s.addEventListener("pointerleave",l)}const c=document.getElementById("btn-dash");c&&c.addEventListener("pointerdown",l=>{l.preventDefault(),H=!0,navigator.vibrate&&navigator.vibrate(20),p(),setTimeout(()=>{H=!1,p()},60)});const r=document.getElementById("btn-alt");r&&r.addEventListener("pointerdown",l=>{l.preventDefault(),P=!0,navigator.vibrate&&navigator.vibrate(16),p(),setTimeout(()=>{P=!1,p()},60)});const w=document.getElementById("wep-prev");w&&(w.onclick=()=>d({a:"weapon",dir:-1}));const k=document.getElementById("wep-next");k&&(k.onclick=()=>d({a:"weapon",dir:1}))}function te(e){return`
    <div class="modal">
      <div class="modal-card">
        <div class="title" style="margin-bottom:14px">Menú</div>
        <button class="btn on" id="m-resume">Seguir</button>
        ${e?`
          <button class="btn" id="m-again">Reiniciar oleada</button>
          <button class="btn" id="m-lobby">Volver a la sala</button>
          <button class="btn danger" id="m-exit">Cerrar en el proyector</button>
        `:""}
      </div>
    </div>`}function ne(e){const o=document.getElementById("open-menu");o&&(o.onclick=()=>{f=!0,h(!0)});const n=document.getElementById("m-resume");if(n&&(n.onclick=()=>{f=!1,h(!0)}),e){const s=document.getElementById("m-again");s&&(s.onclick=()=>{f=!1,d({a:"again"})});const c=document.getElementById("m-lobby");c&&(c.onclick=()=>{f=!1,d({a:"lobby"})});const r=document.getElementById("m-exit");r&&(r.onclick=()=>{f=!1,d({a:"exit"})})}}h(!0);
