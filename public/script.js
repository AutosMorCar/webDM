let isAdmin = false;
let cochesCache = [];
let fileList = [];

/* =========================
   UTILIDADES
========================= */
function norm(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function actualizarTextoArchivos() {
  const label = document.querySelector("label[for='imagenes']");
  if (!label) return;

  if (fileList.length === 0) {
    label.textContent = "Elegir archivos";
  } else {
    label.textContent = `Elegidos ${fileList.length} archivo${fileList.length > 1 ? "s" : ""}`;
  }
}

/* =========================
   SESIÓN
========================= */
async function comprobarSesion() {
  try {
    const res = await fetch("/api/logged", { credentials: "include" });
    const data = await res.json();

    isAdmin = !!data.admin;

    document.getElementById("login-btn")?.style.setProperty(
      "display",
      isAdmin ? "none" : "inline-block"
    );
    document.getElementById("logout-btn")?.style.setProperty(
      "display",
      isAdmin ? "inline-block" : "none"
    );
    document.getElementById("form-wrapper")?.style.setProperty(
      "display",
      isAdmin ? "block" : "none"
    );
  } catch (e) {
    console.error("❌ Error comprobando sesión", e);
  }
}

async function loginAdmin() {
  const usuario = document.getElementById("usuario").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, password }),
    credentials: "include"
  });

  if (res.ok) {
    location.reload();
  } else {
    document.getElementById("login-error").innerText =
      "Usuario o contraseña incorrectos";
  }
}

async function cerrarSesion() {
  await fetch("/api/logout", { credentials: "include" });
  location.reload();
}

function mostrarLogin() {
  document.getElementById("login-modal")?.style.setProperty("display", "flex");
}

function ocultarLogin() {
  document.getElementById("login-modal")?.style.setProperty("display", "none");
}

/* =========================
   CARGA COCHES
========================= */
async function cargarCoches() {
  const res = await fetch("/api/coches");
  cochesCache = await res.json();
}

function rellenarFiltroMarcas() {
  const select = document.getElementById("filtro-marca");
  if (!select) return;

  const valorActual = select.value;

  select.innerHTML = `<option value="">Todas</option>`;

  // marcas únicas normalizadas
  const mapaMarcas = new Map();

  cochesCache.forEach(c => {
    if (!c.marca) return;
    const normalizada = norm(c.marca); // audi
    if (!mapaMarcas.has(normalizada)) {
      mapaMarcas.set(normalizada, c.marca.trim()); // Audi (bonita)
    }
  });

  [...mapaMarcas.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([key, label]) => {
      const opt = document.createElement("option");
      opt.value = key;      // audi
      opt.textContent = label; // Audi
      select.appendChild(opt);
    });

  if ([...select.options].some(o => o.value === valorActual)) {
    select.value = valorActual;
  }
}

