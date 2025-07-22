// client/lib/api.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let authToken = null;

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

async function authenticate() {
  try {
    // Try login first
    const response = await api.post('/auth/login', {
      email: config.USER_EMAIL,
      password: config.USER_PASSWORD
    });
    authToken = response.data.token;
    console.log('✅ Logged in successfully');
    return response.data;
  } catch (error) {
    console.log('🔄 Login failed, trying registration...');
    try {
      const response = await api.post('/auth/register', {
        email: config.USER_EMAIL,
        password: config.USER_PASSWORD
      });
      authToken = response.data.token;
      console.log('✅ Registered successfully');
      return response.data;
    } catch (regError) {
      console.error('❌ Authentication failed:', regError.response?.data?.error || regError.message);
      throw regError;
    }
  }
}

async function uploadFile(filePath, remotePath = '/') {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('filePath', remotePath);

    const response = await api.post('/files/upload', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(`📤 Uploaded: ${path.basename(filePath)}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Upload failed for ${filePath}:`, error.response?.data?.error || error.message);
    throw error;
  }
}

async function downloadFile(fileId, savePath) {
  try {
    // Get download URL
    const urlResponse = await api.get(`/files/${fileId}/download`);
    const { downloadUrl, file } = urlResponse.data;

    // Download file
    const fileResponse = await axios.get(downloadUrl, {
      responseType: 'stream'
    });

    // Ensure directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save file
    const writeStream = fs.createWriteStream(savePath);
    fileResponse.data.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log(`📥 Downloaded: ${file.filename}`);
        resolve({ file, savePath });
      });
      writeStream.on('error', reject);
    });
  } catch (error) {
    console.error('❌ Download failed:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function listFiles(filePath = '/') {
  try {
    const response = await api.get('/files', {
      params: { path: filePath, limit: 100 }
    });
    return response.data.files;
  } catch (error) {
    console.error('❌ List files failed:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function deleteFile(fileId) {
  try {
    await api.delete(`/files/${fileId}`);
    console.log('🗑️ File deleted');
  } catch (error) {
    console.error('❌ Delete failed:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function initSync(deviceId, lastSyncAt) {
  try {
    const payload = { deviceId };
    
    if (lastSyncAt) {
      payload.lastSyncAt = lastSyncAt;
    }
    
    const response = await api.post('/sync/init', payload);
    return response.data;
  } catch (error) {
    console.error('❌ Sync init failed:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function completeSync(sessionId) {
  try {
    const response = await api.post(`/sync/${sessionId}/complete`);
    return response.data;
  } catch (error) {
    console.error('❌ Sync complete failed:', error.response?.data?.error || error.message);
    throw error;
  }
}

module.exports = {
  authenticate,
  uploadFile,
  downloadFile,
  listFiles,
  deleteFile,
  initSync,
  completeSync
};
