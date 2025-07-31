const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://your-frontend-domain.com'], // Add your actual frontend domains
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // Make sure this directory exists
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 10 // Max 10 files
    },
    fileFilter: function (req, file, cb) {
        // Accept images and videos
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed!'), false);
        }
    }
});

// Configure nodemailer
const transporter = nodemailer.createTransporter({
    service: 'gmail', // or your email service
    auth: {
        user: process.env.EMAIL_USER, // Your email
        pass: process.env.EMAIL_PASS  // Your email password or app password
    }
});

// Ensure uploads directory exists
const fs = require('fs');
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'A Cars Backend Server is running!' });
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, number, message } = req.body;

        // Validation
        if (!name || !email || !number || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }

        // Prepare email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'acarsadvisor@gmail.com', // Your business email
            subject: `New Contact Form Submission from ${name}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${number}</p>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <hr>
                <p><em>This message was sent from the A Cars website contact form.</em></p>
            `
        };

        // Send email
        await transporter.sendMail(mailOptions);

        // Send confirmation email to user
        const confirmationMail = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Thank you for contacting A Cars',
            html: `
                <h2>Thank you for your inquiry!</h2>
                <p>Dear ${name},</p>
                <p>We have received your message and will get back to you within 24-48 hours.</p>
                <p><strong>Your message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <br>
                <p>Best regards,<br>A Cars Team</p>
                <hr>
                <p><em>Contact us:</em></p>
                <p>📍 Panchratna, Ground Floor, Office No.2, Opera House, Mumbai 400004</p>
                <p>📧 acarsadvisor@gmail.com</p>
                <p>📞 +91-8928983020</p>
            `
        };

        await transporter.sendMail(confirmationMail);

        res.json({ 
            success: true, 
            message: 'Message sent successfully! We will contact you soon.' 
        });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send message. Please try again later.' 
        });
    }
});

// Sell car form endpoint
app.post('/api/sell-car', upload.array('mediaFiles', 10), async (req, res) => {
    try {
        const { carName, carModel, carDescription } = req.body;
        const files = req.files;

        // Validation
        if (!carName || !carModel || !carDescription) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Word count validation
        const words = carDescription.trim().split(/\s+/).filter(Boolean);
        if (words.length > 250) {
            return res.status(400).json({ 
                success: false, 
                message: 'Description exceeds the maximum word limit of 250 words' 
            });
        }

        if (!files || files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'At least one photo or video is required' 
            });
        }

        // Prepare file information for email
        const fileList = files.map(file => ({
            originalName: file.originalname,
            filename: file.filename,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.mimetype
        }));

        // Prepare email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'acarsadvisor@gmail.com', // Your business email
            subject: `New Car Sale Submission: ${carName} ${carModel}`,
            html: `
                <h2>New Car Sale Submission</h2>
                <p><strong>Car Name:</strong> ${carName}</p>
                <p><strong>Car Model:</strong> ${carModel}</p>
                <p><strong>Description:</strong></p>
                <p>${carDescription.replace(/\n/g, '<br>')}</p>
                <p><strong>Word Count:</strong> ${words.length}/250</p>
                <h3>Uploaded Files (${files.length}):</h3>
                <ul>
                    ${fileList.map(file => `
                        <li>
                            <strong>${file.originalName}</strong><br>
                            File: ${file.filename}<br>
                            Size: ${file.size}<br>
                            Type: ${file.type}
                        </li>
                    `).join('')}
                </ul>
                <hr>
                <p><em>This submission was sent from the A Cars website sell-a-car form.</em></p>
            `,
            attachments: files.map(file => ({
                filename: file.originalname,
                path: file.path
            }))
        };

        // Send email
        await transporter.sendMail(mailOptions);

        res.json({ 
            success: true, 
            message: 'Car details submitted successfully! We will review and contact you soon.',
            data: {
                carName,
                carModel,
                wordCount: words.length,
                filesUploaded: files.length
            }
        });

    } catch (error) {
        console.error('Sell car form error:', error);
        
        // Handle multer errors
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    message: 'File size too large. Maximum 10MB per file.' 
                });
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Too many files. Maximum 10 files allowed.' 
                });
            }
        }

        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit car details. Please try again later.' 
        });
    }
});

// Serve uploaded files (optional - for viewing uploaded files)
app.use('/uploads', express.static('uploads'));

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                message: 'File size too large. Maximum 10MB per file.' 
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ 
                success: false, 
                message: 'Too many files. Maximum 10 files allowed.' 
            });
        }
    }
    
    if (error.message === 'Only image and video files are allowed!') {
        return res.status(400).json({ 
            success: false, 
            message: 'Only image and video files are allowed.' 
        });
    }

    console.error('Server error:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
    });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Endpoint not found' 
    });
});

app.listen(PORT, () => {
    console.log(`A Cars Backend Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/`);
});