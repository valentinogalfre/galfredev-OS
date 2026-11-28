import{c as R}from"./link-BlOJfVdo.js";import{h as F,g as H}from"./touch-BGY8oz9L.js";import{C as P,M as D,a as G}from"./protocol-DiP7MmgY.js";F();H();const O=new URLSearchParams(location.hash.slice(1));var T;const y=(T=O.get("r"))!=null?T:"",s=document.getElementById("app"),L=t=>`#${t.toString(16).padStart(6,"0")}`,p=t=>t.replace(/[&<>"']/g,n=>`&#${n.charCodeAt(0)};`);let m=null,g=sessionStorage.getItem(`gd.gravedad.k.${y}`)||"",c=localStorage.getItem("gd.jname")||localStorage.getItem("gd.gravedad.n")||"",a=null,f=!1,d=!1,j=!1,h=!1;const $=R(()=>({t:"join",room:y,name:c||"Jugador",key:g}),t=>{if(t.t==="joined"){m=t.id,g=t.key,c||(c=t.name);try{sessionStorage.setItem(`gd.gravedad.k.${y}`,g)}catch{}l()}else t.t==="all"?(a=t.d,document.body.classList.toggle("playing",a.phase==="play"||a.phase==="count"),l()):t.t==="you"&&t.d.kicked&&(j=!0,l())},t=>{f=t,l()});function o(t){$.send({t:"cmd",d:t})}function N(){$.send({t:"in",s:0,x:0,y:0,b:!1,n:!1,k:!0}),setTimeout(()=>$.send({t:"in",s:0,x:0,y:0,b:!1,n:!1,k:!1}),45),navigator.vibrate&&navigator.vibrate(18),h=!0;const t=document.getElementById("flip-zone");t&&(t.classList.add("hit"),setTimeout(()=>{h=!1,t.classList.remove("hit")},80))}function J(){if(!(!a||m===null))return a.seats.find(t=>t.id===m)}function l(){if(j){s.innerHTML='<div class="screen"><div class="box"><div class="title">Te sacaron de la sala</div><div style="margin-top:8px;opacity:0.75">Escaneá de nuevo el QR si querés volver a entrar.</div></div></div>';return}if(!a){s.innerHTML=`<div class="screen"><div class="box"><div class="title">Gravedad</div><div style="margin-top:8px;opacity:0.75">${f?"Conectando a la sala…":"Buscando el proyector…"}</div></div></div>`;return}const t=m!==null&&a.lead===m,n=J(),i=n?L(n.color):"#38e8ff";if(a.phase==="play"||a.phase==="count"||a.phase==="round"){const e=n?n.alive:!1,w=n?n.dir:1,q=w===1?"▲":"▼",r=[];n!=null&&n.shield&&r.push("Escudo"),n!=null&&n.turbo&&r.push("Turbo"),n&&n.airFlips>0&&r.push(`Doble x${n.airFlips}`);const A=!e&&a.phase==="play"?"#161117":w===1?`linear-gradient(180deg, #0b101c 0%, ${i}33 100%)`:`linear-gradient(0deg, #0b101c 0%, ${i}33 100%)`;s.innerHTML=`
      <div class="pad" style="background:${A}">
        <div class="top-bar">
          <div class="status-chip" style="border-color:${i}">${p(n?n.name:c)} · ${a.meters} m${r.length?` · ${r.join(" · ")}`:""}</div>
          <button class="menu-btn" id="open-menu">Menú</button>
        </div>
        <button class="flip-zone ${h?"hit":""}" id="flip-zone" ${!e&&a.phase==="play"?"disabled":""}>
          <div class="arrow" style="color:${e?i:"#777"}">${a.phase==="count"?"●":e?q:"✕"}</div>
          <div class="flip-text">${a.phase==="count"?"Preparate":a.phase==="round"?"Fin de ronda":e?"Invertir":"Eliminado"}</div>
          <div class="flip-sub">${e?"Tocá en cualquier parte de la pantalla":"Esperando la siguiente ronda"}</div>
        </button>
      </div>
      ${d?V(t):""}`;const M=document.getElementById("flip-zone");M&&a.phase==="play"&&e&&M.addEventListener("pointerdown",C=>{C.preventDefault(),N()}),K(t);return}const u=P.map(e=>`<div class="swatch ${n&&n.color===e?"on":""}" data-color="${e}" style="background:${L(e)}"></div>`).join(""),v=D.map(e=>`<button class="btn ${a.map===e.id?"on":""}" data-map="${e.id}">${e.name}</button>`).join(""),b=G.map(e=>`<button class="btn ${a.mode===e.id?"on":""}" data-mode="${e.id}">${e.name}</button>`).join(""),z=[0,1,2,3,4].map(e=>`<button class="btn ${a.bots===e?"on":""}" data-bots="${e}">${e}</button>`).join("");s.innerHTML=`
    <div class="screen">
      <div class="head">
        <div class="title">Gravedad</div>
        <div class="badge" style="color:${i}">${t?"Líder ★":f?"En sala":"Sin conexión"}</div>
      </div>

      ${a.phase==="over"?`
        <div class="box">
          <div class="label">Resultado</div>
          <div style="font-size:20px;font-weight:600;margin-bottom:8px">${a.winner?`Ganó ${p(a.winner)}`:"Partida terminada"}</div>
          <div style="opacity:0.75;margin-bottom:10px">Distancia: ${a.meters} m · Récord: ${a.record} m</div>
          ${t?'<button class="btn primary" id="again">Jugar otra vez</button><button class="btn" id="to-lobby" style="width:100%;margin-top:8px">Volver a la sala</button>':'<div style="opacity:0.7">Esperando al líder…</div>'}
        </div>`:""}

      <div class="box">
        <div class="label">Tu corredor</div>
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="name-in" maxlength="14" value="${p(n?n.name:c)}" placeholder="Tu nombre">
          <button class="btn" id="save-name" style="margin:0 0 0 8px">Guardar</button>
        </div>
        <div class="swatches">${u}</div>
      </div>

      ${t&&a.phase==="lobby"?`
        <div class="box">
          <div class="label">Mapa</div>
          <div class="row">${v}</div>
          <div class="label" style="margin-top:6px">Modo</div>
          <div class="row">${b}</div>
          <div class="label" style="margin-top:6px">Bots</div>
          <div class="row">${z}</div>
          <button class="btn primary" id="start">Empezar</button>
        </div>
        <button class="btn danger" id="exit-game" style="width:100%">Cerrar juego en el proyector</button>
      `:a.phase==="lobby"?`
        <div class="box" style="text-align:center;opacity:0.8">Esperando a que el líder largue la partida…</div>
      `:""}
    </div>`;const x=document.getElementById("save-name"),E=document.getElementById("name-in");x&&E&&(x.onclick=()=>{const e=E.value.trim().slice(0,14);if(e){c=e;try{localStorage.setItem("gd.jname",e)}catch{}o({a:"name",name:e})}}),s.querySelectorAll("[data-color]").forEach(e=>{e.onclick=()=>o({a:"color",color:Number(e.dataset.color)})}),s.querySelectorAll("[data-map]").forEach(e=>{e.onclick=()=>o({a:"map",map:e.dataset.map})}),s.querySelectorAll("[data-mode]").forEach(e=>{e.onclick=()=>o({a:"mode",mode:e.dataset.mode})}),s.querySelectorAll("[data-bots]").forEach(e=>{e.onclick=()=>o({a:"bots",bots:Number(e.dataset.bots)})});const k=document.getElementById("start");k&&(k.onclick=()=>o({a:"start"}));const B=document.getElementById("again");B&&(B.onclick=()=>o({a:"again"}));const I=document.getElementById("to-lobby");I&&(I.onclick=()=>o({a:"lobby"}));const S=document.getElementById("exit-game");S&&(S.onclick=()=>o({a:"exit"}))}function V(t){return`
    <div class="modal" id="modal">
      <div class="modal-card">
        <div class="title" style="margin-bottom:14px">Menú</div>
        <button class="btn on" id="m-resume">Seguir</button>
        ${t?`
          <button class="btn" id="m-again">Reiniciar partida</button>
          <button class="btn" id="m-lobby">Volver a la sala</button>
          <button class="btn danger" id="m-exit">Cerrar en el proyector</button>
        `:""}
      </div>
    </div>`}function K(t){const n=document.getElementById("open-menu");n&&(n.onclick=()=>{d=!0,l()});const i=document.getElementById("m-resume");if(i&&(i.onclick=()=>{d=!1,l()}),t){const u=document.getElementById("m-again");u&&(u.onclick=()=>{d=!1,o({a:"again"})});const v=document.getElementById("m-lobby");v&&(v.onclick=()=>{d=!1,o({a:"lobby"})});const b=document.getElementById("m-exit");b&&(b.onclick=()=>{d=!1,o({a:"exit"})})}}l();
