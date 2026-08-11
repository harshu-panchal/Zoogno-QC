# Cloudinary to VPS Storage Migration Guide

This document serves as a complete reference guide for how the image storage system was migrated from Cloudinary to a local VPS storage system. It explains the architectural changes and provides the exact steps required to replicate this setup on any new server.

---

## 1. Architectural Overview

### Before (Cloudinary)
1. User uploads an image via the frontend.
2. The Node.js backend processes the request and sends the image buffer to Cloudinary's servers.
3. Cloudinary returns a secure URL (`https://res.cloudinary.com/...`).
4. The database stores the Cloudinary URL.
5. Frontend requests the image directly from Cloudinary.

### After (VPS Storage)
1. User uploads an image via the frontend.
2. The Node.js backend intercepts the image buffer and uses the `sharp` library to automatically resize, compress, and convert the image to the highly efficient `.webp` format.
3. The image is saved locally to the server's hard drive (e.g., `/var/storage/`).
4. The database stores the URL pointing to your own domain (`https://zoogno.com/images/...`).
5. **Nginx** acts as an ultra-fast static file server, intercepting any request to `/images/` and serving the files directly from the hard drive without touching the Node.js backend.

---

## 2. Codebase Modifications (What Changed)

Several key areas in the backend were modified to support this toggleable architecture:

- **`mediaService.js`**: Updated `uploadToCloudinary()` to check `process.env.STORAGE_PROVIDER`. If set to `vps`, it dynamically routes the file to local storage instead of the Cloudinary API. It constructs the public URL using `process.env.API_BASE_URL`.
- **`imageProcessor.js`**: Created this new utility to handle image conversion. It uses `sharp` to apply context-specific resizing (e.g., banners are 1920x1080, profile pics are 400x400) and converts everything to `.webp` at 80% quality.
- **`index.js`**: Added an `express.static` fallback route so that images load properly on `localhost` during local development without needing Nginx.

---

## 3. Server Setup Guide (How to Deploy)

If you ever need to set this up on a new server, follow these exact steps in order.

### Step 1: Install Dependencies
Ensure the required image processing libraries are installed on the server:
```bash
cd ~/Zoogno-QC/backend
npm install multer sharp uuid
```

### Step 2: Configure Environment Variables
Open your backend `.env` file on the production server (`nano ~/Zoogno-QC/backend/.env`) and add the following lines:
```env
# Switch the storage provider from cloudinary to vps
STORAGE_PROVIDER=vps

# The physical path on the Linux server where images will be saved
STORAGE_BASE_PATH=/var/storage

# Your actual public domain name (required for URL generation)
API_BASE_URL=https://zoogno.com
```

### Step 3: Set Up Folder Permissions
Your Node.js process (and Nginx) need permission to read and write to the storage folder.
```bash
# Create the storage directory
sudo mkdir -p /var/storage

# Give ownership to your main user (replace 'root' if running under a different user)
sudo chown -R $USER:$USER /var/storage

# Grant read and execute permissions so Nginx can serve the files
sudo chmod -R 755 /var/storage
```

### Step 4: Configure Nginx
Nginx must be told to intercept `/images/` requests and look inside `/var/storage/`. Open your Nginx config (`sudo nano /etc/nginx/sites-available/default`) and add this block right above your React frontend block:

```nginx
location /images/ {
    alias /var/storage/;
    expires 30d;
    add_header Cache-Control "public, no-transform";
    add_header Access-Control-Allow-Origin "*";
    try_files $uri $uri/ =404;
}
```
Test and restart Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Restart the Backend
Finally, restart PM2 to apply the new `.env` variables and code:
```bash
pm2 restart all
```

---

## 4. Migrating Old Cloudinary Images

If you have existing images on Cloudinary, they need to be moved to the VPS.

1. **Download**: Run `node download-cloudinary.js` on your local machine to download all Cloudinary assets to a local folder.
2. **Upload to VPS**: Use `scp` or an FTP client like FileZilla to upload that folder to `/var/storage/` on your production server.
3. **Database Update**: Run the `scripts/migrateToVps.js` script to loop through your MongoDB database and replace all old `res.cloudinary.com` URLs with your new `zoogno.com/images/` URLs.
