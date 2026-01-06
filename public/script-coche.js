document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || id.length < 10) {
    document.body.innerHTML = "<h2 style='text-align:center; color:red;'>❌ ID inválido</h2>";
    return;
  }

  // ¿Es admin?
  let isAdmin = false;
  try {
    const r = await fetch("/api/logged", { credentials: "include" });
    const d = await r.json();
    isAdmin = !!d.admin;
  } catch {}

  // Carga coche por ID
  let coche;
  try {
    const res = await fetch(`/api/coches/${id}`);
    if (!res.ok) throw new Error("No encontrado");
    coche = await res.json();
  } catch (err) {
    console.error("❌ Error cargando coche:", err);
    document.body.innerHTML = "<h2 style='text-align:center; color:red;'>❌ Coche no encontrado</h2>";
    return;
  }

  // Título y campos ocultos para formularios de contacto
  document.title = `${coche.marca} ${coche.modelo} | Carmazon`;
  const nombreCoche = `${coche.marca} ${coche.modelo}`;
  const inputCoche = document.getElementById("coche-modal-nombre");
  if (inputCoche) inputCoche.value = nombreCoche;
  const hidden = document.getElementById("coche-hidden");
  if (hidden) hidden.value = nombreCoche;

  // Info coche
  const info = document.getElementById("info");
  info.innerHTML = `
    <h2>${coche.marca} ${coche.modelo}</h2>
    <p><strong>Precio:</strong> ${(coche.precio ?? 0).toLocaleString()} €</p>
    <p><strong>Año:</strong> ${coche.anio ?? "N/A"}</p>
    <p><strong>Kilómetros:</strong> ${Number(coche.km ?? coche.kilometros ?? 0).toLocaleString()} km</p>

    ${(() => {
      const lista = Array.isArray(coche.caracteristicas)
        ? coche.caracteristicas
        : (coche.caracteristicas || "").split(",");
      if (!lista.length || !lista[0]?.trim()) return "";
      return `
  <div class="lista-caracteristicas">
    ${
      lista
        .map(car => car.trim())
        .filter(Boolean)
        .map(car => `<span class="caracteristica">${car}</span>`)
        .join("")
    }
  </div>`;

    })()}

    ${(() => {
      const obsArray = Array.isArray(coche.observaciones)
        ? coche.observaciones
        : (coche.observaciones || "")
          .split(/\r?\n/g)          // 👈 SOLO salto de línea
          .map(o => o.trim())
          .filter(Boolean);

      if (!obsArray.length) return "";

      return `
  <div style="margin-top:22px;">
    <h3 style="margin:0 0 10px 0; font-size:18px; color:#fff;">Observaciones</h3>
    <div class="lista-caracteristicas">
      ${obsArray.map(o => `<span class="caracteristica">${o}</span>`).join("")}
    </div>
  </div>
