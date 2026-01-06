const mongoose = require('mongoose');

const cocheSchema = new mongoose.Schema({
  precio: { type: Number, required: true },

  // Tipo de vehículo (sustituye a "estado")
  tipo: { type: String, enum: ['coches', 'furgonetas'], required: true },

  // Compatibilidad con documentos antiguos (no usar ya)
  estado: { type: String, enum: ['Como Nuevo', 'Usado', 'Averiado'], required: false },

  marca: { type: String, required: true },
  modelo: { type: String, required: true },
  anio: { type: Number, required: true },
  km: { type: Number, required: true },
  descripcion: { type: String },

  caracteristicas: [String],
  imagenes: [String],        // URLs de Cloudinary

  // ✅ NUEVO: observaciones del vehículo (una por línea en los formularios)
  observaciones: [String],

  fechaSubida: { type: Date, default: Date.now }
});

// Nota: mantengo el nombre del modelo como 'coches' para no romper nada.
module.exports = mongoose.model('coches', cocheSchema);
