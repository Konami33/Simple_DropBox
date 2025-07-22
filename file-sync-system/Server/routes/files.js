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

async function generateS3Url(minioKey) {
  // Generate presigned URL for temporary access
  try {
    const presignedUrl = await minioClient.presignedGetObject(BUCKET_NAME, minioKey, 60 * 60); // 1 hour expiry
    return presignedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    // Fallback to basic URL
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    const bucket = process.env.MINIO_BUCKET || 'filesync-bucket';
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = useSSL ? 'https' : 'http';
    
    return `${protocol}://${endpoint}:${port}/${bucket}/${minioKey}`;
  }
}

// Upload file
router.post('/upload', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { originalname, buffer, mimetype, size } = req.file;
    const { filePath = '/', localUrl } = req.body;
    
    const fileHash = calculateFileHash(buffer);
    const fullPath = path.join(filePath, originalname).replace(/\\/g, '/');
    
    // Check for duplicate file by hash (allow updates)
    const existingFile = await pool.query(
      'SELECT * FROM files WHERE user_id = $1 AND file_hash = $2 AND status = $3',
      [req.user.id, fileHash, 'active']
    );
    
    let fileRecord;
    
    if (existingFile.rows.length > 0) {
      // File with same content already exists
      fileRecord = existingFile.rows[0];
      
      // Update local_url if provided
      if (localUrl && fileRecord.local_url !== localUrl) {
        await pool.query(
          'UPDATE files SET local_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [localUrl, fileRecord.id]
        );
        fileRecord.local_url = localUrl;
      }
      
      res.json({
        message: 'File already exists with identical content',
        file: {
          id: fileRecord.id,
          filename: fileRecord.filename,
          filePath: fileRecord.file_path,
          fileSize: fileRecord.file_size,
          fileHash: fileRecord.file_hash,
          mimeType: fileRecord.mime_type,
          localUrl: fileRecord.local_url,
          s3Url: await generateS3Url(fileRecord.minio_key),
          createdAt: fileRecord.created_at
        }
      });
      return;
    }
    
    const minioKey = generateMinioKey(req.user.id, originalname);
    
    // Upload to MinIO
    await minioClient.putObject(BUCKET_NAME, minioKey, buffer, {
      'Content-Type': mimetype,
      'X-File-Hash': fileHash,
    });
    
    // Generate S3-compatible URL
    const s3Url = await generateS3Url(minioKey);
    
    // Save to database
    const result = await pool.query(`
      INSERT INTO files (user_id, filename, file_path, file_size, file_hash, mime_type, minio_key, local_url, s3_url, upload_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [req.user.id, originalname, fullPath, size, fileHash, mimetype, minioKey, localUrl, s3Url, 'completed']);
    
    fileRecord = result.rows[0];
    
    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileRecord.id,
        filename: fileRecord.filename,
        filePath: fileRecord.file_path,
        fileSize: fileRecord.file_size,
        fileHash: fileRecord.file_hash,
        mimeType: fileRecord.mime_type,
        localUrl: fileRecord.local_url,
        s3Url: fileRecord.s3_url,
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