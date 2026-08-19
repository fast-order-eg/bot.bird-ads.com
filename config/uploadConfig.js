import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Upload directory
const uploadDir = path.join(__dirname, '../public/uploads/instructions');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration - store in memory for Sharp processing
const storage = multer.memoryStorage();

// File filter - accept only images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed.'), false);
    }
};

// Multer upload instance
export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
});

// Compress and save image using Sharp
export const compressAndSaveImage = async (file) => {
    try {
        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const filename = `instruction_${timestamp}_${randomString}.jpg`;
        const filepath = path.join(uploadDir, filename);

        // Compress and save
        await sharp(file.buffer)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toFile(filepath);

        // Return relative URL path
        return `/uploads/instructions/${filename}`;
    } catch (error) {
        console.error('Image compression error:', error);
        throw new Error('Failed to compress and save image');
    }
};

// Delete image file
export const deleteImage = (imageUrl) => {
    try {
        if (!imageUrl) return;

        const filename = path.basename(imageUrl);
        const filepath = path.join(uploadDir, filename);

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            console.log(`✅ Deleted image: ${filename}`);
        }
    } catch (error) {
        console.error('Image deletion error:', error);
    }
};
