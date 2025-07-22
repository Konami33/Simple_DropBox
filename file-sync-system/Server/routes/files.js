// routes/files.js
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const authMiddleware = require('../middleware/auth');
const pool = require('../config/database');
const { minioClient, BUCKET_NAME } = require('../config/minio');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function generateMinioKey(userId, filename) {
  const fileId = uuidv4();
  return `users/${userId}/files/${fileId}/${filename}`;
}

// Upload file
router.post('/upload', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { originalname, buffer, mimetype, size } = req.file;
    const { filePath = '/' } = req.body;
    
    const fileHash = calculateFileHash(buffer);
    const fullPath = path.join(filePath, originalname).replace(/\\/g, '/');
    
    // Check for duplicate file
    const existingFile = await pool.query(
      'SELECT * FROM files WHERE user_id = $1 AND file_path = $2 AND status = $3',
      [req.user.id, fullPath, 'active']
    );
    
    if (existingFile.rows.length > 0) {
      return res.status(409).json({ error: 'File already exists at this path' });
    }
    
    const minioKey = generateMinioKey(req.user.id, originalname);
    
    // Upload to MinIO
    await minioClient.putObject(BUCKET_NAME, minioKey, buffer, {
      'Content-Type': mimetype,
      'X-File-Hash': fileHash,
    });
    
    // Save to database
    const result = await pool.query(`
      INSERT INTO files (user_id, filename, file_path, file_size, file_hash, mime_type, minio_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, originalname, fullPath, size, fileHash, mimetype, minioKey]);
    
    const fileRecord = result.rows[0];
    
    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileRecord.id,
        filename: fileRecord.filename,
        filePath: fileRecord.file_path,
        fileSize: fileRecord.file_size,
        fileHash: fileRecord.file_hash,
        mimeType: fileRecord.mime_type,
        createdAt: fileRecord.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get download URL
router.get('/:fileId/download', authMiddleware, async (req, res, next) => {
  try {
    const { fileId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM files WHERE id = $1 AND user_id = $2 AND status = $3',
      [fileId, req.user.id, 'active']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = result.rows[0];
    
    const downloadUrl = await minioClient.presignedGetObject(
      BUCKET_NAME,
      file.minio_key,
      24 * 60 * 60
    );
    
    res.json({
      file: {
        id: file.id,
        filename: file.filename,
        filePath: file.file_path,
        fileSize: file.file_size,
        mimeType: file.mime_type
      },
      downloadUrl
    });
  } catch (error) {
    next(error);
  }
});

// List files
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { path: filePath = '/', limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT id, filename, file_path, file_size, file_hash, mime_type, created_at, updated_at
      FROM files 
      WHERE user_id = $1 AND status = $2
    `;
    const params = [req.user.id, 'active'];
    
    if (filePath !== '/') {
      query += ' AND file_path LIKE $3';
      params.push(`${filePath}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    res.json({
      files: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete file
router.delete('/:fileId', authMiddleware, async (req, res, next) => {
  try {
    const { fileId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM files WHERE id = $1 AND user_id = $2 AND status = $3',
      [fileId, req.user.id, 'active']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = result.rows[0];
    
    // Delete from MinIO
    await minioClient.removeObject(BUCKET_NAME, file.minio_key);
    
    // Mark as deleted
    await pool.query(
      'UPDATE files SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['deleted', fileId]
    );
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;