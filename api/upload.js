const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { authenticate } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'audio');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `aud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// POST /image
router.post('/image', authenticate, (req, res) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    try {
      const filePath = req.file.path;
      const metadata = await sharp(filePath).metadata();

      let resizedPath = filePath;
      if (metadata.width > 800) {
        resizedPath = filePath.replace(/(\.\w+)$/, '-resized$1');
        await sharp(filePath)
          .resize({ width: 800, withoutEnlargement: true })
          .toFile(resizedPath);

        fs.unlinkSync(filePath);
      }

      const db = req.app.get('db');
      const result = db.prepare(
        'INSERT INTO images (filename, original_name, mime_type, size, width, height, file_path, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
      ).run(
        path.basename(resizedPath),
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        metadata.width,
        metadata.height,
        resizedPath,
        req.user.id
      );

      const image = db.prepare('SELECT * FROM images WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(image);
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to process image', details: e.message });
    }
  });
});

// POST /audio
router.post('/audio', authenticate, (req, res) => {
  audioUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    try {
      const db = req.app.get('db');
      const result = db.prepare(
        'INSERT INTO audio_files (filename, original_name, mime_type, size, file_path, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
      ).run(
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.path,
        req.user.id
      );

      const audio = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(audio);
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to save audio', details: e.message });
    }
  });
});

// GET /images
router.get('/images', authenticate, (req, res) => {
  const db = req.app.get('db');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const countRow = db.prepare('SELECT COUNT(*) as total FROM images').get();
  const images = db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({ images, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) });
});

// GET /audio
router.get('/audio', authenticate, (req, res) => {
  const db = req.app.get('db');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const countRow = db.prepare('SELECT COUNT(*) as total FROM audio_files').get();
  const audio = db.prepare('SELECT * FROM audio_files ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({ audio, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) });
});

// DELETE /image/:id
router.delete('/image/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const image = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Image not found' });

  const inUse = db.prepare('SELECT id FROM questions WHERE image_id = ?').get(req.params.id);
  if (inUse) return res.status(400).json({ error: 'Image is in use by a question and cannot be deleted' });

  if (image.file_path && fs.existsSync(image.file_path)) {
    fs.unlinkSync(image.file_path);
  }

  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ message: 'Image deleted' });
});

// DELETE /audio/:id
router.delete('/audio/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const audio = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(req.params.id);
  if (!audio) return res.status(404).json({ error: 'Audio not found' });

  const inUse = db.prepare('SELECT id FROM questions WHERE audio_id = ?').get(req.params.id);
  if (inUse) return res.status(400).json({ error: 'Audio is in use by a question and cannot be deleted' });

  if (audio.file_path && fs.existsSync(audio.file_path)) {
    fs.unlinkSync(audio.file_path);
  }

  db.prepare('DELETE FROM audio_files WHERE id = ?').run(req.params.id);
  res.json({ message: 'Audio deleted' });
});

module.exports = router;
