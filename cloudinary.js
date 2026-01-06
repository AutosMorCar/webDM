const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: 'dnqt4mzzc',
  api_key: '366255546587916',
  api_secret: 'ExAsvGqwbRt2mzVtB42mG9dx2Eo'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'dm_automocion', // Las imágenes se guardarán en esta carpeta en Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

module.exports = {
  cloudinary,
  storage
};
