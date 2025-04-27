require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const QRCode = require('qrcode');
const path = require('path');

// Cấu hình Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer lưu ảnh lên Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const studentId = req.body.studentId;
        return {
            folder: 'students',
            public_id: studentId, // Lưu ảnh với studentId làm public_id
            resource_type: 'image', // Chỉ định ảnh
        };
    },
});
const upload = multer({ storage: storage });

// Cho phép serve file tĩnh
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Trang chính chiếu ảnh
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Trang upload ảnh
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
    const studentId = req.body.studentId;
    if (!studentId || !req.file) {
        return res.status(400).json({ message: 'Missing studentId or file' });
    }

    const imageUrl = req.file.path;
    const domain = req.get('host');
    const protocol = req.protocol;
    const qrLink = `${protocol}://${domain}/student/${studentId}`;

    try {
        const qrImageBase64 = await QRCode.toDataURL(qrLink, {
            width: 600,
            margin: 1,
        });

        const qrUploadResult = await cloudinary.uploader.upload(qrImageBase64, {
            folder: 'qr_codes',
            public_id: studentId,
            resource_type: 'image',
            transformation: [
                { width: 600, height: 600, crop: 'fit' }
            ]
        });

        const qrImageUrl = qrUploadResult.secure_url;

        // Trả về HTML động
        const html = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Upload thành công</title>
          <link rel="stylesheet" href="/css/styles.css">
        </head>
        <body>
          <header>
            <h1>Upload thành công!</h1>
          </header>
          <div class="success-container">
            <p class="success-message">Ảnh học sinh đã được upload thành công!</p>
            <p><strong>Ảnh học sinh:</strong></p>
            <img src="${imageUrl}" alt="Student Image" width="300">
            <div class="qr-section">
              <p><strong>QR Code:</strong></p>
              <img src="${qrImageUrl}" alt="QR Code">
            </div>
            <a class="return-home" href="/">Về trang chủ</a>
          </div>
        </body>
        </html>
      `;

        res.send(html);

    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi tạo QR code hoặc lưu QR lên Cloudinary');
    }
});

app.get('/student/:id', (req, res) => {
    const studentId = req.params.id;
    console.log(`QR scanned: Student ID ${studentId}`);

    const imageUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/students/${studentId}.jpg`;

    io.emit('newStudent', imageUrl);

    res.send('<h2>✅ Thành công! Ảnh học sinh đã chiếu trên màn hình.</h2>');
});

// Socket.io
io.on('connection', (socket) => {
    console.log('Client connected');
});

// Server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
