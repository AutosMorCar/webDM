require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch(err => console.error("❌ Error de conexión:", err));
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs'); // opcional

const Coche = require('./models/coche');
const { storage } = require('./cloudinary'); // Multer + Cloudinary
const upload = multer({ storage });

// ✅ Cloudinary y helper al PRINCIPIO
const { v2: cloudinary } = require('cloudinary');
// Si usas CLOUDINARY_URL no hace falta configurar aquí.
// cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });

function getPublicIdFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    const i = parts.indexOf('upload');
    if (i === -1) return null;
    const pathAfterUpload = parts.slice(i + 1).join('/');
    return pathAfterUpload.replace(/\.[^.]+$/, ''); // quita extensión
  } catch {
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'carmazon-clave-supersecreta',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,            // en producción con HTTPS: true y sameSite:'none'
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// 2️⃣ Home explícito
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intro.html'));
});

// 3️⃣ Página ficha coche (evita fallback raro al recargar)
app.get('/coche.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'coche.html'));
});

// 🔐 LOGIN
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === 'admin' && password === 'Madrid@18') {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Credenciales incorrectas' });
});
app.get('/api/logged', (req, res) => res.json({ admin: !!req.session.admin }));
app.get('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// 🚗 GET todos los coches
app.get('/api/coches', async (req, res) => {
  try {
    const coches = await Coche.find().sort({ fechaSubida: -1 });
    res.json(coches);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener los coches" });
  }
});

// 🚗 GET coche por ID
app.get('/api/coches/:id', async (req, res) => {
  try {
    const coche = await Coche.findById(req.params.id);
    if (!coche) return res.status(404).json({ error: "Coche no encontrado" });
    res.json(coche);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener el coche" });
  }
});

// 🚗 POST nuevo coche (con Cloudinary) + OBSERVACIONES
app.post('/api/coches', upload.array('imagenes'), async (req, res) => {
  const caracteristicas = req.body.caracteristicas
    ? req.body.caracteristicas.split(",").map(c => c.trim()).filter(Boolean)
    : [];

  // ✅ Observaciones: admite separar por líneas o comas
  const observaciones = req.body.observaciones
    ? req.body.observaciones
        .split(/\r?\n/g)
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  // ✅ compatibilidad con "estado" pero mapeando a PLURAL (enum)
  const tipo = req.body.tipo || (req.body.estado ? 'coches' : undefined);

  const nuevoCoche = new Coche({
    marca: req.body.marca,
    modelo: req.body.modelo,
    precio: parseFloat(req.body.precio),
    anio: parseInt(req.body.anio),
    km: parseInt(req.body.km),
    tipo, // 'coches' | 'furgonetas'
    descripcion: req.body.descripcion || "",
    caracteristicas,
    observaciones, // ← NUEVO
    imagenes: (req.files || []).map(f => f.path)
  });

  try {
    await nuevoCoche.save();
    res.status(201).json({ mensaje: "Coche guardado correctamente con Cloudinary" });
  } catch (err) {
    console.error("❌ Error al guardar coche:", err);
    res.status(500).json({ error: "No se pudo guardar el coche" });
  }
});

// ✏️ PUT editar coche (eliminar, reordenar y añadir imágenes) + OBSERVACIONES
app.put('/api/coches/:id', upload.array('imagenes'), async (req, res) => {
  if (!req.session.admin) return res.status(403).json({ error: "Solo el admin puede editar" });

  try {
    const coche = await Coche.findById(req.params.id);
    if (!coche) return res.status(404).json({ error: "Coche no encontrado" });

    const {
      marca, modelo, precio, anio, km, tipo, descripcion,
      caracteristicas, observaciones // ← NUEVO
    } = req.body;

    if (marca !== undefined) coche.marca = marca;
    if (modelo !== undefined) coche.modelo = modelo;
    if (precio !== undefined) coche.precio = parseFloat(precio);
    if (anio !== undefined) coche.anio = parseInt(anio);
    if (km !== undefined) coche.km = parseInt(km);
    if (tipo !== undefined) coche.tipo = tipo; // 'coches' | 'furgonetas'
    if (descripcion !== undefined) coche.descripcion = descripcion;

    if (caracteristicas !== undefined) {
      coche.caracteristicas = caracteristicas
        ? caracteristicas.split(",").map(c => c.trim()).filter(Boolean)
        : [];
    }

    // ✅ Observaciones en edición
    if (observaciones !== undefined) {
      coche.observaciones = observaciones
        ? observaciones
            .split(/\r?\n/g)
            .map(s => s.trim())
            .filter(Boolean)
        : [];
    }

    // 1) Eliminar imágenes marcadas
    const removeImages = Array.isArray(req.body.removeImages)
      ? req.body.removeImages
      : (req.body.removeImages ? [req.body.removeImages] : []);
    for (const url of removeImages) {
      const pid = getPublicIdFromUrl(url);
      if (pid) {
        try { await cloudinary.uploader.destroy(pid); }
        catch (e) { console.warn("No se pudo borrar en Cloudinary:", e.message); }
      }
      coche.imagenes = coche.imagenes.filter(u => u !== url);
    }

    // 2) Reordenar (manteniendo solo las que queden)
    const order = Array.isArray(req.body.order)
      ? req.body.order
      : (req.body.order ? [req.body.order] : null);
    if (order && order.length) {
      const actuales = new Set(coche.imagenes);
      const ordenadas = order.filter(u => actuales.has(u));
      const restantes = coche.imagenes.filter(u => !ordenadas.includes(u));
      coche.imagenes = [...ordenadas, ...restantes];
    }

    // 3) Añadir nuevas
    if (req.files && req.files.length > 0) {
      coche.imagenes.push(...req.files.map(f => f.path));
    }

    await coche.save();
    res.json({ ok: true, coche });
  } catch (err) {
    console.error("❌ Error al editar coche:", err);
    res.status(500).json({ error: "No se pudo editar el coche" });
  }
});

// 🗑 DELETE coche (borrando imágenes de Cloudinary)
app.delete('/api/coches/:id', async (req, res) => {
  if (!req.session.admin) return res.status(403).json({ error: "Solo el admin puede eliminar" });

  try {
    const coche = await Coche.findById(req.params.id);
    if (!coche) return res.status(404).json({ error: "Coche no encontrado" });

    for (const url of (coche.imagenes || [])) {
      const pid = getPublicIdFromUrl(url);
      if (pid) {
        try { await cloudinary.uploader.destroy(pid); }
        catch (e) { console.warn("No se pudo borrar en Cloudinary:", e.message); }
      }
    }

    await coche.deleteOne();
    res.json({ mensaje: "Coche eliminado correctamente" });
  } catch (err) {
    console.error("❌ Error al eliminar coche:", err);
    res.status(500).json({ error: "No se pudo eliminar el coche" });
  }
});

// 📩 CONTACTO FICHA DE COCHE
app.post('/api/contacto', multer().none(), async (req, res) => {
  const { nombre, email, telefono, mensaje, coche } = req.body;
  if (!nombre || !email || !mensaje || !coche) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'd.m.automocion25@gmail.com', pass: 'tjlu mrzv lwqr zrnz' }
  });
  const mailOptions = {
    from: 'd.m.automocion25@gmail.com',
    to: 'd.m.automocion25@gmail.com',
    subject: `📩 Consulta sobre el coche: ${coche} de ${nombre}`,
    html: `
      <h3>Consulta de contacto</h3>
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Teléfono:</strong> ${telefono || 'No proporcionado'}</p>
      <p><strong>Anuncio:</strong> ${coche}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${mensaje}</p>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error enviando correo:", err);
    res.status(500).json({ error: "Error al enviar el correo" });
  }
});

// 📩 FORMULARIO DE BÚSQUEDA DE COCHE
app.post('/api/buscocoche', multer().none(), async (req, res) => {
  const { nombre, email, telefono, mensaje } = req.body;
  if (!nombre || !email || !mensaje) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'd.m.automocion25@gmail.com', pass: 'tjlu mrzv lwqr zrnz' }
  });
  const mailOptions = {
    from: 'd.m.automocion25@gmail.com',
    to: 'd.m.automocion25@gmail.com',
    subject: `📥 Nueva solicitud personalizada - ${nombre}`,
    html: `
      <h3>Un usuario está buscando un coche</h3>
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Teléfono:</strong> ${telefono || 'No proporcionado'}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${mensaje}</p>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error enviando búsqueda personalizada:", err);
    res.status(500).json({ error: "Error al enviar el correo" });
  }
});

// 👂 Escuchar SIEMPRE al final
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en http://localhost:${PORT}`);
});
