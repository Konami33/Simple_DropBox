// client/lib/file-watcher.js
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const api = require('./api');
const config = require('../config');

let watcher = null;
let uploadQueue = new Set();
let isProcessing = false;

function shouldIgnoreFile(filePath) {
  const basename = path.basename(filePath);
  
  const ignorePatterns = [
    /^\./,          // Hidden files
    /~$/,           // Temp files
    /\.tmp$/,       // Temp files
    /\.log$/,       // Log files
    /node_modules/, // Dependencies
    /\.git/         // Git files
  ];
  
  return ignorePatterns.some(pattern => pattern.test(basename) || pattern.test(filePath));
}

async function handleFileChange(filePath, eventType) {
  if (shouldIgnoreFile(filePath)) {
    return;
  }
  
  const relativePath = path.relative(config.WATCH_DIRECTORY, filePath);
  console.log(`📁 File ${eventType}: ${relativePath}`);
  
  if (eventType === 'add' || eventType === 'change') {
    queueUpload(filePath);
  }
}

function queueUpload(filePath) {
  const relativePath = path.relative(config.WATCH_DIRECTORY, filePath);
  uploadQueue.add(relativePath);
  
  // Process queue after a short delay (debouncing)
  setTimeout(processUploadQueue, 1000);
}

async function processUploadQueue() {
  if (isProcessing || uploadQueue.size === 0) {
    return;
  }
  
  isProcessing = true;
  console.log(`🔄 Processing ${uploadQueue.size} queued files...`);
  
  const files = Array.from(uploadQueue);
  uploadQueue.clear();
  
  for (const relativePath of files) {
    try {
      const fullPath = path.join(config.WATCH_DIRECTORY, relativePath);
      
      // Check if file still exists
      if (!await fs.pathExists(fullPath)) {
        continue;
      }
      
      // Upload file
      const remotePath = path.dirname(relativePath);
      await api.uploadFile(fullPath, remotePath === '.' ? '/' : remotePath);
      
      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`❌ Failed to upload ${relativePath}:`, error.message);
    }
  }
  
  isProcessing = false;
}

async function startWatcher() {
  // Ensure directory exists
  await fs.ensureDir(config.WATCH_DIRECTORY);
  
  console.log(`👀 Watching directory: ${config.WATCH_DIRECTORY}`);
  
  watcher = chokidar.watch(config.WATCH_DIRECTORY, {
    ignored: shouldIgnoreFile,
    persistent: true,
    ignoreInitial: true, // Don't process existing files
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });
  
  watcher
    .on('add', (filePath) => handleFileChange(filePath, 'add'))
    .on('change', (filePath) => handleFileChange(filePath, 'change'))
    .on('unlink', (filePath) => {
      const relativePath = path.relative(config.WATCH_DIRECTORY, filePath);
      console.log(`🗑️ File deleted locally: ${relativePath}`);
    })
    .on('error', (error) => console.error('❌ Watcher error:', error))
    .on('ready', () => console.log('✅ File watcher ready'));
}

async function stopWatcher() {
  if (watcher) {
    await watcher.close();
    console.log('⏹️ File watcher stopped');
  }
}

module.exports = {
  startWatcher,
  stopWatcher,
  processUploadQueue
};