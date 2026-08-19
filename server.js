import express from 'express';
import session from 'express-session';
import { restoreSessions, checkSubscriptionExpiry, checkPauseTimer, checkInactivitySummary } from './controllers/botController.js';
// ... (imports)

// ... (code)

// ... (imports continued)

import passport from 'passport';
import flash from 'connect-flash';
import { createServer } from 'http';
import { Server } from 'socket.io';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';


import sequelize from './config/database.js';
import passportConfig from './config/passport.js';
import User from './models/User.js';
import Message from './models/Message.js';
import Conversation from './models/Conversation.js';
import Campaign from './models/Campaign.js';
import Instruction from './models/Instruction.js';
import MessengerPage from './models/MessengerPage.js';
import MessengerConversation from './models/MessengerConversation.js';
import SimulationMessage from './models/SimulationMessage.js';
import TeachMessage from './models/TeachMessage.js';
import Product from './models/Product.js';
import InteractiveButton from './models/InteractiveButton.js';

// Routes
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import apiDashboardRoutes from './routes/api_dashboard.js';
import dashboardRoutes from './routes/dashboard.js';
import messengerRoutes from './routes/messenger.js';

dotenv.config({ override: true });

// ====== منع وقوع السيرفر من Baileys أو أي unhandled errors ======
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Server] Unhandled Rejection (muted to prevent crash):', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ [Server] Uncaught Exception (muted to prevent crash):', err?.message || err);
});



// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Enable proxy trust for correct rate limiting behind Cloudflare/Nginx
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:3001"], // Allow Next.js
        methods: ["GET", "POST"]
    }
});

// CORS Middleware for Express
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin === 'http://localhost:3000' || origin === 'http://localhost:3001')) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Make io accessible in routes
app.set('socketio', io);

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Global Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 requests per windowMs
    message: "Too many requests from this IP, please try again after 15 minutes",
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
}));

// Passport
passportConfig(passport);
app.use(passport.initialize());
app.use(passport.session());

// Flash
app.use(flash());

// Global Middleware for Views
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/api/bot', apiDashboardRoutes);
app.use('/', messengerRoutes); // Messenger Webhook + Dashboard routes

app.use((err, req, res, next) => {
    console.error('⚠️ [Server Error Handled]', err.stack);
    res.status(500).send('Something broke. System error.');
});


// Socket.io
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`Client joined room: ${room}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Database & Start
const PORT = process.env.PORT || 3005;

// Database Sync
sequelize.sync().then(async () => {
    console.log('Database synced (with alter)');

    // Create Super Admin if not exists
    const adminExists = await User.findOne({ where: { role: 'super_admin' } });
    if (!adminExists) {
        await User.create({
            username: 'admin',
            password: 'admin123', // Change this!
            role: 'super_admin'
        });
        console.log('Super Admin created: admin / admin123');
    }

    httpServer.listen(PORT, () => {
        console.log(`🚀 [V6_SIGNATURE] Server running on http://localhost:${PORT}`);
        // ⚠️ تم التفعيل بناءً على طلبك لتعمل على السيرفر (ممكن توقفها محلياً لو بتعمل تيست)
        restoreSessions(io);

        // Initial Checks
        checkSubscriptionExpiry(io);
        checkPauseTimer(io);

        // Schedule Checks every 1 hour (Subscription)
        setInterval(() => {
            checkSubscriptionExpiry(io);
        }, 60 * 60 * 1000);

        // Schedule Checks every 1 minute (Pause Timer)
        setInterval(() => {
            checkPauseTimer(io);
        }, 60 * 1000);

        // Schedule Inactivity Summary every 1 minute
        setInterval(() => {
            checkInactivitySummary();
        }, 60 * 1000);
    });
}).catch(err => {
    console.error('Database connection failed:', err);
});
