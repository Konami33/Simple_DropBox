# Simple DropBox with Merkle Tree

A file synchronization system built with **Merkle Trees** for efficient change detection and state tracking. This system implements a client-server architecture where files are stored in S3-compatible storage (MinIO) and metadata is tracked using Merkle Trees.

## 🏗️ Architecture Overview

### **Merkle Tree Implementation**
- **Leaf Nodes**: Represent individual files with metadata (filename, local_url, s3_url, hash, size, timestamp)
- **Internal Nodes**: Hash combination of child nodes for integrity verification
- **Root Hash**: Single hash representing the entire directory state

### **Technology Stack**
- **Backend**: Node.js, Express.js, PostgreSQL, MinIO
- **Client**: Node.js, Chokidar (file watching), Merkle Tree implementation
- **Storage**: MinIO (S3-compatible object storage)
- **Database**: PostgreSQL for metadata and Merkle Tree storage

## 🔄 File Upload Workflow

### Step-by-Step Process:

1. **Client adds/uploads a file**
2. **Client updates its local Merkle tree**
   - Leaf node created or updated
   - Local file URL added (local disk path)
   - `s3_url` is empty initially
3. **Client uploads the file to S3**
   - On success: receive `s3_url`
4. **Client updates the corresponding leaf node**
   - Now the leaf contains both `local_url` and `s3_url`
5. **Client recalculates hashes up to the root**
6. **Client sends the updated tree to the metadata server**
   - Server receives: Hash updates, S3 URL, Metadata (timestamp, size, etc.)

> ✅ **Important**: Until `s3_url` is present, the file is considered **not yet uploaded**.

## 📁 Leaf Node Structure

Each **leaf node (file)** in the Merkle tree contains:

```json
{
  "filename": "notes.txt",
  "local_url": "/local/path/to/notes.txt",
  "s3_url": "http://localhost:9000/filesync-bucket/users/user-id/files/file-id/notes.txt",
  "hash": "a1b2c3...",
  "size": 2048,
  "timestamp": "2025-07-22T18:20:00Z",
  "mime_type": "text/plain"
}
```

## 🎯 Responsibilities

| Component | Responsibilities |
|-----------|-----------------|
| **Client** | - Upload files to S3<br>- Maintain Merkle Tree JSON<br>- Update leaf nodes with `s3_url`<br>- Send updates to metadata server |
| **Server** | - Store metadata (Merkle tree or diffs)<br>- Sync detection<br>- Notify clients of changes |
| **Leaf Node** | - Must contain: `local_url`, `s3_url`, `hash`, `timestamp`, etc. |
| **Merkle Tree** | - Used for fast change detection and file state verification |
| **S3 Bucket** | - Stores actual file contents |
| **Sync Condition** | - File is "uploaded" only when `s3_url` is present |

## 🚀 Quick Start

### 1. Start the Infrastructure

```bash
cd file-sync-system
docker-compose up -d
```

This starts:
- PostgreSQL database (port 5432)
- MinIO object storage (port 9000, console 9001)

### 2. Setup the Server

```bash
cd Server
npm install
npm run migrate  # Run database migrations
npm start       # Start the server
```

### 3. Setup the Client

```bash
cd Client
npm install
npm start       # Start the file sync client
```

### 4. Try the Merkle Tree Example

```bash
cd Client
npm run merkle-example
```

## 📊 Database Schema

### New Tables for Merkle Tree Support:

#### `merkle_trees`
- `id` (UUID) - Primary key
- `user_id` (UUID) - User reference
- `device_id` (VARCHAR) - Device identifier
- `root_hash` (VARCHAR) - Current root hash
- `tree_data` (JSONB) - Complete tree structure
- `version` (INTEGER) - Tree version number

#### Updated `files` table:
- Added `local_url` - Local file path
- Added `s3_url` - S3 storage URL
- Added `upload_status` - Upload completion status

## 🌳 Merkle Tree Features

### **Core Operations**
- `addOrUpdateFile()` - Add/update file in tree
- `updateS3Url()` - Update S3 URL after upload
- `removeFile()` - Remove file from tree
- `isFileUploaded()` - Check if file has S3 URL
- `getRootHash()` - Get current root hash
- `getDifferences()` - Compare two trees

### **File States**
- `getPendingUploads()` - Files without S3 URLs
- `getUploadedFiles()` - Files with S3 URLs
- `getAllFiles()` - All files in tree

### **Persistence**
- `toJSON()` - Export tree to JSON
- `fromJSON()` - Import tree from JSON
- Auto-save to `.merkle-tree.json`

## 🔄 Sync Process

### **Traditional vs Merkle Tree Sync**

**Before (Traditional):**
- Periodic timestamp-based sync
- Download all changed files
- No integrity verification

**After (Merkle Tree):**
- Hash-based change detection
- Only sync actual differences
- Built-in integrity verification
- Efficient conflict resolution

### **Sync Algorithm**
1. Client sends local tree root hash
2. Server compares with stored tree
3. If different, calculate differences
4. Client downloads only changed files
5. Trees are synchronized

## 🔧 Configuration

### Environment Variables

**Server (.env):**
```bash
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=filesync
DB_USER=postgres
DB_PASSWORD=password
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=filesync-bucket
JWT_SECRET=your-secret-key
```

**Client (.env):**
```bash
API_BASE_URL=http://localhost:3000/api
USER_EMAIL=test@example.com
USER_PASSWORD=password123
WATCH_DIRECTORY=./sync-folder
DEVICE_ID=laptop-001
SYNC_INTERVAL=30000
```

## 🔍 API Endpoints

### **Merkle Tree Endpoints**
- `POST /api/merkle/update` - Update tree on server
- `GET /api/merkle/tree` - Get tree from server
- `POST /api/merkle/diff` - Get tree differences
- `GET /api/merkle/devices` - List all device trees

### **File Operations**
- `POST /api/files/upload` - Upload file with Merkle metadata
- `GET /api/files/:id/download` - Download file
- `GET /api/files` - List files
- `DELETE /api/files/:id` - Delete file

## 🧪 Testing

### **Run Examples**
```bash
# Basic upload/download
npm run upload
npm run download

# Merkle Tree demonstration
npm run merkle-example
```

### **Manual Testing**
1. Add files to `sync-folder`
2. Watch console for Merkle Tree updates
3. Check `.merkle-tree.json` for tree state
4. Verify S3 URLs after upload

## 📈 Benefits of Merkle Tree Implementation

1. **Efficient Sync**: Only transfer actual changes
2. **Integrity Verification**: Built-in hash verification
3. **Conflict Detection**: Easy to identify differences
4. **State Tracking**: Complete file system state in one hash
5. **Multi-Device Support**: Each device maintains its own tree
6. **Offline Capability**: Trees can be compared when reconnected

## 🔮 Future Enhancements

- [ ] Delta sync for large files
- [ ] Conflict resolution strategies
- [ ] Tree compression for large directories
- [ ] Real-time sync with WebSockets
- [ ] Cross-device tree merging
- [ ] File versioning integration

## 📝 License

MIT License - see LICENSE file for details.