/* =========================
   RENDER COCHES
========================= */
function renderizarFiltrado() {
  const contenedor = document.getElementById("resultados");
  if (!contenedor) return;

  const tipo = document.getElementById("filtro-tipo")?.value || "";
  const marca = document.getElementById("filtro-marca")?.value || "";
  const q = norm(document.getElementById("filtro-buscar")?.value || "");
  const precioMin = Number(document.getElementById("filtro-precio-min")?.value || 0);
  const precioMax = Number(document.getElementById("filtro-precio-max")?.value || Infinity);

  contenedor.innerHTML = "";

  cochesCache
    .filter(c => {
      const texto = norm(`${c.marca} ${c.modelo} ${c.descripcion || ""}`);
      const precio = Number(c.precio) || 0;

      return (
        (!tipo || c.tipo === tipo) &&
        (!marca || norm(c.marca) === marca) &&
        (!q || texto.includes(q)) &&
        precio >= precioMin &&
        precio <= precioMax
      );
    })
    .forEach(coche => {
      const div = document.createElement("div");
      div.className = "coche";

      div.innerHTML = `
    <img src="${(coche.imagenes?.[0] || "").replace(/^http:\/\//, "https://")}">
  <div class="info">
    <h3>${coche.marca} ${coche.modelo}</h3>
    <p><strong>Año:</strong> ${coche.anio}</p>
    <p><strong>Kilómetros:</strong> ${Number(coche.km).toLocaleString()} km</p>
    <p class="precio">${Number(coche.precio).toLocaleString()} €</p>

    <div class="acciones-coche">
      <a href="coche.html?id=${coche._id}" class="ver-detalles">
        Ver detalles
      </a>
    </div>
  </div>
`;

if (isAdmin) {
  const btn = document.createElement("button");
  btn.textContent = "Eliminar";
  btn.className = "eliminar-coche";
  btn.onclick = async () => {
    if (!confirm("¿Eliminar coche?")) return;
    const res = await fetch(`/api/coches/${coche._id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (res.ok) {
      await cargarCoches();
      renderizarFiltrado();
    }
  };

  div.querySelector(".acciones-coche").appendChild(btn);
}

contenedor.appendChild(div);

    });
}

/* =========================
   FILTROS
========================= */
function activarFiltros() {
  [
    "filtro-tipo",
    "filtro-marca",
    "filtro-buscar",
    "filtro-precio-min",
    "filtro-precio-max"
  ].forEach(id =>
    document.getElementById(id)?.addEventListener("input", renderizarFiltrado)
  );

  document.getElementById("filtro-reset")?.addEventListener("click", () => {
    document.querySelectorAll("input, select").forEach(i => (i.value = ""));
    renderizarFiltrado();
  });
}

/* =========================
   ALTA COCHE + IMÁGENES
========================= */
function activarAltaCoche() {
  const input = document.getElementById("imagenes");
  const preview = document.getElementById("preview");
  const form = document.getElementById("form-coche");

  if (!input || !preview || !form) return;

  input.addEventListener("change", () => {
  fileList = Array.from(input.files); // sincroniza
  renderPreview();
});

  function renderPreview() {
    preview.innerHTML = "";
    actualizarTextoArchivos();

    fileList.forEach((file, index) => {
      const wrap = document.createElement("div");
      wrap.style.position = "relative";
      wrap.style.display = "inline-block";
      wrap.style.cursor = "grab";
      wrap.draggable = true;

      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.style.width = "120px";
      img.style.height = "80px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "6px";

      const del = document.createElement("button");
      del.textContent = "×";
      del.style.position = "absolute";
      del.style.top = "4px";
      del.style.right = "4px";
      del.style.background = "red";
      del.style.color = "white";
      del.style.border = "none";
      del.style.borderRadius = "50%";
      del.style.cursor = "pointer";

      del.onclick = () => {
        fileList.splice(index, 1);
        renderPreview();
      };

      wrap.addEventListener("dragstart", e =>
        e.dataTransfer.setData("text/plain", index)
      );

      wrap.addEventListener("dragover", e => e.preventDefault());

      wrap.addEventListener("drop", e => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        const to = index;
        if (from === to) return;
        const moved = fileList.splice(from, 1)[0];
        fileList.splice(to, 0, moved);
        renderPreview();
      });

      wrap.append(img, del);
      preview.appendChild(wrap);
    });
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const fd = new FormData();

// campos normales
fd.append("marca", form.marca.value);
fd.append("modelo", form.modelo.value);
fd.append("precio", form.precio.value);
fd.append("anio", form.anio.value);
fd.append("km", form.km.value);
fd.append("tipo", form.tipo.value);
fd.append("descripcion", form.descripcion.value);
fd.append("caracteristicas", form.caracteristicas.value);
fd.append("observaciones", form.observaciones.value);

// 🔥 IMÁGENES EN EL ORDEN REAL
fileList.forEach(file => {
  fd.append("imagenes", file);
});

    const res = await fetch("/api/coches", {
      method: "POST",
      body: fd,
      credentials: "include"
    });

    if (res.ok) {
      alert("Coche subido correctamente ✅");
      form.reset();
      fileList = [];
      preview.innerHTML = "";
      actualizarTextoArchivos();
      await cargarCoches();
      renderizarFiltrado();
    } else {
      alert("❌ Error al subir coche");
    }
  });
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  await comprobarSesion();
  await cargarCoches();
  rellenarFiltroMarcas();
  activarFiltros();
  activarAltaCoche();
  renderizarFiltrado();
});