`;
    })()}
  `;

  // Galería (Swiper)
  const imagenesWrap = document.getElementById("imagenes");
  (coche.imagenes || []).forEach(url => {
    const slide = document.createElement("div");
    slide.className = "swiper-slide";
    slide.innerHTML = `<img src="${url}" alt="Imagen del coche">`;
    imagenesWrap.appendChild(slide);
  });
  new Swiper(".swiper-container", {
    loop: true,
    slidesPerView: 1,
    spaceBetween: 10,
    pagination: { el: ".swiper-pagination", clickable: true },
    navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" }
  });

  // ====== EDICIÓN (solo admin) ======
  const btnEditar = document.getElementById("btn-editar");
  const modal = document.getElementById("editar-modal");
  const formEditar = document.getElementById("form-editar");
  const editarClose = document.getElementById("editar-close");
  const gal = document.getElementById("editar-galeria");

  // Dibuja la galería del modal con DnD + check de eliminar
  function renderGaleria(urls) {
    if (!gal) return;
    gal.innerHTML = "";
    urls.forEach(url => {
      const item = document.createElement("div");
      item.className = "thumb";
      item.draggable = true;
      item.dataset.url = url;
      item.style.cssText = "position:relative;width:90px;height:70px;border-radius:6px;overflow:hidden;border:1px solid #333;flex:0 0 auto;";


      item.innerHTML = `
        <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
        <label style="position:absolute;left:6px;bottom:6px;background:#a00;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px;cursor:pointer;">
          <input type="checkbox" name="removeImages" value="${url}" style="margin-right:4px;"> eliminar
        </label>
      `;

      // Drag and drop
      item.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", url);
      });
      item.addEventListener("dragover", e => e.preventDefault());
      item.addEventListener("drop", e => {
        e.preventDefault();
        const fromUrl = e.dataTransfer.getData("text/plain");
        const toUrl = item.dataset.url;
        const a = coche.imagenes.indexOf(fromUrl);
        const b = coche.imagenes.indexOf(toUrl);
        if (a > -1 && b > -1 && a !== b) {
          const moved = coche.imagenes.splice(a, 1)[0];
          coche.imagenes.splice(b, 0, moved);
          renderGaleria(coche.imagenes);
        }
      });

      gal.appendChild(item);
    });
  }

  if (isAdmin && btnEditar && modal && formEditar) {
    btnEditar.style.display = "inline-block";

    // Abrir modal con datos precargados + galería editable
    btnEditar.addEventListener("click", () => {
      formEditar.marca.value = coche.marca || "";
      formEditar.modelo.value = coche.modelo || "";
      formEditar.precio.value = coche.precio || "";
      formEditar.anio.value = coche.anio || "";
      formEditar.km.value = coche.km || "";
      formEditar.tipo.value = coche.tipo || "";
      formEditar.descripcion.value = coche.descripcion || "";
      formEditar.caracteristicas.value = Array.isArray(coche.caracteristicas)
        ? coche.caracteristicas.join(", ")
        : coche.caracteristicas || "";

      // ✅ Observaciones al abrir el modal
      const obsField = document.getElementById("editar-observaciones");
      if (obsField) {
        obsField.value = Array.isArray(coche.observaciones)
          ? coche.observaciones.join("\n")
          : coche.observaciones || "";
      }

      renderGaleria([...(coche.imagenes || [])]);
      modal.style.display = "flex";
    });

    editarClose.addEventListener("click", () => (modal.style.display = "none"));
    modal.addEventListener("click", e => {
      if (e.target === modal) modal.style.display = "none";
    });

    // Enviar PUT con order + removeImages + archivos nuevos
    formEditar.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(formEditar);

      // ✅ AÑADIR IMÁGENES NUEVAS AL FORMData
const nuevasImagenes = document.getElementById("editar-imagenes");
if (nuevasImagenes && nuevasImagenes.files.length > 0) {
  Array.from(nuevasImagenes.files).forEach(file => {
    fd.append("imagenes", file);
  });
}

      // Construye 'order' con las URLs que permanecen (excluyendo las marcadas para eliminar)
      const marcadas = new Set(
        Array.from(
          formEditar.querySelectorAll('input[name="removeImages"]:checked')
        ).map(inp => inp.value)
      );
      (coche.imagenes || [])
        .filter(u => !marcadas.has(u))
        .forEach(u => fd.append("order", u));

      try {
        const res = await fetch(`/api/coches/${id}`, {
          method: "PUT",
          body: fd,
          credentials: "include"
        });
        if (res.ok) {
          alert("✅ Anuncio actualizado");
          location.reload();
        } else {
          const t = await res.text();
          alert("❌ Error al actualizar: " + t);
        }
      } catch (err) {
        console.error(err);
        alert("❌ Error de conexión");
      }
    });
  }
});

// ===== CONTACTO MODAL =====
window.mostrarFormularioContacto = function () {
  const overlay = document.getElementById("contacto-overlay");
  if (overlay) overlay.style.display = "flex";
};
window.ocultarFormularioContacto = function () {
  const overlay = document.getElementById("contacto-overlay");
  if (overlay) overlay.style.display = "none";
};
window.mostrarModalCoche = function (nombreCoche) {
  const modal = document.getElementById("contacto-modal-coche");
  const input = document.getElementById("coche-modal-nombre");
  if (modal && input) {
    modal.style.display = "flex";
    input.value = nombreCoche;
  }
};
window.ocultarModalCoche = function () {
  const modal = document.getElementById("contacto-modal-coche");
  if (modal) modal.style.display = "none";
};

// Formularios de contacto
const formCoche = document.getElementById("formulario-coche-modal");
if (formCoche) {
  formCoche.addEventListener("submit", async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    try {
      const res = await fetch("/api/contacto", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        alert("✅ Consulta enviada correctamente.");
        this.reset();
        ocultarModalCoche();
      } else {
        alert("❌ Error al enviar la consulta.");
      }
    } catch (err) {
      console.error("❌ Error al enviar:", err);
      alert("❌ Error de conexión con el servidor.");
    }
  });
}

const formBusqueda = document.getElementById("form-contacto-header");
if (formBusqueda) {
  formBusqueda.addEventListener("submit", async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    try {
      const res = await fetch("/api/buscocoche", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        alert("✅ Tu solicitud ha sido enviada correctamente.");
        this.reset();
        window.ocultarFormularioContacto?.();
      } else {
        alert("❌ Error al enviar la solicitud.");
      }
    } catch (err) {
      console.error("❌ Error al enviar:", err);
      alert("❌ Error de conexión con el servidor.");
    }
  });
}